import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useMatchStore } from "@/store/match-store";
import type { MatchSuggestion } from "@/lib/ws-messages";

function referenceLabel(s: MatchSuggestion): string {
  return s.kind === "verse" ? `${s.book} ${s.chapter}:${s.verse}` : `Song #${s.song_id}, line ${s.line_number}`;
}

// Reads the matching track's suggestion straight from the zustand match
// store -- no props needed, so the Bible and Songs pages can each drop in
// <SuggestedMatch variant="verse" /> / <SuggestedMatch variant="song" />
// without threading state or callbacks down through the page component.
function SuggestedMatch({ variant }: { variant: "verse" | "song" }) {
  const suggestion = useMatchStore((s) => (variant === "verse" ? s.verseSuggestion : s.songSuggestion));
  const confirm = useMatchStore((s) => s.confirm);
  const dismiss = useMatchStore((s) => (variant === "verse" ? s.clearVerseSuggestion : s.clearSongSuggestion));

  useEffect(() => {
    if (!suggestion) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        confirm(suggestion as MatchSuggestion);
      } else if (e.code === "Escape") {
        dismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [suggestion, confirm, dismiss]);

  if (suggestion === null) {
    return null;
  }

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b py-4">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Sparkles size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">Confident Match</p>
            <p className="text-muted-foreground text-xs">
              {suggestion.match_type === "regex" ? "Direct reference" : "Wording match"} ·{" "}
              {(suggestion.confidence * 100).toFixed(1)}% confidence
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {suggestion.kind === "verse" && suggestion.book && <Badge variant="secondary">{suggestion.book}</Badge>}
          {suggestion.translation && <Badge variant="outline">{suggestion.translation}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="py-5">
        <p className="text-2xl font-bold">{referenceLabel(suggestion)}</p>
        <blockquote className="border-primary/50 text-foreground/80 mt-3 border-l-2 pl-4 text-base">
          &ldquo;{suggestion.text}&rdquo;
        </blockquote>
      </CardContent>

      <CardFooter className="flex flex-col gap-0 border-t p-0!">
        <div className="flex w-full items-center gap-3 p-4">
          <Button className="flex-1" size="lg" onClick={() => confirm(suggestion)}>
            Confirm &amp; Display
          </Button>
          <Button variant="outline" size="lg" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
        <div className="flex w-full items-center gap-2 border-t px-4 py-2">
          <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">SPACE</kbd>
          <span className="text-muted-foreground text-[10px]">Confirm</span>
          <kbd className="bg-muted text-muted-foreground ml-3 rounded px-1.5 py-0.5 font-mono text-[10px]">ESC</kbd>
          <span className="text-muted-foreground text-[10px]">Dismiss</span>
        </div>
      </CardFooter>
    </Card>
  );
}

export default SuggestedMatch;
