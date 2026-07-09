import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useMatchStore } from "@/store/match-store";

// PART 2 of translation switching: "show me the strongest rendering of
// this" / "which version captures this best". Every translation loaded for
// the identified verse, ranked by how closely its own wording matches what
// the preacher just said -- deliberately labeled "closest match to what was
// said" everywhere here, not "strongest" or "best", so the wording doesn't
// imply a scholarly or theological claim the ranking isn't actually making
// (it's a similarity score against the spoken context, nothing more). The
// operator picks one; nothing here auto-pushes to the display.
function TranslationComparison() {
  const comparison = useMatchStore((s) => s.translationComparison);
  const confirm = useMatchStore((s) => s.confirm);
  const dismiss = useMatchStore((s) => s.clearTranslationComparison);

  if (comparison === null || comparison.rankings.length === 0) {
    return null;
  }

  const topSimilarity = comparison.rankings[0].similarity;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Languages size={16} /> Closest Match to What Was Said
        </h2>
        <p className="text-muted-foreground text-xs">
          {comparison.book} {comparison.chapter}:{comparison.verse} — ranked by wording similarity to the sentence
          below, not by translation accuracy.
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Heard: <span className="italic">&ldquo;{comparison.source_text}&rdquo;</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {comparison.rankings.map((r) => {
          // Relative to the closest match, not the raw cosine score -- a
          // raw number ("0.84 similarity") isn't meaningful to read at a
          // glance; how it stacks up against the others in this same list is.
          const relativePercent = topSimilarity > 0 ? Math.round((r.similarity / topSimilarity) * 100) : 0;
          return (
            <Card key={r.translation} className="justify-between py-4">
              <CardContent>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{r.translation}</span>
                  <span className="text-muted-foreground text-xs">{relativePercent}%</span>
                </div>
                <div className="bg-muted mb-2 h-1.5 w-full overflow-hidden rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${relativePercent}%` }} />
                </div>
                <p className="text-muted-foreground text-sm">&ldquo;{r.text}&rdquo;</p>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() =>
                    confirm({
                      kind: "verse",
                      book: comparison.book,
                      chapter: comparison.chapter,
                      verse: comparison.verse,
                      translation: r.translation,
                      text: r.text,
                    })
                  }
                >
                  Select &amp; Display
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <Button variant="link" className="w-fit px-0" onClick={dismiss}>
        Dismiss
      </Button>
    </div>
  );
}

export default TranslationComparison;
