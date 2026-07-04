import { useEffect, useState } from "react";
import { onDisplayUpdate, type DisplayContent } from "../lib/display-bus";

function DisplayWindow() {
  const [content, setContent] = useState<DisplayContent | null>(null);

  useEffect(() => {
    const unlisten = onDisplayUpdate(setContent);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
