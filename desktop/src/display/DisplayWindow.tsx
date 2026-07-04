import { useEffect, useState } from "react";
import { useBackendSocket } from "../lib/backend-ws";

type DisplayContent = {
  kind: "verse" | "song";
  text: string;
};

function isConfirmedContent(message: unknown): message is DisplayContent & { action: "confirm" } {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate.action === "confirm" && typeof candidate.text === "string";
}

function DisplayWindow() {
  const { lastMessage } = useBackendSocket();
  const [content, setContent] = useState<DisplayContent | null>(null);

  useEffect(() => {
    if (isConfirmedContent(lastMessage)) {
      setContent({ kind: lastMessage.kind, text: lastMessage.text });
    }
  }, [lastMessage]);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-black p-16 text-center">
      {content ? (
        <p className="text-6xl leading-tight font-semibold text-white">{content.text}</p>
      ) : (
        <p className="text-2xl text-neutral-600">Harvest</p>
      )}
    </main>
  );
}

export default DisplayWindow;
