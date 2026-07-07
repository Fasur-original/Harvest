import { useEffect } from "react";
import { Sparkles } from "lucide-react";

export type SuggestionMessage = {
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

export function isSuggestionMessage(message: unknown): message is SuggestionMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.type === "suggestion" && typeof candidate.text === "string";
}

export function isNoMatchMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).type === "no_match";
}

function referenceLabel(s: SuggestionMessage): string {
  return s.kind === "verse" ? `${s.book} ${s.chapter}:${s.verse}` : `Song #${s.song_id}, line ${s.line_number}`;
}

// `suggestion` is owned by OperatorConsole (see its `lastMessage` effect)
// rather than local state here, so switching to Library and back doesn't
// drop a suggestion still awaiting a decision -- it's genuinely part of
// "what's happening right now in this service," not per-page UI state.
function SuggestedMatch({
  suggestion,
  onConfirm,
  onDismiss,
}: {
  suggestion: SuggestionMessage | null;
  onConfirm: (s: SuggestionMessage) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!suggestion) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        onConfirm(suggestion as SuggestionMessage);
      } else if (e.code === "Escape") {
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [suggestion, onConfirm, onDismiss]);

  if (suggestion === null) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Confident Match</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {suggestion.match_type === "regex" ? "Direct reference" : "Wording match"} ·{" "}
              {(suggestion.confidence * 100).toFixed(1)}% confidence
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {suggestion.kind === "verse" && suggestion.book && (
            <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white dark:bg-neutral-100 dark:text-neutral-900">
              {suggestion.book}
            </span>
          )}
          {suggestion.translation && (
            <span className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
              {suggestion.translation}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-5">
        <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{referenceLabel(suggestion)}</p>
        <blockquote className="mt-3 border-l-2 border-orange-400 pl-4 text-base text-neutral-700 dark:text-neutral-300">
          &ldquo;{suggestion.text}&rdquo;
        </blockquote>
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-100 px-6 py-4 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => onConfirm(suggestion)}
          className="flex-1 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Confirm &amp; Display
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Dismiss
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-neutral-100 px-6 py-2 dark:border-neutral-800">
        <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          SPACE
        </kbd>
        <span className="text-[10px] text-neutral-400">Confirm</span>
        <kbd className="ml-3 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          ESC
        </kbd>
        <span className="text-[10px] text-neutral-400">Dismiss</span>
      </div>
    </section>
  );
}

export default SuggestedMatch;
