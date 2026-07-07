import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useMatchStore } from "@/store/match-store";
import { useQueueStore } from "@/store/queue-store";
import LiveTranscript from "./LiveTranscript";
import MatchOptions from "./MatchOptions";
import PageHeader from "./PageHeader";
import QuickAddSong from "./QuickAddSong";
import SongQueue from "./SongQueue";
import SuggestedMatch from "./SuggestedMatch";
import UploadSongSheet from "./UploadSongSheet";

const API_BASE = "http://localhost:8000";

type SongSummary = { id: number; title: string };
type SongLine = { line_number: number; line_text: string; repeat_count: number };
type SongDetail = SongSummary & { lines: SongLine[] };

function SongSearchResult({ song }: { song: SongSummary }) {
  const confirm = useMatchStore((s) => s.confirm);
  const addSongToQueue = useQueueStore((s) => s.addSongToQueue);
  const [queueStatus, setQueueStatus] = useState<"idle" | "added" | "error">("idle");

  async function confirmSong() {
    const res = await fetch(`${API_BASE}/songs/${song.id}`);
    if (!res.ok) {
      toast.error(`Error ${res.status}`);
      return;
    }
    const detail: SongDetail = await res.json();
    const firstLine = detail.lines[0];
    if (!firstLine) {
      toast.error("This song has no lines yet.");
      return;
    }
    confirm({ kind: "song", song_id: detail.id, line_number: firstLine.line_number, title: detail.title, text: firstLine.line_text });
  }

  async function handleAddToQueue() {
    const error = await addSongToQueue(song.id);
    if (error) {
      setQueueStatus("error");
      toast.error(error);
    } else {
      setQueueStatus("added");
      toast.success("Added to song queue");
    }
  }

  return (
    <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-xl border p-4">
      <span className="text-sm font-medium">{song.title}</span>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={handleAddToQueue} disabled={queueStatus === "added"}>
          {queueStatus === "added" ? "Added" : queueStatus === "error" ? "Retry" : "Add to Queue"}
        </Button>
        <Button size="sm" onClick={confirmSong}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

function SongSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 300);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/songs?q=${encodeURIComponent(debounced)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => !cancelled && setResults(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search size={16} /> Search Songs
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Song title..." />
        {loading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!loading && results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((song) => (
              <SongSearchResult key={song.id} song={song} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SongsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Songs" subtitle="Live song matching, worklist queue, upload, and search — all in one place." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <SongQueue />
        <div className="flex flex-col gap-6">
          <LiveTranscript />
          <SuggestedMatch variant="song" />
          <MatchOptions variant="song" />
          <UploadSongSheet />
          <QuickAddSong />
          <SongSearch />
        </div>
      </div>
    </div>
  );
}

export default SongsPage;
