import { useEffect, useState } from "react";

type SuggestionMessage = {
  type: "suggestion";
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

function isSuggestionMessage(message: unknown): message is SuggestionMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.type === "suggestion" && typeof candidate.text === "string";
}

function describeSuggestion(s: SuggestionMessage): string {
  if (s.kind === "verse") {
    return `${s.book} ${s.chapter}:${s.verse} (${s.translation})`;
  }
  return `Song #${s.song_id}, line ${s.line_number}`;
}

function SuggestedMatch({ lastMessage, onConfirm }: { lastMessage: unknown; onConfirm: (s: SuggestionMessage) => void }) {
  // lastMessage reflects whatever arrived most recently on the shared socket
  // (transcript lines, confirms, suggestions all flow through it) -- if this
  // rendered directly off lastMessage, a suggestion would vanish the instant
  // the next transcript line arrived, before the operator could click
  // Confirm. Track it in local state instead, same pattern as LiveTranscript:
  // only replace it with a newer suggestion, ignore everything else.
  const [suggestion, setSuggestion] = useState<SuggestionMessage | null>(null);

  useEffect(() => {
    if (isSuggestionMessage(lastMessage)) {
      setSuggestion(lastMessage);
    }
  }, [lastMessage]);

  if (suggestion === null) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
        Suggested match (Phase 05) — {suggestion.match_type === "regex" ? "direct reference" : "embedding"}, confidence{" "}
        {(suggestion.confidence * 100).toFixed(0)}%
      </h2>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-300 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
        <p className="text-sm text-neutral-800 dark:text-neutral-100">
          <span className="font-semibold">{describeSuggestion(suggestion)}</span> — {suggestion.text}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              onConfirm(suggestion);
              setSuggestion(null);
            }}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setSuggestion(null)}
            className="rounded-lg bg-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-400 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

export default SuggestedMatch;
