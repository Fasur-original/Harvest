import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useMatchStore } from "@/store/match-store";
import LiveTranscript from "./LiveTranscript";
import MatchOptions from "./MatchOptions";
import PageHeader from "./PageHeader";
import PendingMatches from "./PendingMatches";
import ReadingQueue from "./ReadingQueue";
import TranslationComparison from "./TranslationComparison";

const API_BASE = "http://localhost:8000";

type VerseResult = { book: string; chapter: number; verse: number; translation: string; text: string };

function VerseSearch() {
  const confirm = useMatchStore((s) => s.confirm);
  const [query, setQuery] = useState({ book: "John", chapter: "3", verse: "16", translation: "KJV" });
  const [result, setResult] = useState<VerseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 350);

  useEffect(() => {
    if (!debounced.book.trim() || !debounced.chapter.trim() || !debounced.verse.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams(debounced);
    fetch(`${API_BASE}/bible/verse?${params}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setResult(null);
          setError(res.status === 404 ? "Verse not found" : `Error ${res.status}`);
          return;
        }
        setError(null);
        setResult(await res.json());
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search size={16} /> Search Verses
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">Book</Label>
            <Input value={query.book} onChange={(e) => setQuery({ ...query, book: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">Chapter</Label>
            <Input className="w-16" value={query.chapter} onChange={(e) => setQuery({ ...query, chapter: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">Verse</Label>
            <Input className="w-16" value={query.verse} onChange={(e) => setQuery({ ...query, verse: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">Translation</Label>
            <select
              value={query.translation}
              onChange={(e) => setQuery({ ...query, translation: e.target.value })}
              className="border-input bg-transparent h-8 rounded-lg border px-2.5 text-sm"
            >
              <option>KJV</option>
              <option>ASV</option>
              <option>YLT</option>
              <option>WEB</option>
            </select>
          </div>
        </div>

        {loading && <Skeleton className="h-16 w-full" />}
        {!loading && error && <p className="text-destructive text-sm">{error}</p>}
        {!loading && result && (
          <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-xl border p-4">
            <p className="text-sm">
              <span className="font-semibold">
                {result.book} {result.chapter}:{result.verse} ({result.translation})
              </span>{" "}
              — {result.text}
            </p>
            <Button className="shrink-0" onClick={() => confirm({ kind: "verse", ...result })}>
              Confirm
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BiblePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Bible" subtitle="Live scripture matching, reading queue, and manual search — all in one place." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <ReadingQueue />
        <div className="flex flex-col gap-6">
          <LiveTranscript />
          <TranslationComparison />
          <PendingMatches variant="verse" />
          <MatchOptions variant="verse" />
          <VerseSearch />
        </div>
      </div>
    </div>
  );
}

export default BiblePage;
