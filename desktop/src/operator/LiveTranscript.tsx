import { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";
const MAX_LINES = 20;

type TranscriptMessage = {
  type: "transcript";
  text: string;
};

function isTranscriptMessage(message: unknown): message is TranscriptMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.type === "transcript" && typeof candidate.text === "string";
}

function LiveTranscript({ lastMessage }: { lastMessage: unknown }) {
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/transcript/status`)
      .then((res) => res.json())
      .then((data) => setRunning(Boolean(data.running)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isTranscriptMessage(lastMessage)) {
      setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), lastMessage.text]);
    }
  }, [lastMessage]);

  async function toggle() {
    // Starting loads the whisper model, which takes a few seconds -- disable
    // the button for the duration so a slow first click can't be mistaken
    // for a missed click and stacked with more of them. The backend also
    // guards against overlapping start calls now, but this is the fix for
    // why someone would click repeatedly in the first place.
    if (pending) return;
    setPending(true);
    setError(null);
    const endpoint = running ? "stop" : "start";
    try {
      const res = await fetch(`${API_BASE}/transcript/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        setError(`Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setRunning(Boolean(data.running));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
        Live transcript (Phase 04) — pipeline speed check, no matching yet
      </h2>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`w-fit rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${
          running ? "bg-red-600 hover:bg-red-700" : "bg-orange-500 hover:bg-orange-600"
        }`}
      >
        {pending ? "Please wait…" : running ? "Stop Listening" : "Start Listening"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex h-40 flex-col-reverse gap-1 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800">
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-400">No transcript yet.</p>
        ) : (
          [...lines].reverse().map((line, i) => (
            <p key={i} className="text-sm text-neutral-800 dark:text-neutral-100">
              {line}
            </p>
          ))
        )}
      </div>
    </section>
  );
}

export default LiveTranscript;
