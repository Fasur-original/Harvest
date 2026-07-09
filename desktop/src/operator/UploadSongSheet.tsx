import { useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, ListPlus, Trash2, UploadCloud, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueueStore } from "@/store/queue-store";

const API_BASE = "http://localhost:8000";

type ParsedLine = { line_number: number; line_text: string; repeat_count: number };
type ReadyRow = { key: string; title: string; artist: string; lines: ParsedLine[] };
type ErrorRow = { key: string; label: string; problem: string };

type PreviewResponse = {
  ready: { title: string; artist: string | null; lines: ParsedLine[] }[];
  errors: { tab: string; problem: string }[];
};

type CommitResponse = { imported: { id: number; title: string; artist: string | null }[] };

function FormatGuide() {
  return (
    <details className="bg-muted/50 rounded-lg px-3 py-2 text-xs">
      <summary className="text-foreground cursor-pointer font-medium select-none">Format guide</summary>
      <div className="mt-2 flex flex-col gap-3">
        <p>
          One row per song, with columns <span className="text-foreground font-semibold">title</span> (required),{" "}
          <span className="text-foreground font-semibold">artist</span> (optional), and{" "}
          <span className="text-foreground font-semibold">lyrics</span> (required — each lyric line on its own line
          inside that one cell).
        </p>
        <div className="overflow-x-auto">
          <table className="border-border overflow-hidden rounded-lg border">
            <thead>
              <tr className="bg-muted">
                <th className="border-border border px-2 py-1 text-left font-semibold">title</th>
                <th className="border-border border px-2 py-1 text-left font-semibold">artist</th>
                <th className="border-border border px-2 py-1 text-left font-semibold">lyrics</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-background align-top">
                <td className="border-border border px-2 py-1">Amazing Grace</td>
                <td className="border-border border px-2 py-1">John Newton</td>
                <td className="border-border border px-2 py-1">
                  Amazing grace, how sweet the sound
                  <br />
                  That saved a wretch like me
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Prefer preparing one tab per song instead (with a repeat-count column)?{" "}
          <a href={`${API_BASE}/songs/template`} className="text-primary font-medium underline underline-offset-2">
            Download that workbook format
          </a>{" "}
          — both are accepted here.
        </p>
      </div>
    </details>
  );
}

