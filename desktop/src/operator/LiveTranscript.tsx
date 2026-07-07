import { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMatchStore } from "@/store/match-store";

const API_BASE = "http://localhost:8000";

function LiveTranscript() {
  const lines = useMatchStore((s) => s.transcriptLines);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${running ? "bg-destructive animate-pulse" : "bg-muted-foreground/30"}`} />
          Live Transcript
        </CardTitle>
        <Button
          size="sm"
          variant={running ? "destructive" : "default"}
          disabled={pending}
          onClick={toggle}
          className="gap-1.5"
        >
          {running ? <MicOff size={14} /> : <Mic size={14} />}
          {pending ? "Please wait…" : running ? "Stop Listening" : "Start Listening"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive mb-2 text-xs">{error}</p>}
        <div className="flex h-32 flex-col-reverse gap-1.5 overflow-y-auto text-sm leading-relaxed">
          {lines.length === 0 ? (
            <p className="text-muted-foreground">{running ? "Listening for speech…" : "Not listening yet."}</p>
          ) : (
            [...lines].reverse().map((line, i) => (
              <p key={i} className={i === 0 ? "text-foreground font-medium" : "text-muted-foreground"}>
                {line}
              </p>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LiveTranscript;
