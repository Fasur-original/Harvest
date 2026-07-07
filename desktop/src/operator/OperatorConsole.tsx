import { useEffect, useState, type FormEvent } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useBackendSocket } from "../lib/backend-ws";
import { usePersistedState } from "../lib/use-persisted-state";
import ConsoleView from "./ConsoleView";
import LibraryView from "./LibraryView";
import { isCandidatesMessage, type Candidate } from "./MatchOptions";
import Sidebar from "./Sidebar";
import SettingsView from "./SettingsView";
import { isNoMatchMessage, isSuggestionMessage, type SuggestionMessage } from "./SuggestedMatch";
import { isTranscriptMessage } from "./LiveTranscript";
import type { ConfirmablePayload } from "./types";

const API_BASE = "http://localhost:8000";
const MAX_TRANSCRIPT_LINES = 20;

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

function OperatorConsole() {
  const { lastMessage, connected, send } = useBackendSocket();

  // Live-service state, not per-page UI state -- lifted here (which stays
  // mounted for the app's whole life, wrapping <Routes>) so switching to
  // Library or Settings and back doesn't lose the transcript log or drop a
  // suggestion still awaiting a decision. The transcript log additionally
  // survives a full reload via localStorage (use-persisted-state.ts); the
  // pending suggestion/candidates deliberately do not -- both are tied to a
  // specific moment of live speech that's already passed by the time a
  // reload happens, so restoring one after a restart would risk the
  // operator confirming something stale mid-service.
  const [transcriptLines, setTranscriptLines] = usePersistedState<string[]>("harvest:transcript-lines", []);
  const [suggestion, setSuggestion] = useState<SuggestionMessage | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  useEffect(() => {
    if (isTranscriptMessage(lastMessage)) {
      setTranscriptLines((prev) => [...prev.slice(-(MAX_TRANSCRIPT_LINES - 1)), lastMessage.text]);
    }
  }, [lastMessage, setTranscriptLines]);

  useEffect(() => {
    if (isSuggestionMessage(lastMessage)) {
      setSuggestion(lastMessage);
    } else if (isNoMatchMessage(lastMessage)) {
      // The operator clearly tried to name a reference just now and it
      // didn't resolve -- clear a stale pending suggestion rather than
      // leaving it looking like it corresponds to what was just said.
      setSuggestion(null);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (isCandidatesMessage(lastMessage)) {
      setCandidates(lastMessage.candidates);
    } else if (isNoMatchMessage(lastMessage)) {
      setCandidates(null);
    }
  }, [lastMessage]);

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

  const [defaultTranslation, setDefaultTranslation] = useState("");
  const [activeService, setActiveService] = useState<{
    id: number;
    default_translation: string | null;
    songs: SongSummary[];
  } | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);

  async function startService() {
    setServiceError(null);
    // Re-sends the currently active set's own songs rather than an empty
    // list -- /service/start replaces the whole set, so just updating the
    // translation here must not silently drop songs a different flow already
    // put in today's set.
    const songIds = activeService?.songs.map((s) => s.id) ?? [];
    const res = await fetch(`${API_BASE}/service/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_ids: songIds, default_translation: defaultTranslation || null }),
    });
    if (!res.ok) {
      setServiceError(`Error ${res.status}`);
      return;
    }
    setActiveService(await res.json());
  }

  async function clearService() {
    setServiceError(null);
    const res = await fetch(`${API_BASE}/service/clear`, { method: "POST" });
    if (!res.ok) {
      setServiceError(`Error ${res.status}`);
      return;
    }
    setActiveService(null);
  }

  useEffect(() => {
    // Picks up a service already started before this window was opened
    // (e.g. the app was closed and reopened mid-service) rather than showing
    // a blank "no active service" state that doesn't match reality.
    fetch(`${API_BASE}/service/active`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setActiveService(data);
          setDefaultTranslation(data.default_translation ?? "");
        }
      })
      .catch(() => {});
  }, []);

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

  function confirmSuggestion(payload: ConfirmablePayload) {
    send({ action: "confirm", ...payload });
    // Confirming anything -- this suggestion, a ranked candidate, a queue
    // entry, a manual search result -- means whatever's still pending here
    // has been superseded by a decision, so it shouldn't linger on screen
    // tempting a second, contradictory click.
    setSuggestion(null);
    setCandidates(null);
  }

  async function confirmSong(song: SongSummary) {
    // Manual search finds the song; display is still line-by-line, so
    // confirming from a title match shows its first line here.
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
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-950">
      <Sidebar connected={connected} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
          <Routes>
            <Route path="/" element={<Navigate to="/console" replace />} />
            <Route
              path="/console"
              element={
                <ConsoleView
                  lastMessage={lastMessage}
                  send={send}
                  translation={defaultTranslation || "KJV"}
                  transcriptLines={transcriptLines}
                  suggestion={suggestion}
                  candidates={candidates}
                  onConfirm={confirmSuggestion}
                  onDismissSuggestion={() => setSuggestion(null)}
                  onDismissCandidates={() => setCandidates(null)}
                />
              }
            />
            <Route
              path="/library"
              element={
                <LibraryView
                  verseQuery={verseQuery}
                  setVerseQuery={setVerseQuery}
                  verseResult={verseResult}
                  verseError={verseError}
                  onSearchVerse={searchVerse}
                  onConfirmVerse={confirmVerse}
                  songQuery={songQuery}
                  setSongQuery={setSongQuery}
                  songResults={songResults}
                  songError={songError}
                  onSearchSongs={searchSongs}
                  onConfirmSong={confirmSong}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsView
                  defaultTranslation={defaultTranslation}
                  setDefaultTranslation={setDefaultTranslation}
                  activeService={activeService}
                  serviceError={serviceError}
                  onStart={startService}
                  onClear={clearService}
                />
              }
            />
            <Route path="*" element={<Navigate to="/console" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default OperatorConsole;
