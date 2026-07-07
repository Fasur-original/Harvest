import { BookOpen, Music2 } from "lucide-react";

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

export type CandidatesMessage = {
  type: "candidates";
  candidates: Candidate[];
};

export function isCandidatesMessage(message: unknown): message is CandidatesMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.type === "candidates" && Array.isArray(candidate.candidates);
}

function describeCandidate(c: Candidate): string {
  if (c.kind === "verse") {
    return `${c.book} ${c.chapter}:${c.verse}`;
  }
  return `Song #${c.song_id}, line ${c.line_number}`;
}

// Shown when the preacher paraphrases or can't quite recall the book, verse,
// or exact wording -- confident enough that *something* relevant was said to
// be worth surfacing, not confident enough in any one reading to auto-suggest
// it the way SuggestedMatch does. `candidates` is owned by OperatorConsole
// (see its `lastMessage` effect) for the same reason SuggestedMatch's
// `suggestion` is -- it's live-service state, not per-page UI state, so it
// shouldn't disappear just because the operator switched to Library and back.
function MatchOptions({
  candidates,
  onConfirm,
  onDismiss,
}: {
  candidates: Candidate[] | null;
  onConfirm: (c: Candidate) => void;
  onDismiss: () => void;
}) {
  if (candidates === null || candidates.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Ranked Match Results</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Not confident enough for one guess — pick the right one.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {candidates.map((c, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {c.kind === "verse" ? <BookOpen size={14} /> : <Music2 size={14} />}
                  {describeCandidate(c)}
                </span>
                <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                  {(c.confidence * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">&ldquo;{c.text}&rdquo;</p>
            </div>
            <button
              type="button"
              onClick={() => onConfirm(c)}
              className="mt-3 rounded-lg bg-neutral-900 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Select &amp; Display
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="w-fit text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        None of these — dismiss
      </button>
    </section>
  );
}

export default MatchOptions;
