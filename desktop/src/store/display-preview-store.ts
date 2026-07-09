import { create } from "zustand";
import { useSocketStore } from "./socket-store";

export type DisplayContent = {
  kind: "verse" | "song";
  text: string;
  book?: string;
  chapter?: number;
  verse?: number;
  title?: string;
};

type DisplayPreviewState = {
  content: DisplayContent | null;
  blackedOut: boolean;
};

function isConfirmedContent(message: unknown): message is DisplayContent & { action: "confirm" } {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.action === "confirm" && typeof candidate.text === "string";
}

function isBlackoutMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).action === "blackout";
}

export function displayCaption(content: DisplayContent): string | null {
  if (content.kind === "verse" && content.book) {
    return `${content.book} ${content.chapter}:${content.verse}`;
  }
  return content.kind === "song" ? (content.title ?? null) : null;
}

// Every window in this app (operator console, projector display) opens its
// own WS connection to the same backend and receives the same broadcasts --
// so mirroring "what's actually on screen" into the operator console needs
// no new backend plumbing, just re-deriving it here from the same
// {action:"confirm"/"blackout"} messages DisplayWindow.tsx derives its own
// content from, so the operator can see a live thumbnail without needing a
// second monitor to check the projector directly.
export const useDisplayPreviewStore = create<DisplayPreviewState>()(() => ({
  content: null,
  blackedOut: false,
}));

useSocketStore.subscribe((state, prev) => {
  if (state.lastMessage === prev.lastMessage) return;
  const message = state.lastMessage;
  if (isConfirmedContent(message)) {
    useDisplayPreviewStore.setState({ content: message, blackedOut: false });
  } else if (isBlackoutMessage(message)) {
    useDisplayPreviewStore.setState({ blackedOut: true });
  }
});
