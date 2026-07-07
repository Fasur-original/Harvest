import { useState } from "react";
import { Plus } from "lucide-react";

const API_BASE = "http://localhost:8000";

// Mid-service, no-time fallback -- paste-and-embed, not the primary
// workflow. Lands in the exact same save_song call as the workbook upload,
// so there's no separate quick-add storage path to keep in sync.
function QuickAddSong() {
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const lines = lyrics
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (!title.trim() || lines.length === 0 || pending) return;

    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          lines: lines.map((line_text, i) => ({ line_number: i + 1, line_text, repeat_count: 1 })),
        }),
      });
      if (!res.ok) {
        setError(`Error ${res.status}`);
        return;
      }
      setStatus(`Added "${title.trim()}" (${lines.length} line${lines.length === 1 ? "" : "s"}).`);
      setTitle("");
      setLyrics("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Quick Add</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Paste lyrics directly — useful mid-service when there's no time to prep a sheet.
        </p>
      </div>
      <details className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-300">
        <summary className="cursor-pointer font-medium text-neutral-700 select-none dark:text-neutral-200">
          Format example
        </summary>
        <p className="mt-2">
          One lyric line per row, in the order they're sung. If a line repeats, just type that same line again each
          time it comes up:
        </p>
        <pre className="mt-2 rounded bg-white px-2 py-1.5 whitespace-pre-wrap text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
{`Amazing grace, how sweet the sound
That saved a wretch like me
I once was lost, but now am found
I once was lost, but now am found
Was blind, but now I see`}
        </pre>
      </details>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Song title..."
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        placeholder="Paste lyrics, one line per row..."
        rows={4}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />
      <button
        type="button"
        onClick={add}
        disabled={!title.trim() || !lyrics.trim() || pending}
        className="flex w-fit items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus size={14} /> {pending ? "Adding…" : "Add Song"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {status && <p className="text-sm text-green-600 dark:text-green-400">{status}</p>}
    </section>
  );
}

export default QuickAddSong;
