// Every shape that can arrive over the shared `/ws` connection, plus the
// type guards that discriminate them. Centralized here (rather than one
// guard per component) since the zustand stores in src/store/ are what
// actually consume these now -- components just read derived state off the
// stores, they don't parse the socket themselves.

export type TranscriptMessage = { type: "transcript"; text: string };

export function isTranscriptMessage(message: unknown): message is TranscriptMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "transcript" && typeof m.text === "string";
}

// The fields a "confident match" card needs, independent of which WS
// message type carried it -- the verse track's `suggestion` and the song
// track's `song_suggestion` are structurally identical, just tagged
// differently on the wire.
export type MatchSuggestion = {
  kind: "verse" | "song";
  text: string;
  match_type: "regex" | "embedding" | "llm";
  confidence: number;
  book?: string;
  chapter?: number;
  verse?: number;
  translation?: string;
  song_id?: number;
  line_number?: number;
  // The original transcript snippet that produced this match, if the
  // backend included one -- lets the operator judge correctness before
  // confirming instead of just trusting the match at face value.
  source_text?: string;
  // Present when a real, recognized translation was named but isn't loaded
  // for this install -- the match is shown in `used` instead, and this is
  // what tells the operator that substitution happened rather than it
  // looking like a silent, unexplained mismatch.
  translation_note?: { requested: string; used: string };
};

export type SuggestionMessage = MatchSuggestion & { type: "suggestion" };
export function isSuggestionMessage(message: unknown): message is SuggestionMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "suggestion" && typeof m.text === "string";
}

export type SongSuggestionMessage = MatchSuggestion & { type: "song_suggestion" };
export function isSongSuggestionMessage(message: unknown): message is SongSuggestionMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "song_suggestion" && typeof m.text === "string";
}

export function isNoMatchMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).type === "no_match";
}

export type VerseCandidate = {
  kind: "verse";
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
  confidence: number;
};

export type SongCandidate = {
  kind: "song";
  song_id: number;
  line_number: number;
  text: string;
  confidence: number;
};

export type Candidate = VerseCandidate | SongCandidate;

export type CandidatesMessage = { type: "candidates"; candidates: Candidate[]; source_text?: string };
export function isCandidatesMessage(message: unknown): message is CandidatesMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "candidates" && Array.isArray(m.candidates);
}

export type SongCandidatesMessage = { type: "song_candidates"; candidates: Candidate[]; source_text?: string };
export function isSongCandidatesMessage(message: unknown): message is SongCandidatesMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "song_candidates" && Array.isArray(m.candidates);
}

export type ReadingQueueEntryData = {
  id: number;
  position: number;
  book: string;
  chapter: number;
  verse: number;
};

export type ReadingQueueData = {
  id: number;
  entries: ReadingQueueEntryData[];
  current_entry_id: number | null;
};

export type ReadingQueueMessage = ReadingQueueData & { type: "reading_queue" };
export function isReadingQueueMessage(message: unknown): message is ReadingQueueMessage {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).type === "reading_queue";
}

export type SongQueueEntryData = {
  id: number;
  position: number;
  song_id: number;
  title: string;
};

export type SongQueueData = {
  id: number;
  entries: SongQueueEntryData[];
  current_entry_id: number | null;
  current_line_number: number | null;
};

export type SongQueueMessage = SongQueueData & { type: "song_queue" };
export function isSongQueueMessage(message: unknown): message is SongQueueMessage {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).type === "song_queue";
}

// PART 2 of the translation-strength feature: "show me the strongest
// rendering of this" -- every translation loaded for one identified verse,
// ranked by similarity to what the preacher just said. Deliberately *not*
// labeled "strongest" or "best" anywhere user-facing (see TranslationComparison.tsx)
// -- this is a relevance ranking against the spoken context, not a
// scholarly or theological claim about translation accuracy.
export type TranslationRanking = {
  translation: string;
  text: string;
  similarity: number;
};

export type TranslationComparisonData = {
  book: string;
  chapter: number;
  verse: number;
  source_text: string;
  rankings: TranslationRanking[];
};

export type TranslationComparisonMessage = TranslationComparisonData & { type: "translation_comparison" };
export function isTranslationComparisonMessage(message: unknown): message is TranslationComparisonMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "translation_comparison" && Array.isArray(m.rankings);
}

export type LlmCleanupStatus = {
  enabled: boolean;
  manual_enabled: boolean;
  auto_disabled_reason: string | null;
  last_call_timed_out: boolean;
};

export type LlmCleanupStatusMessage = LlmCleanupStatus & { type: "llm_cleanup_status" };
export function isLlmCleanupStatusMessage(message: unknown): message is LlmCleanupStatusMessage {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).type === "llm_cleanup_status";
}

// Anything that can be sent to the confirm action -- a suggestion, a
// candidate, a queue entry's resolved verse, or a manual search result all
// satisfy this without needing a union of every concrete message type.
export type ConfirmablePayload = {
  kind: "verse" | "song";
  text: string;
  [key: string]: unknown;
};
