import { useState } from "react";
import { ListPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQueueStore } from "@/store/queue-store";

const API_BASE = "http://localhost:8000";

// Mid-service, no-time fallback -- paste-and-embed, not the primary
// workflow. Lands in the exact same save_song call as the workbook upload,
// so there's no separate quick-add storage path to keep in sync.
function QuickAddSong() {
  const addSongToQueue = useQueueStore((s) => s.addSongToQueue);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [pending, setPending] = useState(false);
  const [addedSong, setAddedSong] = useState<{ id: number; title: string } | null>(null);
  const [queueStatus, setQueueStatus] = useState<"idle" | "added" | "error">("idle");

  async function add() {
    const lines = lyrics
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (!title.trim() || lines.length === 0 || pending) return;

    setPending(true);
    setAddedSong(null);
    setQueueStatus("idle");
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
        toast.error(`Error ${res.status}`);
        return;
      }
      const created = await res.json();
      toast.success(`Added "${title.trim()}" (${lines.length} line${lines.length === 1 ? "" : "s"})`);
      setAddedSong({ id: created.id, title: title.trim() });
      setTitle("");
      setLyrics("");
    } finally {
      setPending(false);
    }
  }

  async function addToQueue() {
    if (!addedSong) return;
    const error = await addSongToQueue(addedSong.id);
    if (error) {
      setQueueStatus("error");
      toast.error(error);
    } else {
      setQueueStatus("added");
      toast.success("Added to song queue");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Add</CardTitle>
        <p className="text-muted-foreground text-sm">
          Paste lyrics directly — useful mid-service when there's no time to prep a sheet.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <details className="bg-muted/50 rounded-lg px-3 py-2 text-xs">
          <summary className="text-foreground cursor-pointer font-medium select-none">Format example</summary>
          <p className="mt-2">
            One lyric line per row, in the order they're sung. If a line repeats, just type that same line again each
            time it comes up:
          </p>
          <pre className="bg-background mt-2 rounded px-2 py-1.5 whitespace-pre-wrap">
{`Amazing grace, how sweet the sound
That saved a wretch like me
I once was lost, but now am found
I once was lost, but now am found
Was blind, but now I see`}
          </pre>
        </details>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title..." />
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder="Paste lyrics, one line per row..."
          rows={4}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
        />
        <div className="flex items-center gap-3">
          <Button onClick={add} disabled={!title.trim() || !lyrics.trim() || pending} className="w-fit gap-2">
            <Plus size={14} /> {pending ? "Adding…" : "Add Song"}
          </Button>
          {addedSong && (
            <Button
              variant="outline"
              size="sm"
              onClick={addToQueue}
              disabled={queueStatus === "added"}
              className="gap-1.5"
            >
              <ListPlus size={12} />
              {queueStatus === "added" ? "Added" : queueStatus === "error" ? "Retry" : "Add to Queue"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default QuickAddSong;
