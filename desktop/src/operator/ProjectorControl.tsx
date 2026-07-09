import { useEffect, useState } from "react";
import { Ban, Maximize, Minimize, MonitorOff, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { hideDisplay, isDisplayVisible, setDisplayFullscreen, showDisplay } from "../lib/display-window";
import { useSocketStore } from "@/store/socket-store";

// The projector output is its own hidden-by-default OS window (see
// tauri.conf.json + desktop/src/display/DisplayWindow.tsx) -- there was
// previously no way to bring it up from the app at all. This is the fix:
// always-visible in the sidebar (not buried in a settings page) since it's
// the one control an operator needs before anything else will be visible to
// the congregation.
function ProjectorControl() {
  const send = useSocketStore((s) => s.send);
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
    <div className="bg-sidebar-accent flex flex-col gap-2 rounded-lg px-3 py-2.5">
      <p className="text-sidebar-accent-foreground/50 text-[11px] font-medium tracking-widest uppercase">
        Projector
      </p>
      <button
        type="button"
        onClick={toggleVisible}
        disabled={pending}
        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          visible
            ? "bg-green-500/15 text-green-600 dark:text-green-400"
            : "bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground hover:bg-sidebar-accent-foreground/15"
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
          className="bg-sidebar-accent-foreground/10 text-sidebar-accent-foreground hover:bg-sidebar-accent-foreground/15 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          send({ action: "blackout" });
          toast("Projector blacked out");
        }}
        className="bg-sidebar-accent-foreground/10 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-300"
      >
        <Ban size={14} /> Blackout
      </button>
    </div>
  );
}

export default ProjectorControl;
