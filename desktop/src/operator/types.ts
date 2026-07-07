// Shared shape for anything that can be passed to the WebSocket confirm
// action -- a SuggestedMatch suggestion, a MatchOptions candidate, or a
// ReadingQueue entry's resolved verse all satisfy this without needing a
// union of every concrete message type.
export type ConfirmablePayload = {
  kind: "verse" | "song";
  text: string;
  [key: string]: unknown;
};
