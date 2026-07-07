import { useEffect, useState } from "react";
import { Maximize, Minimize, MonitorOff, MonitorPlay } from "lucide-react";
import { hideDisplay, isDisplayVisible, setDisplayFullscreen, showDisplay } from "../lib/display-window";

// The projector output is its own hidden-by-default OS window (see
// tauri.conf.json + desktop/src/display/DisplayWindow.tsx) -- there was
// previously no way to bring it up from the app at all. This is the fix:
// always-visible in the sidebar (not buried in a settings page) since it's
// the one control an operator needs before anything else will be visible to
// the congregation.
function ProjectorControl() {
  const [visible, setVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    isDisplayVisible()
      .then(setVisible)
      .catch(() => {});
  }, []);

  async function toggleVisible() {
    if (pending) return;
    setPending(true);
    try {
      if (visible) {
        await hideDisplay();
        setVisible(false);
        setFullscreen(false);
      } else {
        await showDisplay();
        setVisible(true);
      }
    } finally {
      setPending(false);
    }
  }

  async function toggleFullscreen() {
    if (pending || !visible) return;
    setPending(true);
    try {
      await setDisplayFullscreen(!fullscreen);
      setFullscreen(!fullscreen);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-900 px-3 py-2.5">
      <p className="text-[11px] font-medium tracking-widest text-neutral-500 uppercase">Projector</p>
      <button
        type="button"
        onClick={toggleVisible}
        disabled={pending}
        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          visible ? "bg-green-500/15 text-green-400" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
        }`}
      >
        {visible ? <MonitorPlay size={14} /> : <MonitorOff size={14} />}
        {visible ? "Showing" : "Show Display"}
      </button>
      {visible && (
        <button
          type="button"
          onClick={toggleFullscreen}
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      )}
    </div>
  );
}

export default ProjectorControl;
