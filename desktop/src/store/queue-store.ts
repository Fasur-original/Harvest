import { create } from "zustand";
import { isReadingQueueMessage, isSongQueueMessage, type ReadingQueueData, type SongQueueData } from "../lib/ws-messages";
import { useMatchStore } from "./match-store";
import { useSocketStore } from "./socket-store";

const API_BASE = "http://localhost:8000";

type QueueState = {
  readingQueue: ReadingQueueData | null;
  songQueue: SongQueueData | null;
  error: string | null;

  fetchReadingQueue: () => Promise<void>;
  fetchSongQueue: () => Promise<void>;

  // Verse queue actions
  jumpToVerse: (book: string, chapter: number, verse: number, translation: string) => Promise<void>;
  editReadingQueueEntry: (entryId: number, book: string, chapter: number, verse: number) => Promise<string | null>;
  clearReadingQueue: () => Promise<void>;

  // Song queue actions
  jumpToSong: (songId: number) => Promise<void>;
  jumpToSongLine: (songId: number, title: string, lineNumber: number, text: string) => void;
  addSongToQueue: (songId: number) => Promise<string | null>;
  removeSongQueueEntry: (entryId: number) => Promise<void>;
  clearSongQueue: () => Promise<void>;
};

// Both queues are backend-authoritative (DB-backed, unlike the ephemeral
// suggestion/candidate state in match-store) -- this store's job is mostly
// to mirror what the backend already knows, fetching fresh on init/mount
// and staying in sync via the same WS messages the live matching pipeline
// broadcasts, so an operator confirming a queue entry from any page updates
// every page reading from this store, not just the one that triggered it.
export const useQueueStore = create<QueueState>((set, get) => ({
  readingQueue: null,
  songQueue: null,
  error: null,

  fetchReadingQueue: async () => {
    const res = await fetch(`${API_BASE}/reading-queue/active`);
    if (res.ok) set({ readingQueue: await res.json() });
  },

  fetchSongQueue: async () => {
    const res = await fetch(`${API_BASE}/song-queue/active`);
    if (res.ok) set({ songQueue: await res.json() });
  },

  jumpToVerse: async (book, chapter, verse, translation) => {
    set({ error: null });
    const params = new URLSearchParams({ book, chapter: String(chapter), verse: String(verse), translation });
    const res = await fetch(`${API_BASE}/bible/verse?${params}`);
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    const verseData = await res.json();
    // The backend's confirm handler is what actually moves the queue's "now
    // reading" pointer -- this doesn't duplicate that logic client-side.
    useMatchStore.getState().confirm({ kind: "verse", ...verseData });
  },

  editReadingQueueEntry: async (entryId, book, chapter, verse) => {
    const res = await fetch(`${API_BASE}/reading-queue/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book, chapter, verse }),
    });
    if (!res.ok) {
      return res.status === 404 ? "That reference doesn't exist" : `Error ${res.status}`;
    }
    set({ readingQueue: await res.json() });
    return null;
  },

  clearReadingQueue: async () => {
    set({ error: null });
    const res = await fetch(`${API_BASE}/reading-queue/clear`, { method: "POST" });
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    set({ readingQueue: null });
  },

  jumpToSong: async (songId) => {
    set({ error: null });
    const res = await fetch(`${API_BASE}/songs/${songId}`);
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    const detail = await res.json();
    const firstLine = detail.lines[0];
    if (!firstLine) {
      set({ error: "This song has no lines yet." });
      return;
    }
    get().jumpToSongLine(detail.id, detail.title, firstLine.line_number, firstLine.line_text);
  },

  jumpToSongLine: (songId, title, lineNumber, text) => {
    useMatchStore.getState().confirm({
      kind: "song",
      song_id: songId,
      line_number: lineNumber,
      title,
      text,
    });
  },

  addSongToQueue: async (songId) => {
    const res = await fetch(`${API_BASE}/song-queue/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId }),
    });
    if (res.ok) set({ songQueue: await res.json() });
    return res.ok ? null : `Error ${res.status}`;
  },

  removeSongQueueEntry: async (entryId) => {
    set({ error: null });
    const res = await fetch(`${API_BASE}/song-queue/entries/${entryId}`, { method: "DELETE" });
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    set((s) => (s.songQueue ? { songQueue: { ...s.songQueue, entries: s.songQueue.entries.filter((e) => e.id !== entryId) } } : s));
  },

  clearSongQueue: async () => {
    set({ error: null });
    const res = await fetch(`${API_BASE}/song-queue/clear`, { method: "POST" });
    if (!res.ok) {
      set({ error: `Error ${res.status}` });
      return;
    }
    set({ songQueue: null });
  },
}));

useSocketStore.subscribe((state, prev) => {
  if (state.lastMessage === prev.lastMessage) return;
  const message = state.lastMessage;

  if (isReadingQueueMessage(message)) {
    const { id, entries, current_entry_id } = message;
    useQueueStore.setState({ readingQueue: { id, entries, current_entry_id } });
  }

  if (isSongQueueMessage(message)) {
    const { id, entries, current_entry_id, current_line_number } = message;
    useQueueStore.setState({ songQueue: { id, entries, current_entry_id, current_line_number } });
  }
});