function AddToQueueCell({ songId }: { songId: number }) {
  const addSongToQueue = useQueueStore((s) => s.addSongToQueue);
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");

  async function handleClick() {
    const error = await addSongToQueue(songId);
    if (error) {
      setStatus("error");
      toast.error(error);
    } else {
      setStatus("added");
      toast.success("Added to song queue");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={status === "added"} className="gap-1.5">
      <ListPlus size={12} />
      {status === "added" ? "Added" : status === "error" ? "Retry" : "Add to Queue"}
    </Button>
  );
}

function FixEntryForm({ row, onResolve }: { row: ErrorRow; onResolve: (title: string, artist: string, lyrics: string) => void }) {
  const [title, setTitle] = useState(row.label.startsWith("row ") ? "" : row.label);
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");

  return (
    <TableCell colSpan={4}>
      <div className="flex flex-col gap-2 py-1">
        <p className="text-muted-foreground text-xs" title={row.problem}>
          {row.problem}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Song title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-48" />
          <Input placeholder="Artist (optional)" value={artist} onChange={(e) => setArtist(e.target.value)} className="w-48" />
        </div>
        <textarea
          placeholder="One lyric line per row..."
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={3}
          className="border-input bg-transparent w-full rounded-lg border px-2.5 py-1.5 text-sm"
        />
        <Button size="sm" className="w-fit" onClick={() => onResolve(title, artist, lyrics)}>
          Save Entry
        </Button>
      </div>
    </TableCell>
  );
}

function UploadSongSheet() {
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [readyRows, setReadyRows] = useState<ReadyRow[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [imported, setImported] = useState<{ id: number; title: string }[]>([]);
  const [fixingKey, setFixingKey] = useState<string | null>(null);

  async function parse(file: File) {
    if (parsing) return;
    setParsing(true);
    setReadyRows([]);
    setErrorRows([]);
    setImported([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/songs/import/preview`, { method: "POST", body: formData });
      if (!res.ok) {
        toast.error(`Couldn't read that file (${res.status})`);
        return;
      }
      const data: PreviewResponse = await res.json();
      setReadyRows(
        data.ready.map((s, i) => ({ key: `r${i}`, title: s.title, artist: s.artist ?? "", lines: s.lines })),
      );
      setErrorRows(data.errors.map((e, i) => ({ key: `e${i}`, label: e.tab, problem: e.problem })));
      if (data.ready.length === 0 && data.errors.length === 0) {
        toast.warning("No songs found in that file");
      }
    } finally {
      setParsing(false);
    }
  }

  function removeReady(key: string) {
    setReadyRows((rows) => rows.filter((r) => r.key !== key));
  }

  function updateReady(key: string, patch: Partial<ReadyRow>) {
    setReadyRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function resolveError(errorRow: ErrorRow, title: string, artist: string, lyrics: string) {
    const lines = lyrics
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line_text, i) => ({ line_number: i + 1, line_text, repeat_count: 1 }));
    if (!title.trim() || lines.length === 0) {
      toast.error("Needs a title and at least one lyric line");
      return;
    }
    setReadyRows((rows) => [...rows, { key: `fixed-${errorRow.key}`, title: title.trim(), artist, lines }]);
    setErrorRows((rows) => rows.filter((r) => r.key !== errorRow.key));
    setFixingKey(null);
  }

  async function processUpload() {
    if (readyRows.length === 0 || committing) return;
    setCommitting(true);
    try {
      const res = await fetch(`${API_BASE}/songs/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songs: readyRows.map((r) => ({ title: r.title, artist: r.artist.trim() || null, lines: r.lines })),
        }),
      });
      if (!res.ok) {
        toast.error(`Import failed (${res.status})`);
        return;
      }
      const data: CommitResponse = await res.json();
      setImported(data.imported);
      setReadyRows([]);
      toast.success(`Imported ${data.imported.length} song${data.imported.length === 1 ? "" : "s"}`);
    } finally {
      setCommitting(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) parse(dropped);
  }

  const totalRecords = readyRows.length + errorRows.length;
  const estimatedSeconds = Math.max(1, Math.ceil(readyRows.length * 0.3));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bulk Upload</CardTitle>
        <p className="text-muted-foreground text-sm">
          Upload a spreadsheet to sync the library — nothing is saved until you review and confirm below.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormatGuide />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <span className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
            <UploadCloud size={22} />
          </span>
          <div>
            <p className="text-sm font-semibold">Drop your spreadsheet here</p>
            <p className="text-muted-foreground text-xs">Supports .csv and .xlsx</p>
          </div>
          <div className="flex items-center gap-2">
            <label className={cn(buttonVariants({ size: "lg" }), "cursor-pointer")}>
              Browse Files
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) parse(picked);
                  e.target.value = "";
                }}
              />
            </label>
            <a
              href={`${API_BASE}/songs/import/template`}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-1.5")}
            >
              <Download size={14} /> Download Template
            </a>
          </div>
        </div>

        {parsing && <Skeleton className="h-24 w-full" />}

        {!parsing && (readyRows.length > 0 || errorRows.length > 0) && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                <CheckCircle2 size={12} /> {readyRows.length} Ready
              </Badge>
              {errorRows.length > 0 && (
                <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  <AlertTriangle size={12} /> {errorRows.length} Error{errorRows.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Song Title</TableHead>
                    <TableHead>Artist / Author</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readyRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        <Input
                          value={row.title}
                          onChange={(e) => updateReady(row.key, { title: e.target.value })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.artist}
                          placeholder="—"
                          onChange={(e) => updateReady(row.key, { artist: e.target.value })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                          <CheckCircle2 size={12} /> Ready
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeReady(row.key)}>
                          <Trash2 size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {errorRows.map((row) =>
                    fixingKey === row.key ? (
                      <TableRow key={row.key}>
                        <FixEntryForm row={row} onResolve={(t, a, l) => resolveError(row, t, a, l)} />
                      </TableRow>
                    ) : (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell colSpan={2}>
                          <Badge
                            className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                            title={row.problem}
                          >
                            <AlertTriangle size={12} /> Missing Info
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFixingKey(row.key)}>
                            <Wrench size={12} /> Fix Entry
                          </Button>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="text-muted-foreground flex gap-4 text-xs">
                <span>
                  Total Records: <span className="text-foreground font-semibold">{totalRecords}</span>
                </span>
                <span>
                  Estimated Time: <span className="text-foreground font-semibold">&lt; {estimatedSeconds}s</span>
                </span>
                {errorRows.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {errorRows.length} record{errorRows.length === 1 ? "" : "s"} require attention
                  </span>
                )}
              </div>
              <Button onClick={processUpload} disabled={readyRows.length === 0 || committing}>
                {committing ? "Importing..." : "Process Upload"}
              </Button>
            </div>
          </div>
        )}

        {imported.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Imported</p>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Song</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imported.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>
                        <AddToQueueCell songId={s.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UploadSongSheet;
