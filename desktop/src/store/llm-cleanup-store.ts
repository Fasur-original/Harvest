import { create } from "zustand";
import { isLlmCleanupStatusMessage, type LlmCleanupStatus } from "../lib/ws-messages";
import { useSocketStore } from "./socket-store";

const API_BASE = "http://localhost:8000";

type LlmCleanupState = LlmCleanupStatus & {
  fetchStatus: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
};

// The "AI cleanup" live/idle indicator's data source -- separate from
// useSocketStore's `connected` (that's the WS connection itself; this is
// whether the LLM classification step is currently able to run at all:
// manually toggled off, auto-disabled for low RAM at startup, or mid-timeout
// from its last call).
export const useLlmCleanupStore = create<LlmCleanupState>((set) => ({
  enabled: true,
  manual_enabled: true,
  auto_disabled_reason: null,
  last_call_timed_out: false,

  fetchStatus: async () => {
    const res = await fetch(`${API_BASE}/llm-cleanup/status`);
    if (res.ok) set(await res.json());
  },

  setEnabled: async (enabled) => {
    const res = await fetch(`${API_BASE}/llm-cleanup/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) set(await res.json());
  },
}));

useSocketStore.subscribe((state, prev) => {
  if (state.lastMessage === prev.lastMessage) return;
  if (isLlmCleanupStatusMessage(state.lastMessage)) {
    const { type: _type, ...status } = state.lastMessage;
    useLlmCleanupStore.setState(status);
  }
});
