import { useEffect, useState } from "react";
import { useSocketStore } from "@/store/socket-store";

type DisplayContent = {
  kind: "verse" | "song";
  text: string;
  book?: string;
  chapter?: number;
  verse?: number;
  title?: string;
};

function isConfirmedContent(message: unknown): message is DisplayContent & { action: "confirm" } {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.action === "confirm" && typeof candidate.text === "string";
}

function isBlackoutMessage(message: unknown): boolean {
  if (typeof message !== "object" || message === null) return false;
  return (message as Record<string, unknown>).action === "blackout";
}

function caption(content: DisplayContent): string | null {
  if (content.kind === "verse" && content.book) {
    return `${content.book} ${content.chapter}:${content.verse}`;
  }
  return content.kind === "song" ? (content.title ?? null) : null;
}

function DisplayWindow() {
  const lastMessage = useSocketStore((s) => s.lastMessage);
  const [content, setContent] = useState<DisplayContent | null>(null);
  // Distinct from `content === null` (nothing confirmed yet, pre-service) --
  // an operator-triggered blackout should be pure black, not the idle
  // "Harvest" placeholder, since that placeholder is a dev/pre-service
  // signal, not something the congregation should see mid-service.
  const [blackedOut, setBlackedOut] = useState(false);

  useEffect(() => {
    if (isConfirmedContent(lastMessage)) {
      setContent(lastMessage);
      setBlackedOut(false);
    } else if (isBlackoutMessage(lastMessage)) {
      setBlackedOut(true);
    }
  }, [lastMessage]);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-black p-16 text-center">
      {blackedOut ? null : content ? (
        <div className="flex flex-col items-center gap-6">
          <p className="text-6xl leading-tight font-semibold text-white">{content.text}</p>
          {caption(content) && (
            <p className="text-xl font-medium tracking-wide text-orange-400">{caption(content)}</p>
          )}
        </div>
      ) : (
        <p className="text-2xl text-neutral-600">Harvest</p>
      )}
    </main>
  );
}

export default DisplayWindow;
