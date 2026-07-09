import { Radio } from "lucide-react";
import { displayCaption, useDisplayPreviewStore } from "@/store/display-preview-store";

// A miniature mirror of the actual projector output, floating over the
// console -- so the operator can see exactly what the congregation is
// seeing right now without needing a second monitor to check. Reuses the
// same shared display-preview-store the projector window itself renders
// from, not a second guess at what's on screen.
function LivePreview() {
  const content = useDisplayPreviewStore((s) => s.content);
  const blackedOut = useDisplayPreviewStore((s) => s.blackedOut);

  return (
    <div className="border-border bg-card fixed right-6 bottom-6 z-40 w-64 overflow-hidden rounded-xl border shadow-lg">
      <div className="border-border flex items-center gap-1.5 border-b px-3 py-1.5">
        <Radio size={11} className="text-primary" />
        <span className="text-primary text-[10px] font-semibold tracking-widest uppercase">Live Output</span>
      </div>
      <div className="flex aspect-video flex-col items-center justify-center gap-1.5 bg-black px-4 text-center">
        {blackedOut ? null : content ? (
          <>
            <p className="line-clamp-3 text-xs leading-snug font-semibold text-white">{content.text}</p>
            {displayCaption(content) && (
              <p className="text-primary text-[10px] font-medium tracking-wide">{displayCaption(content)}</p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-neutral-600">Nothing displayed</p>
        )}
      </div>
    </div>
  );
}

export default LivePreview;
