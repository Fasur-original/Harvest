import { useEffect, useState } from "react";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";

const API_BASE = "http://localhost:8000";

type Entry = {
  id: number;
  position: number;
  book: string;
  chapter: number;
  verse: number;
};

type Queue = {
  id: number;
  entries: Entry[];
  current_entry_id: number | null;
};

type ReadingQueueMessage = Queue & { type: "reading_queue" };

function isReadingQueueMessage(message: unknown): message is ReadingQueueMessage {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).type === "reading_queue";
}

// Shown when the preacher names several references at once ("Genesis 1:1,
// then Genesis 10:12, and Romans 8:28"). The operator can jump to any entry,
// in any order, not just step through them one at a time -- the preacher may
// read the queue out of the order it was announced in. Live speech naming
// one of these references also moves the "now reading" highlight
// automatically (see app/routes/transcript.py's `sync_current_to_reference`)
// -- this UI just reflects whichever one wins, whether that came from speech
// or a manual click here.
function ReadingQueue({
  lastMessage,
  send,
  translation,
}: {
  lastMessage: unknown;
  send: (data: unknown) => void;
  translation: string;
}) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isReadingQueueMessage(lastMessage)) {
      const { id, entries, current_entry_id } = lastMessage;
      setQueue({ id, entries, current_entry_id });
    }
  }, [lastMessage]);

  useEffect(() => {
    // Picks up a queue already announced before this window was opened,
    // same reasoning as the active-service fetch on mount elsewhere.
    fetch(`${API_BASE}/reading-queue/active`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setQueue(data))
      .catch(() => {});
  }, []);

  async function jumpTo(entry: Entry) {
    setError(null);
    const params = new URLSearchParams({
      book: entry.book,
      chapter: String(entry.chapter),
      verse: String(entry.verse),
      translation,
    });
    const res = await fetch(`${API_BASE}/bible/verse?${params}`);
    if (!res.ok) {
      setError(`Error ${res.status}`);
      return;
    }
    const verse = await res.json();
    // Same confirm action every other match/search path already uses -- the
    // backend's confirm handler is what actually moves the queue's "now
    // reading" pointer, so this doesn't duplicate that logic here.
    send({ action: "confirm", kind: "verse", ...verse });
  }

  async function clearQueue() {
    setError(null);
    const res = await fetch(`${API_BASE}/reading-queue/clear`, { method: "POST" });
    if (!res.ok) {
      setError(`Error ${res.status}`);
      return;
    }
    setQueue(null);
  }

  if (queue === null || queue.entries.length === 0) {
    return (
      <section className="flex h-fit flex-col gap-1.5 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Reading Queue</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Naming several verses at once (&ldquo;Genesis 1:1, then Romans 8:28…&rdquo;) builds a queue here.
        </p>
      </section>
    );
  }

  const currentIndex = queue.entries.findIndex((e) => e.id === queue.current_entry_id);

  return (
    <section className="flex h-fit flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Reading Queue</h2>
        <button
          type="button"
          onClick={clearQueue}
          className="text-xs font-medium text-neutral-400 hover:text-red-500"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {queue.entries.map((entry, i) => {
          const isCurrent = entry.id === queue.current_entry_id;
          const isRead = currentIndex >= 0 && i < currentIndex;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => jumpTo(entry)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isCurrent
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-neutral-50 hover:border-orange-300 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-orange-800"
              }`}
            >
              {isCurrent ? (
                <PlayCircle size={16} className="shrink-0" />
              ) : isRead ? (
                <CheckCircle2 size={16} className="shrink-0 text-green-500" />
              ) : (
                <Circle size={16} className="shrink-0 text-neutral-300 dark:text-neutral-700" />
              )}
              <span className="flex-1">
                <span className="block text-sm font-semibold">
                  {entry.book} {entry.chapter}:{entry.verse}
                </span>
                <span
                  className={`block text-[11px] tracking-wide uppercase ${
                    isCurrent ? "text-neutral-300 dark:text-neutral-600" : "text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {isCurrent ? "Now reading" : isRead ? "Read" : "Pending"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </section>
  );
}

export default ReadingQueue;
