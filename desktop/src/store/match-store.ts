import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isCandidatesMessage,
  isNoMatchMessage,
  isSongCandidatesMessage,
  isSongSuggestionMessage,
  isSuggestionMessage,
  isTranscriptMessage,
  isTranslationComparisonMessage,
  type Candidate,
  type ConfirmablePayload,
  type MatchSuggestion,
  type TranslationComparisonData,
} from "../lib/ws-messages";
import { useSocketStore } from "./socket-store";

const MAX_TRANSCRIPT_LINES = 20;
// A cap, not a design target -- pending cards are meant to be confirmed or
// skipped quickly, this just bounds memory if an operator steps away.
const MAX_PENDING_ITEMS = 10;
const PERSIST_KEY = "harvest:match-store";

export type PendingMatch = MatchSuggestion & { id: number };

let nextPendingId = 1;

function removeById(list: PendingMatch[], id: number): PendingMatch[] {
  return list.filter((item) => item.id !== id);
}

type MatchState = {
  transcriptLines: string[];

  // Ordered queues, not a single replaced value -- a chunk can produce
  // several matches in sequence (multiple verses, a song, or both via the
  // LLM cleanup step's batch classification), and the operator needs to see
  // everything waiting, not just whatever arrived most recently.
  verseSuggestions: PendingMatch[];
  songSuggestions: PendingMatch[];
  // Confirms or skips one specific card without disturbing the rest of its
  // queue.
  confirmItem: (variant: "verse" | "song", item: PendingMatch) => void;
  skipItem: (variant: "verse" | "song", id: number) => void;

  // Ranked candidates ("pick one of these readings for this one utterance")
  // are a different concept from the pending queues above -- mutually
  // exclusive alternatives for a single thing said, not independent items --
  // so they stay a single replaced value, unchanged from before.
  verseCandidates: Candidate[] | null;
  verseCandidatesSourceText: string | null;
  songCandidates: Candidate[] | null;
  songCandidatesSourceText: string | null;
  clearVerseCandidates: () => void;
  clearSongCandidates: () => void;

  // "Show me the strongest/clearest rendering of this" -- every translation
  // loaded for one identified verse, ranked by similarity to what was said.
  // A single replaced value like the candidate lists above (one comparison
  // request in flight at a time), not a queue -- there's nothing to
  // "confirm one and leave the rest pending" here, the operator picks one
  // translation and the rest are simply not what they picked.
  translationComparison: TranslationComparisonData | null;
  clearTranslationComparison: () => void;

  // Generic one-shot confirm for everything that isn't a pending card --
  // a manual search result, a ranked-candidate pick, a reading/song queue
  // jump. Also clears every pending card and candidate list on both tracks,
  // since confirming anything means a decision has been made and nothing
  // stale should linger tempting a second, contradictory click.
  confirm: (payload: ConfirmablePayload) => void;
};

// Live-service state, not per-page UI state -- a zustand store instead of
// component state so any page can read/clear it without prop drilling, and
// switching pages never resets it. Only `transcriptLines` persists across a
// full reload (zustand's `persist` middleware, `partialize`d to just that
// field) -- pending matches and candidates deliberately do not, since both
// are tied to a specific moment of live speech that's already passed by the
// time a reload happens, and restoring one after a restart risks the
// operator confirming something stale mid-service.
export const useMatchStore = create<MatchState>()(
  persist(
    (set) => ({
      transcriptLines: [],
      verseSuggestions: [],
      songSuggestions: [],
      verseCandidates: null,
      verseCandidatesSourceText: null,
      songCandidates: null,
      songCandidatesSourceText: null,

      confirmItem: (variant, item) => {
        const { id, ...payload } = item;
        useSocketStore.getState().send({ action: "confirm", ...payload });
        set((s) =>
          variant === "verse"
            ? { verseSuggestions: removeById(s.verseSuggestions, id) }
            : { songSuggestions: removeById(s.songSuggestions, id) },
        );
      },
      skipItem: (variant, id) =>
        set((s) =>
          variant === "verse"
            ? { verseSuggestions: removeById(s.verseSuggestions, id) }
            : { songSuggestions: removeById(s.songSuggestions, id) },
        ),

      clearVerseCandidates: () => set({ verseCandidates: null, verseCandidatesSourceText: null }),
      clearSongCandidates: () => set({ songCandidates: null, songCandidatesSourceText: null }),

      translationComparison: null,
      clearTranslationComparison: () => set({ translationComparison: null }),

      confirm: (payload) => {
        useSocketStore.getState().send({ action: "confirm", ...payload });
        // Only clear the track this confirmation actually belongs to --
        // confirming a verse (including a reading-queue jump) shouldn't wipe
        // out pending song suggestions still waiting on the other track, and
        // vice versa. Clearing used to be unconditional here, which made
        // clicking a reading/song-queue entry look like it randomly cleared
        // unrelated queue cards.
        if (payload.kind === "verse") {
          set({
            verseSuggestions: [],
            verseCandidates: null,
            verseCandidatesSourceText: null,
            translationComparison: null,
          });
        } else {
          set({ songSuggestions: [], songCandidates: null, songCandidatesSourceText: null });
        }
      },
    }),
    {
      name: PERSIST_KEY,
      partialize: (state) => ({ transcriptLines: state.transcriptLines }),
    },
  ),
);

// Only the transcript persists across a reload (see the store comment
// above) -- so it's the only thing that can go stale from one service to
// the next if left in localStorage. Called from App.tsx when the operator
// window is closing, so the next launch always starts from a clean
// transcript instead of showing last service's leftover lines.
export function clearPersistedTranscript(): void {
  localStorage.removeItem(PERSIST_KEY);
  useMatchStore.setState({ transcriptLines: [] });
}

useSocketStore.subscribe((state, prev) => {
  if (state.lastMessage === prev.lastMessage) return;
  const message = state.lastMessage;

  if (isTranscriptMessage(message)) {
    useMatchStore.setState((s) => ({
      transcriptLines: [...s.transcriptLines.slice(-(MAX_TRANSCRIPT_LINES - 1)), message.text],
    }));
  }

  if (isSuggestionMessage(message)) {
    useMatchStore.setState((s) => ({
      verseSuggestions: [...s.verseSuggestions, { ...message, id: nextPendingId++ }].slice(-MAX_PENDING_ITEMS),
    }));
  }

  if (isSongSuggestionMessage(message)) {
    useMatchStore.setState((s) => ({
      songSuggestions: [...s.songSuggestions, { ...message, id: nextPendingId++ }].slice(-MAX_PENDING_ITEMS),
    }));
  }

  if (isCandidatesMessage(message)) {
    useMatchStore.setState({
      verseCandidates: message.candidates,
      verseCandidatesSourceText: message.source_text ?? null,
    });
  } else if (isNoMatchMessage(message)) {
    // The operator clearly tried to name a reference just now and it didn't
    // resolve -- clear a stale ranked-candidate list so it doesn't look like
    // it corresponds to what was just said. Pending cards in the queues
    // above are unaffected -- those are cleared explicitly (confirm/skip),
    // never by a later, unrelated line failing to resolve.
    useMatchStore.setState({ verseCandidates: null, verseCandidatesSourceText: null });
  }

  if (isSongCandidatesMessage(message)) {
    useMatchStore.setState({
      songCandidates: message.candidates,
      songCandidatesSourceText: message.source_text ?? null,
    });
  }

  if (isTranslationComparisonMessage(message)) {
    const { type: _type, ...data } = message;
    useMatchStore.setState({ translationComparison: data });
  }
});
