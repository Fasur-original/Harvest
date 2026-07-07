import { Search } from "lucide-react";
import type { FormEvent } from "react";
import PageHeader from "./PageHeader";
import QuickAddSong from "./QuickAddSong";
import UploadSongSheet from "./UploadSongSheet";

type VerseQuery = { book: string; chapter: string; verse: string; translation: string };
type VerseResult = { book: string; chapter: number; verse: number; translation: string; text: string };
type SongSummary = { id: number; title: string };

const inputClass =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

function LibraryView({
  verseQuery,
  setVerseQuery,
  verseResult,
  verseError,
  onSearchVerse,
  onConfirmVerse,
  songQuery,
  setSongQuery,
  songResults,
  songError,
  onSearchSongs,
  onConfirmSong,
}: {
  verseQuery: VerseQuery;
  setVerseQuery: (q: VerseQuery) => void;
  verseResult: VerseResult | null;
  verseError: string | null;
  onSearchVerse: (e: FormEvent) => void;
  onConfirmVerse: () => void;
  songQuery: string;
  setSongQuery: (q: string) => void;
  songResults: SongSummary[];
  songError: string | null;
  onSearchSongs: (e: FormEvent) => void;
  onConfirmSong: (song: SongSummary) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Song Library" subtitle="Upload, search, and add songs to the shared library." />
      <UploadSongSheet />
      <QuickAddSong />

      <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Search Verses</h2>
        <form onSubmit={onSearchVerse} className="flex flex-wrap items-end gap-2">
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
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            <Search size={14} /> Search
          </button>
        </form>
        {verseError && <p className="text-sm text-red-500">{verseError}</p>}
        {verseResult && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <p className="text-sm text-neutral-800 dark:text-neutral-100">
              <span className="font-semibold">
                {verseResult.book} {verseResult.chapter}:{verseResult.verse} ({verseResult.translation})
              </span>{" "}
              — {verseResult.text}
            </p>
            <button
              type="button"
              onClick={onConfirmVerse}
              className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
            >
              Confirm
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Search Songs</h2>
        <form onSubmit={onSearchSongs} className="flex gap-2">
          <input
            value={songQuery}
            onChange={(e) => setSongQuery(e.target.value)}
            placeholder="Song title..."
            className={`flex-1 ${inputClass}`}
          />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            <Search size={14} /> Search
          </button>
        </form>
        {songError && <p className="text-sm text-red-500">{songError}</p>}
        {songResults.length > 0 && (
          <ul className="flex flex-col gap-2">
            {songResults.map((song) => (
              <li
                key={song.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{song.title}</span>
                <button
                  type="button"
                  onClick={() => onConfirmSong(song)}
                  className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
                >
                  Confirm
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default LibraryView;
