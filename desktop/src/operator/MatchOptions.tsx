import { BookOpen, Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useMatchStore } from "@/store/match-store";
import type { Candidate } from "@/lib/ws-messages";

function describeCandidate(c: Candidate): string {
  if (c.kind === "verse") {
    return `${c.book} ${c.chapter}:${c.verse}`;
  }
  return `Song #${c.song_id}, line ${c.line_number}`;
}

// Shown when the preacher paraphrases or can't quite recall the book,
// verse, or exact wording -- confident enough that *something* relevant was
// said to be worth surfacing, not confident enough in any one reading to
// auto-suggest it the way PendingMatches does. These are mutually exclusive
// readings of one utterance ("pick the right one"), not independent items,
// so unlike PendingMatches this stays a single replaced list rather than a
// queue. Reads straight from the zustand match store.
function MatchOptions({ variant }: { variant: "verse" | "song" }) {
  const candidates = useMatchStore((s) => (variant === "verse" ? s.verseCandidates : s.songCandidates));
  const sourceText = useMatchStore((s) => (variant === "verse" ? s.verseCandidatesSourceText : s.songCandidatesSourceText));
  const confirm = useMatchStore((s) => s.confirm);
  const dismiss = useMatchStore((s) => (variant === "verse" ? s.clearVerseCandidates : s.clearSongCandidates));

  if (candidates === null || candidates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Ranked Match Results</h2>
        <p className="text-muted-foreground text-xs">Not confident enough for one guess — pick the right one.</p>
        {sourceText && (
          <p className="text-muted-foreground mt-1 text-xs">
            Heard: <span className="italic">&ldquo;{sourceText}&rdquo;</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {candidates.map((c, i) => (
          <Card key={i} className="justify-between py-4">
            <CardContent>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {c.kind === "verse" ? <BookOpen size={14} /> : <Music2 size={14} />}
                  {describeCandidate(c)}
                </span>
                <Badge className="shrink-0 whitespace-nowrap">{(c.confidence * 100).toFixed(0)}% match</Badge>
              </div>
              <p className="text-muted-foreground text-sm">&ldquo;{c.text}&rdquo;</p>
            </CardContent>
            <CardFooter>
              <Button className="w-full" size="sm" onClick={() => confirm(c)}>
                Select &amp; Display
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <Button variant="link" className="w-fit px-0" onClick={dismiss}>
        None of these — dismiss
      </Button>
    </div>
  );
}

export default MatchOptions;
