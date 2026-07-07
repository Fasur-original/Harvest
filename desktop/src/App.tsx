import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { HashRouter } from "react-router-dom";
import OperatorConsole from "./operator/OperatorConsole";
import DisplayWindow from "./display/DisplayWindow";

function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(getCurrentWindow().label);
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
