import { useState, type FormEvent } from "react";
import { useBackendSocket } from "../lib/backend-ws";

const API_BASE = "http://localhost:8000";

type VerseResult = {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  text: string;
};

type SongSummary = {
  id: number;
  title: string;
};

type SongLine = {
  line_number: number;
  line_text: string;
  repeat_count: number;
};

type SongDetail = SongSummary & { lines: SongLine[] };

const inputClass =
  "rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const cardClass =
  "flex items-center justify-between gap-3 rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800";
const confirmButtonClass =
  "shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700";

function OperatorConsole() {
  const { lastMessage, connected, send } = useBackendSocket();

  const [verseQuery, setVerseQuery] = useState({
    book: "John",
    chapter: "3",
    verse: "16",
    translation: "KJV",
  });
  const [verseResult, setVerseResult] = useState<VerseResult | null>(null);
  const [verseError, setVerseError] = useState<string | null>(null);

  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<SongSummary[]>([]);
  const [songError, setSongError] = useState<string | null>(null);

  async function searchVerse(e: FormEvent) {
    e.preventDefault();
    setVerseError(null);
    setVerseResult(null);
    const params = new URLSearchParams(verseQuery);
    const res = await fetch(`${API_BASE}/bible/verse?${params}`);
    if (!res.ok) {
      setVerseError(res.status === 404 ? "Verse not found" : `Error ${res.status}`);
      return;
    }
    setVerseResult(await res.json());
  }

  async function searchSongs(e: FormEvent) {
    e.preventDefault();
    setSongError(null);
    if (!songQuery.trim()) {
      setSongResults([]);
      return;
    }
    const res = await fetch(`${API_BASE}/songs?q=${encodeURIComponent(songQuery)}`);
    if (!res.ok) {
      setSongError(`Error ${res.status}`);
      return;
    }
    setSongResults(await res.json());
  }

  function confirmVerse() {
    if (!verseResult) return;
    send({ action: "confirm", kind: "verse", ...verseResult });
  }

  async function confirmSong(song: SongSummary) {
    // Manual search finds the song; display is still line-by-line (PDD §5.3.1),
    // so confirming from a title match shows its first line here. Stepping
    // through the rest of a song's lines is Phase 06+ UI, not this phase's job.
    const res = await fetch(`${API_BASE}/songs/${song.id}`);
    if (!res.ok) {
      setSongError(`Error ${res.status}`);
      return;
    }
    const detail: SongDetail = await res.json();
    const firstLine = detail.lines[0];
    send({
      action: "confirm",
      kind: "song",
      id: detail.id,
      title: detail.title,
      text: firstLine ? firstLine.line_text : detail.title,
    });
  }

  return (
    <main className="flex h-screen flex-col gap-6 overflow-y-auto bg-neutral-100 p-6 dark:bg-neutral-900">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        Harvest — Operator Console
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          Manual verse search (Phase 03)
        </h2>
        <form onSubmit={searchVerse} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-neutral-600 dark:text-neutral-300">
            Book
            <input
              value={verseQuery.book}
              onChange={(e) => setVerseQuery({ ...verseQuery, book: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600 dark:text-neutral-300">
            Chapter
            <input
              value={verseQuery.chapter}
              onChange={(e) => setVerseQuery({ ...verseQuery, chapter: e.target.value })}
              className={`w-16 ${inputClass}`}
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600 dark:text-neutral-300">
            Verse
            <input
              value={verseQuery.verse}
              onChange={(e) => setVerseQuery({ ...verseQuery, verse: e.target.value })}
              className={`w-16 ${inputClass}`}
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-600 dark:text-neutral-300">
            Translation
            <select
              value={verseQuery.translation}
              onChange={(e) => setVerseQuery({ ...verseQuery, translation: e.target.value })}
              className={inputClass}
            >
              <option>KJV</option>
              <option>ASV</option>
              <option>YLT</option>
              <option>WEB</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            Search
          </button>
        </form>
        {verseError && <p className="text-sm text-red-600">{verseError}</p>}
        {verseResult && (
          <div className={cardClass}>
            <p className="text-sm text-neutral-800 dark:text-neutral-100">
              <span className="font-semibold">
                {verseResult.book} {verseResult.chapter}:{verseResult.verse} ({verseResult.translation})
              </span>{" "}
              — {verseResult.text}
            </p>
            <button type="button" onClick={confirmVerse} className={confirmButtonClass}>
              Confirm
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          Manual song search (Phase 03)
        </h2>
        <form onSubmit={searchSongs} className="flex gap-2">
          <input
            value={songQuery}
            onChange={(e) => setSongQuery(e.target.value)}
            placeholder="Song title..."
            className={inputClass}
          />
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            Search
          </button>
        </form>
        {songError && <p className="text-sm text-red-600">{songError}</p>}
        <ul className="flex flex-col gap-2">
          {songResults.map((song) => (
            <li key={song.id} className={cardClass}>
              <span className="text-sm text-neutral-800 dark:text-neutral-100">{song.title}</span>
              <button type="button" onClick={() => confirmSong(song)} className={confirmButtonClass}>
                Confirm
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1 border-t border-neutral-300 pt-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        <p>Backend WebSocket: {connected ? "connected" : "disconnected"}</p>
        {lastMessage !== null && (
          <pre className="overflow-x-auto rounded bg-neutral-200 p-2 dark:bg-neutral-800">
            {JSON.stringify(lastMessage, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}

export default OperatorConsole;
