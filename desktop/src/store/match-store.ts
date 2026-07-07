import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isCandidatesMessage,
  isNoMatchMessage,
  isSongCandidatesMessage,
  isSongSuggestionMessage,
  isSuggestionMessage,
  isTranscriptMessage,
  type Candidate,
  type ConfirmablePayload,
  type MatchSuggestion,
} from "../lib/ws-messages";
import { useSocketStore } from "./socket-store";

const MAX_TRANSCRIPT_LINES = 20;

type MatchState = {
  transcriptLines: string[];
  verseSuggestion: MatchSuggestion | null;
  verseCandidates: Candidate[] | null;
  songSuggestion: MatchSuggestion | null;
  songCandidates: Candidate[] | null;
  clearVerseSuggestion: () => void;
  clearVerseCandidates: () => void;
  clearSongSuggestion: () => void;
  clearSongCandidates: () => void;
  // Sends a confirm action over the socket and clears whatever's pending on
  // both tracks -- confirming anything (a suggestion, a ranked candidate, a
  // queue entry, a manual search result) means a decision has been made, so
  // nothing stale should linger tempting a second, contradictory click.
  confirm: (payload: ConfirmablePayload) => void;
};

// Live-service state, not per-page UI state -- a zustand store instead of
// component state so any page can read/clear it without prop drilling, and
// switching pages never resets it (previously this was React state lifted
// to OperatorConsole; the store replaces that in-memory lift entirely).
// Only `transcriptLines` persists across a full reload (zustand's `persist`
// middleware, `partialize`d to just that field) -- the pending
// suggestion/candidates deliberately do not, since both are tied to a
// specific moment of live speech that's already passed by the time a reload
// happens, and restoring one after a restart risks the operator confirming
// something stale mid-service.
export const useMatchStore = create<MatchState>()(
  persist(
    (set) => ({
      transcriptLines: [],
      verseSuggestion: null,
      verseCandidates: null,
      songSuggestion: null,
      songCandidates: null,
      clearVerseSuggestion: () => set({ verseSuggestion: null }),
      clearVerseCandidates: () => set({ verseCandidates: null }),
      clearSongSuggestion: () => set({ songSuggestion: null }),
      clearSongCandidates: () => set({ songCandidates: null }),
      confirm: (payload) => {
        useSocketStore.getState().send({ action: "confirm", ...payload });
        set({ verseSuggestion: null, verseCandidates: null, songSuggestion: null, songCandidates: null });
      },
    }),
    {
      name: "harvest:match-store",
      partialize: (state) => ({ transcriptLines: state.transcriptLines }),
    },
  ),
);

useSocketStore.subscribe((state, prev) => {
  if (state.lastMessage === prev.lastMessage) return;
  const message = state.lastMessage;

  if (isTranscriptMessage(message)) {
    useMatchStore.setState((s) => ({
      transcriptLines: [...s.transcriptLines.slice(-(MAX_TRANSCRIPT_LINES - 1)), message.text],
    }));
  }

  if (isSuggestionMessage(message)) {
    useMatchStore.setState({ verseSuggestion: message });
  } else if (isNoMatchMessage(message)) {
    // The operator clearly tried to name a reference just now and it didn't
    // resolve -- clear a stale pending suggestion rather than leaving it
    // looking like it corresponds to what was just said.
    useMatchStore.setState({ verseSuggestion: null });
  }

  if (isCandidatesMessage(message)) {
    useMatchStore.setState({ verseCandidates: message.candidates });
  } else if (isNoMatchMessage(message)) {
    useMatchStore.setState({ verseCandidates: null });
  }

  if (isSongSuggestionMessage(message)) {
    useMatchStore.setState({ songSuggestion: message });
  }

  if (isSongCandidatesMessage(message)) {
    useMatchStore.setState({ songCandidates: message.candidates });
  }
});
