import { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";

const API_BASE = "http://localhost:8000";

export type TranscriptMessage = {
  type: "transcript";
  text: string;
};

export function isTranscriptMessage(message: unknown): message is TranscriptMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.type === "transcript" && typeof candidate.text === "string";
}

// `lines` is owned by OperatorConsole (persisted across both route
// navigation and a full reload -- see use-persisted-state.ts) rather than
// local state here, so switching to Library and back doesn't lose the log.
function LiveTranscript({ lines }: { lines: string[] }) {
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Backend-authoritative and re-checked on every mount, so this doesn't
    // need to survive navigation the way the transcript log does -- it's
    // always correct the moment this component appears again.
    fetch(`${API_BASE}/transcript/status`)
      .then((res) => res.json())
      .then((data) => setRunning(Boolean(data.running)))
      .catch(() => undefined);
  }, []);

  async function toggle() {
    // Starting loads the whisper model, which takes a few seconds -- disable
    // the button for the duration so a slow first click can't be mistaken
    // for a missed click and stacked with more of them.
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
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              running ? "animate-pulse bg-red-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          />
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Live Transcript</h2>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            running ? "bg-red-600 hover:bg-red-700" : "bg-orange-500 hover:bg-orange-600"
          }`}
        >
          {running ? <MicOff size={14} /> : <Mic size={14} />}
          {pending ? "Please wait…" : running ? "Stop Listening" : "Start Listening"}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      <div className="flex h-32 flex-col-reverse gap-1.5 overflow-y-auto text-sm leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-neutral-400 dark:text-neutral-600">
            {running ? "Listening for speech…" : "Not listening yet."}
          </p>
        ) : (
          [...lines].reverse().map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "font-medium text-neutral-900 dark:text-neutral-100"
                  : "text-neutral-400 dark:text-neutral-600"
              }
            >
              {line}
            </p>
          ))
        )}
      </div>
    </section>
  );
}

export default LiveTranscript;
