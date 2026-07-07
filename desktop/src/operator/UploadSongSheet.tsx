import { useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, ListPlus, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQueueStore } from "@/store/queue-store";

const API_BASE = "http://localhost:8000";

type ImportResult = {
  imported: { id: number; title: string }[];
  errors: { tab: string; problem: string }[];
};

const exampleRows: [string, string][] = [
  ["Amazing grace, how sweet the sound", ""],
  ["That saved a wretch like me", ""],
  ["I once was lost, but now am found", "3"],
  ["Was blind, but now I see", ""],
];

function FormatGuide() {
  return (
    <details className="bg-muted/50 rounded-lg px-3 py-2 text-xs">
      <summary className="text-foreground cursor-pointer font-medium select-none">
        Format guide — one tab per song
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p>Each tab needs a header row, then one lyric line per row. The tab name becomes the song title.</p>
        <div className="overflow-x-auto">
          <table className="border-border overflow-hidden rounded-lg border">
            <thead>
              <tr className="bg-muted">
                <th className="border-border border px-2 py-1 text-left font-semibold">line_text</th>
                <th className="border-border border px-2 py-1 text-left font-semibold">repeat_count</th>
              </tr>
            </thead>
            <tbody>
              {exampleRows.map(([text, repeat], i) => (
                <tr key={i} className="bg-background">
                  <td className="border-border border px-2 py-1">{text}</td>
                  <td className="border-border text-muted-foreground border px-2 py-1">{repeat || "(blank)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <span className="text-foreground font-semibold">line_text</span> is required.{" "}
          <span className="text-foreground font-semibold">repeat_count</span> is optional — blank defaults to 1; only
          fill it in for a line sung more than once.
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

function UploadSongSheet() {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/songs/upload`, { method: "POST", body: formData });
      if (!res.ok) {
        setError(`Error ${res.status}`);
        toast.error(`Upload failed (${res.status})`);
        return;
      }
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.imported.length > 0) {
        toast.success(`Imported ${data.imported.length} song${data.imported.length === 1 ? "" : "s"}`);
      }
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} tab${data.errors.length === 1 ? "" : "s"} had errors`);
      }
    } finally {
      setPending(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) upload(dropped);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bulk Upload</CardTitle>
        <p className="text-muted-foreground text-sm">Upload a song sheet workbook to sync the library.</p>
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
            <p className="text-muted-foreground text-xs">Supports .xlsx</p>
          </div>
          <div className="flex items-center gap-2">
            <label className={cn(buttonVariants({ size: "lg" }), "cursor-pointer")}>
              Browse Files
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) upload(picked);
                  e.target.value = "";
                }}
              />
            </label>
            <a
              href={`${API_BASE}/songs/template`}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-1.5")}
            >
              <Download size={14} /> Download Template
            </a>
          </div>
        </div>

        {pending && <Skeleton className="h-24 w-full" />}
        {!pending && error && <p className="text-destructive text-sm">{error}</p>}

        {!pending && result && (result.imported.length > 0 || result.errors.length > 0) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {result.imported.length > 0 && (
                <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                  <CheckCircle2 size={12} /> {result.imported.length} Ready
                </Badge>
              )}
              {result.errors.length > 0 && (
                <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  <AlertTriangle size={12} /> {result.errors.length} Error{result.errors.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Song</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.imported.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>
                        <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                          <CheckCircle2 size={12} /> Ready
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <AddToQueueCell songId={s.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {result.errors.map((e, i) => (
                    <TableRow key={`err-${i}`}>
                      <TableCell className="font-medium">{e.tab}</TableCell>
                      <TableCell colSpan={2}>
                        <Badge
                          className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                          title={e.problem}
                        >
                          <AlertTriangle size={12} /> {e.problem}
                        </Badge>
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
