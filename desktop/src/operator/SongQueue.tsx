import { useEffect, useState } from "react";
import { CheckCircle2, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQueueStore } from "@/store/queue-store";

const API_BASE = "http://localhost:8000";

type SongLine = { line_number: number; line_text: string; repeat_count: number };
type SongDetail = { id: number; title: string; lines: SongLine[] };

// The song-mode equivalent of ReadingQueue.tsx: an operator-curated worklist
// of songs, separate from the Bible reading queue. Clicking a song jumps to
// its first line; once a song is "now playing," its own lines show as
// steppable cards below so the operator can advance through the real lyric
// text one line at a time.
function SongQueue() {
  const queue = useQueueStore((s) => s.songQueue);
  const error = useQueueStore((s) => s.error);
  const fetchSongQueue = useQueueStore((s) => s.fetchSongQueue);
  const jumpToSong = useQueueStore((s) => s.jumpToSong);
  const jumpToSongLine = useQueueStore((s) => s.jumpToSongLine);
  const removeSongQueueEntry = useQueueStore((s) => s.removeSongQueueEntry);
  const clearSongQueue = useQueueStore((s) => s.clearSongQueue);

  const [currentSong, setCurrentSong] = useState<SongDetail | null>(null);

  useEffect(() => {
    fetchSongQueue();
  }, [fetchSongQueue]);

  useEffect(() => {
    const currentEntry = queue?.entries.find((e) => e.id === queue.current_entry_id);
    if (!currentEntry) {
      setCurrentSong(null);
      return;
    }
    fetch(`${API_BASE}/songs/${currentEntry.song_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setCurrentSong)
      .catch(() => {});
  }, [queue?.current_entry_id]);

  if (queue === null || queue.entries.length === 0) {
    return (
      <Card className="h-fit border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Song Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">Add songs from the library to build today's worklist.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-fit flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Song Queue</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              clearSongQueue();
              toast("Song queue cleared");
            }}
          >
            Clear
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {queue.entries.map((entry) => {
            const isCurrent = entry.id === queue.current_entry_id;
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                  isCurrent ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:border-primary/40 border-transparent"
                }`}
              >
                <button type="button" onClick={() => jumpToSong(entry.song_id)} className="flex flex-1 items-center gap-2 text-left">
                  {isCurrent && <PlayCircle size={16} className="shrink-0" />}
                  <span className="text-sm font-semibold">{entry.title}</span>
                  {isCurrent && <span className="text-[11px] tracking-wide uppercase opacity-70">Now playing</span>}
                </button>
                <button
                  type="button"
                  onClick={() => removeSongQueueEntry(entry.id)}
                  className={`shrink-0 rounded p-1 ${isCurrent ? "hover:bg-white/10" : "hover:bg-muted"}`}
                  aria-label="Remove from queue"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </CardContent>
      </Card>

      {currentSong && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{currentSong.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {currentSong.lines.map((line) => {
              const isCurrentLine = line.line_number === queue.current_line_number;
              return (
                <button
                  key={line.line_number}
                  type="button"
                  onClick={() => jumpToSongLine(currentSong.id, currentSong.title, line.line_number, line.line_text)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    isCurrentLine ? "border-primary bg-primary/10" : "bg-muted/40 hover:border-primary/40 border-transparent"
                  }`}
                >
                  {isCurrentLine && <CheckCircle2 size={14} className="text-primary shrink-0" />}
                  <span>{line.line_text}</span>
                  {line.repeat_count > 1 && <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">×{line.repeat_count}</span>}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SongQueue;
