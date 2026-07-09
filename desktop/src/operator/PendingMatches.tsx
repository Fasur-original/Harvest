import { useEffect } from "react";
import { AlertTriangle, BookOpen, Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useMatchStore, type PendingMatch } from "@/store/match-store";

const MATCH_TYPE_LABEL: Record<PendingMatch["match_type"], string> = {
  regex: "Direct reference",
  llm: "AI cleanup",
  embedding: "Wording match",
};

function referenceLabel(s: PendingMatch): string {
  return s.kind === "verse" ? `${s.book} ${s.chapter}:${s.verse}` : `Song #${s.song_id}, line ${s.line_number}`;
}

// Verse and song cards use different accent colors/icons so the operator
// can tell at a glance what kind of match they're looking at before reading
// any text -- verse stays the app's primary orange, song gets a distinct
// violet so the two never look interchangeable in a mixed queue view.
const VARIANT_STYLE = {
  verse: { icon: BookOpen, iconClass: "bg-primary text-primary-foreground" },
  song: { icon: Music2, iconClass: "bg-violet-500 text-white" },
} as const;

function PendingMatchCard({
  item,
  isFront,
  variant,
}: {
  item: PendingMatch;
  isFront: boolean;
  variant: "verse" | "song";
}) {
  const confirmItem = useMatchStore((s) => s.confirmItem);
  const skipItem = useMatchStore((s) => s.skipItem);
  const { icon: Icon, iconClass } = VARIANT_STYLE[variant];

  useEffect(() => {
    // Only the card at the front of its queue responds to keyboard shortcuts
    // -- with several cards visible, Space/Escape has to have one
    // unambiguous target, and the most recently arrived one (rendered on
    // top -- see PendingMatches below) is the one the operator is most
    // likely already reading.
    if (!isFront) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        confirmItem(variant, item);
      } else if (e.code === "Escape") {
        skipItem(variant, item.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFront, variant, item, confirmItem, skipItem]);

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b py-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
            <Icon size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">{MATCH_TYPE_LABEL[item.match_type]}</p>
            <p className="text-muted-foreground text-xs">{(item.confidence * 100).toFixed(1)}% confidence</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {item.kind === "verse" && item.book && <Badge variant="secondary">{item.book}</Badge>}
          {item.translation && <Badge variant="outline">{item.translation}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="py-5">
        {item.source_text && (
          <p className="text-muted-foreground mb-3 text-xs">
            Heard: <span className="italic">&ldquo;{item.source_text}&rdquo;</span>
          </p>
        )}
        {item.translation_note && (
          <p className="mb-3 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Requested <strong>{item.translation_note.requested}</strong> — not loaded, showing{" "}
              <strong>{item.translation_note.used}</strong> instead.
            </span>
          </p>
        )}
        <p className="text-2xl font-bold">{referenceLabel(item)}</p>
        <blockquote className="border-primary/50 text-foreground/80 mt-3 border-l-2 pl-4 text-base">
          &ldquo;{item.text}&rdquo;
        </blockquote>
      </CardContent>

      <CardFooter className="flex flex-col gap-0 border-t p-0!">
        <div className="flex w-full items-center gap-3 p-4">
          <Button className="flex-1" size="lg" onClick={() => confirmItem(variant, item)}>
            Confirm &amp; Display
          </Button>
          <Button variant="outline" size="lg" onClick={() => skipItem(variant, item.id)}>
            Skip
          </Button>
        </div>
        {isFront && (
          <div className="flex w-full items-center gap-2 border-t px-4 py-2">
            <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">SPACE</kbd>
            <span className="text-muted-foreground text-[10px]">Confirm</span>
            <kbd className="bg-muted text-muted-foreground ml-3 rounded px-1.5 py-0.5 font-mono text-[10px]">ESC</kbd>
            <span className="text-muted-foreground text-[10px]">Skip</span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

// A visible, ordered queue of pending matches -- not a single box that gets
// silently replaced by the next result. A chunk can produce several matches
// in sequence (the LLM cleanup step's batch classification especially), and
// the operator needs to see everything waiting, confirm or skip each one
// independently, without losing track of the rest.
function PendingMatches({ variant }: { variant: "verse" | "song" }) {
  const items = useMatchStore((s) => (variant === "verse" ? s.verseSuggestions : s.songSuggestions));

  if (items.length === 0) {
    return null;
  }

  // Newest arrival on top, oldest at the bottom -- the most recent thing
  // said is what the operator is most likely acting on right now, and it's
  // also the keyboard-shortcut target (isFront), consistent with it being
  // visually first. New items are appended to the end of the underlying
  // store array (see match-store.ts), so reverse for display here.
  const ordered = [...items].reverse();

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((item, i) => (
        <PendingMatchCard key={item.id} item={item} isFront={i === 0} variant={variant} />
      ))}
    </div>
  );
}

export default PendingMatches;
