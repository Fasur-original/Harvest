import { create } from "zustand";

const API_BASE = "http://localhost:8000";

type SongSummary = { id: number; title: string };
type ActiveService = { id: number; default_translation: string | null; songs: SongSummary[] };

type ServiceState = {
  defaultTranslation: string;
  activeService: ActiveService | null;
  error: string | null;
  setDefaultTranslation: (t: string) => void;
  fetchActiveService: () => Promise<void>;
  startService: () => Promise<void>;
  clearService: () => Promise<void>;
};

export const useServiceStore = create<ServiceState>((set, get) => ({
  defaultTranslation: "",
  activeService: null,
  error: null,

  setDefaultTranslation: (t) => set({ defaultTranslation: t }),

  fetchActiveService: async () => {
    // Picks up a service already started before this window was opened
    // (e.g. the app was closed and reopened mid-service) rather than
    // showing a blank "no active service" state that doesn't match reality.
    const res = await fetch(`${API_BASE}/service/active`);
    if (!res.ok) return;
    const data = await res.json();
    set({ activeService: data, defaultTranslation: data.default_translation ?? "" });
  },

  startService: async () => {
    set({ error: null });
    const songIds = get().activeService?.songs.map((s) => s.id) ?? [];
    const res = await fetch(`${API_BASE}/service/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_ids: songIds, default_translation: get().defaultTranslation || null }),
    });
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    set({ activeService: await res.json() });
  },

  clearService: async () => {
    set({ error: null });
    const res = await fetch(`${API_BASE}/service/clear`, { method: "POST" });
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    set({ activeService: null });
  },
}));
