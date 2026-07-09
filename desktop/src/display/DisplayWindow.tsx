import { displayCaption, useDisplayPreviewStore } from "@/store/display-preview-store";

function DisplayWindow() {
  const content = useDisplayPreviewStore((s) => s.content);
  // Distinct from `content === null` (nothing confirmed yet, pre-service) --
  // an operator-triggered blackout should be pure black, not the idle
  // "Harvest" placeholder, since that placeholder is a dev/pre-service
  // signal, not something the congregation should see mid-service.
  const blackedOut = useDisplayPreviewStore((s) => s.blackedOut);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-black p-16 text-center">
      {blackedOut ? null : content ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-6xl leading-tight font-semibold text-white">{content.text}</p>
          {displayCaption(content) && (
            <p className="text-xl font-medium tracking-wide text-orange-400">{displayCaption(content)}</p>
          )}
        </div>
      ) : (
        <p className="text-2xl text-neutral-600">Harvest</p>
      )}
    </main>
  );
}

export default DisplayWindow;
