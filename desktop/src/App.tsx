import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

  return label === "display" ? <DisplayWindow /> : <OperatorConsole />;
}

export default App;
