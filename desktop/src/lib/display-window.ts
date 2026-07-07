import { availableMonitors, currentMonitor, PhysicalPosition, Window } from "@tauri-apps/api/window";

// The "display" window (the actual projector output, see
// desktop/src/display/DisplayWindow.tsx) starts hidden by design
// (tauri.conf.json: visible: false) -- a church service shouldn't briefly
// flash an empty black window on the projector every time the app launches.
// But nothing was ever wired up to *show* it again, which is the whole bug:
// there was no way to get from "app open" to "something on the projector"
// at all. This is that missing piece.
async function getDisplayWindow(): Promise<Window | null> {
  return Window.getByLabel("display");
}

export async function isDisplayVisible(): Promise<boolean> {
  const win = await getDisplayWindow();
  return win ? await win.isVisible() : false;
}

export async function showDisplay(): Promise<void> {
  const win = await getDisplayWindow();
  if (!win) return;

  // Best-effort: if there's a second monitor (the real projector setup),
  // place the window there before showing it, rather than leaving it
  // stacked on top of the operator console on the same screen where it'd be
  // easy to miss entirely. `currentMonitor`/`availableMonitors` are scoped to
  // whichever window is calling them (i.e. the operator window, since this
  // runs from the operator console's JS context), not the display window --
  // exactly what's needed to find a monitor *other than* the operator's own.
  // Falls back to wherever it already is if there's only one monitor
  // (dev/testing) or monitor info isn't available.
  try {
    const [monitors, operatorMonitor] = await Promise.all([availableMonitors(), currentMonitor()]);
    const external = monitors.find(
      (m) => m.position.x !== operatorMonitor?.position.x || m.position.y !== operatorMonitor?.position.y,
    );
    if (external) {
      await win.setPosition(new PhysicalPosition(external.position.x, external.position.y));
    }
  } catch {
    // Monitor enumeration failing shouldn't block just showing the window.
  }

  await win.show();
  await win.setFocus();
}

export async function hideDisplay(): Promise<void> {
  const win = await getDisplayWindow();
  await win?.hide();
}

export async function setDisplayFullscreen(fullscreen: boolean): Promise<void> {
  const win = await getDisplayWindow();
  await win?.setFullscreen(fullscreen);
}
