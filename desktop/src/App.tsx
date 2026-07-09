import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { HashRouter } from "react-router-dom";
import OperatorConsole from "./operator/OperatorConsole";
import DisplayWindow from "./display/DisplayWindow";
import { clearPersistedTranscript } from "./store/match-store";

function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    setLabel(win.label);

    // Only the operator window owns the live transcript -- closing it is
    // the operator ending the service, so this is the one place "app
    // close" actually means "wipe today's leftover transcript" rather than
    // the projector display window being hidden/shown mid-service.
    if (win.label !== "main") return;
    const unlistenPromise = win.onCloseRequested(() => {
      clearPersistedTranscript();
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  if (label === null) {
    return null;
  }

  if (label === "display") {
    return <DisplayWindow />;
  }

  // HashRouter, not BrowserRouter -- the operator window loads its bundle
  // from Tauri's local asset protocol, not a server that can rewrite
  // arbitrary paths back to index.html, so routes live in the URL hash
  // (#/console, #/library, ...) rather than the path.
  return (
    <HashRouter>
      <OperatorConsole />
    </HashRouter>
  );
}

export default App;
