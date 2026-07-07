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
  match_type: "regex" | "embedding";
  confidence: number;
  book?: string;
  chapter?: number;
  verse?: number;
  translation?: string;
  song_id?: number;
  line_number?: number;
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

export type CandidatesMessage = { type: "candidates"; candidates: Candidate[] };
export function isCandidatesMessage(message: unknown): message is CandidatesMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  return m.type === "candidates" && Array.isArray(m.candidates);
}

export type SongCandidatesMessage = { type: "song_candidates"; candidates: Candidate[] };
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

// Anything that can be sent to the confirm action -- a suggestion, a
// candidate, a queue entry's resolved verse, or a manual search result all
// satisfy this without needing a union of every concrete message type.
export type ConfirmablePayload = {
  kind: "verse" | "song";
  text: string;
  [key: string]: unknown;
};
