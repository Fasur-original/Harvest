import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Pencil, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQueueStore } from "@/store/queue-store";
import { useServiceStore } from "@/store/service-store";
import type { ReadingQueueEntryData } from "@/lib/ws-messages";

function EditEntryForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: ReadingQueueEntryData;
  onSave: (book: string, chapter: number, verse: number) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [book, setBook] = useState(entry.book);
  const [chapter, setChapter] = useState(String(entry.chapter));
  const [verse, setVerse] = useState(String(entry.verse));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const err = await onSave(book, Number(chapter), Number(verse));
    setSaving(false);
    if (err) {
      setError(err);
      toast.error(err);
    } else {
      toast.success("Reference corrected");
    }
  }

  return (
    <div className="bg-primary/5 border-primary/30 flex flex-col gap-2 rounded-xl border p-3">
      <p className="text-muted-foreground text-xs font-medium">Correct a mis-transcribed reference</p>
      <div className="flex gap-2">
        <Input value={book} onChange={(e) => setBook(e.target.value)} placeholder="Book" className="min-w-0 flex-1" />
        <Input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Ch" className="w-14" />
        <Input value={verse} onChange={(e) => setVerse(e.target.value)} placeholder="Vs" className="w-14" />
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Shown when the preacher names several references at once ("Genesis 1:1,
// then Genesis 10:12, and Romans 8:28"). The operator can jump to any entry,
// in any order -- the preacher may read the queue out of the order it was
// announced in. Live speech naming one of these references also moves the
// "now reading" highlight automatically -- this UI just reflects whichever
// one wins, whether that came from speech or a manual click here. Each
// entry can also be corrected in place (the pencil icon) if STT
// mis-transcribed the reference.
function ReadingQueue() {
  const queue = useQueueStore((s) => s.readingQueue);
  const error = useQueueStore((s) => s.error);
  const fetchReadingQueue = useQueueStore((s) => s.fetchReadingQueue);
  const jumpToVerse = useQueueStore((s) => s.jumpToVerse);
  const editReadingQueueEntry = useQueueStore((s) => s.editReadingQueueEntry);
  const clearReadingQueue = useQueueStore((s) => s.clearReadingQueue);
  const defaultTranslation = useServiceStore((s) => s.defaultTranslation);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    fetchReadingQueue();
  }, [fetchReadingQueue]);

  if (queue === null || queue.entries.length === 0) {
    return (
      <Card className="h-fit border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Reading Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            Naming several verses at once (&ldquo;Genesis 1:1, then Romans 8:28…&rdquo;) builds a queue here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const currentIndex = queue.entries.findIndex((e) => e.id === queue.current_entry_id);

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Reading Queue</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            clearReadingQueue();
            toast("Reading queue cleared");
          }}
        >
          Clear
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {queue.entries.map((entry, i) => {
          const isCurrent = entry.id === queue.current_entry_id;
          const isRead = currentIndex >= 0 && i < currentIndex;

          if (editingId === entry.id) {
            return (
              <EditEntryForm
                key={entry.id}
                entry={entry}
                onSave={(book, chapter, verse) => editReadingQueueEntry(entry.id, book, chapter, verse).then((err) => {
                  if (!err) setEditingId(null);
                  return err;
                })}
                onCancel={() => setEditingId(null)}
              />
            );
          }

          return (
            <div
              key={entry.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                isCurrent
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 hover:border-primary/40 border-transparent"
              }`}
            >
              <button
                type="button"
                onClick={() => jumpToVerse(entry.book, entry.chapter, entry.verse, defaultTranslation || "KJV")}
                className="flex flex-1 items-center gap-3 text-left"
              >
                {isCurrent ? (
                  <PlayCircle size={16} className="shrink-0" />
                ) : isRead ? (
                  <CheckCircle2 size={16} className="shrink-0 text-green-500" />
                ) : (
                  <Circle size={16} className="text-muted-foreground/40 shrink-0" />
                )}
                <span className="flex-1">
                  <span className="block text-sm font-semibold">
                    {entry.book} {entry.chapter}:{entry.verse}
                  </span>
                  <span className={`block text-[11px] tracking-wide uppercase ${isCurrent ? "opacity-70" : "text-muted-foreground"}`}>
                    {isCurrent ? "Now reading" : isRead ? "Read" : "Pending"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEditingId(entry.id)}
                className={`shrink-0 rounded p-1 ${isCurrent ? "hover:bg-white/10" : "hover:bg-muted"}`}
                aria-label="Correct this reference"
              >
                <Pencil size={14} />
              </button>
            </div>
          );
        })}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default ReadingQueue;
