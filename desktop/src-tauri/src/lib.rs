use tauri::{Manager, PhysicalPosition, WindowEvent};

#[cfg(not(debug_assertions))]
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandChild;

// Only spawned/tracked in a release build -- see spawn_backend_sidecar below
// for why dev mode doesn't touch any of this.
#[cfg(not(debug_assertions))]
struct BackendSidecar(Mutex<Option<CommandChild>>);

/// Positions the projector window on a monitor different from the operator
/// console's, full-screen, if a second monitor is connected. On a single-monitor
/// dev machine it's left as a normal window so it stays visible and draggable.
fn place_display_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let Some(display_window) = app.get_webview_window("display") else {
        return Ok(());
    };

    let main_monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten());

    let secondary_monitor = display_window
        .available_monitors()?
        .into_iter()
        .find(|monitor| match &main_monitor {
            Some(main) => monitor.position() != main.position(),
            None => true,
        });

    if let Some(monitor) = secondary_monitor {
        let position = *monitor.position();
        display_window.set_position(PhysicalPosition::new(position.x, position.y))?;
        display_window.set_fullscreen(true)?;
    }

    display_window.show()
}

/// Spawns the packaged backend as a Tauri sidecar (Phase 10) -- release
/// builds only. In dev (`pnpm tauri dev`) the developer still runs
/// `uvicorn app.main:app --reload` themselves, exactly as before; trying to
/// spawn `binaries/backend-<target-triple>` in dev would fail outright
/// since that binary only exists after the separate PyInstaller +
/// packaging step, not after a plain `cargo build`. Forwards the sidecar's
/// stdout/stderr to this process's own console for debuggability, and
/// stores its `CommandChild` handle in managed state so `on_window_event`
/// below can kill it when the operator console closes -- skipping that
/// leaves an orphaned backend process running after the window appears
/// closed (called out explicitly in the PDD for this phase).
// Not a `tauri::Result` -- tauri_plugin_shell's own error type doesn't
// convert into tauri::Error via `?`, and more importantly, a sidecar that
// fails to spawn shouldn't take the whole app down with it. Logged and
// swallowed instead: the operator console still opens either way, same
// spirit as this app's other degrade-gracefully-not-crash choices (e.g.
// the LLM cleanup step auto-disabling instead of failing startup).
#[cfg(not(debug_assertions))]
fn spawn_backend_sidecar(app: &tauri::AppHandle) {
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    let sidecar_command = match app.shell().sidecar("backend") {
        Ok(command) => command,
        Err(err) => {
            eprintln!("[backend] failed to prepare sidecar command: {err}");
            return;
        }
    };

    let (mut receiver, child) = match sidecar_command.spawn() {
        Ok(pair) => pair,
        Err(err) => {
            eprintln!("[backend] failed to spawn sidecar: {err}");
            return;
        }
    };

    app.manage(BackendSidecar(Mutex::new(Some(child))));

    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(line) => print!("[backend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprint!("[backend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Error(err) => eprintln!("[backend] sidecar error: {err}"),
                CommandEvent::Terminated(payload) => eprintln!("[backend] sidecar exited: {payload:?}"),
                _ => {}
            }
        }
    });
}

#[cfg(not(debug_assertions))]
fn kill_backend_sidecar(app: &tauri::AppHandle) {
    if let Some(sidecar) = app.try_state::<BackendSidecar>() {
        if let Some(child) = sidecar.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            place_display_window(app.handle())?;
            #[cfg(not(debug_assertions))]
            spawn_backend_sidecar(app.handle());
            Ok(())
        })
        // The projector "display" window is a separate, genuinely open
        // window (place_display_window always shows it), not just hidden --
        // Tauri only exits the process once every window is closed, so
        // without this, closing the operator console leaves the display
        // window (and the whole process) running invisibly until something
        // kills it manually. exit(0) tears down every window itself as part
        // of process shutdown -- closing "display" individually first (an
        // earlier version of this did) just raced WebView2's own window-class
        // cleanup against the process exit and surfaced as a benign but noisy
        // "Failed to unregister class Chrome_WidgetWin_0" error on exit.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, WindowEvent::CloseRequested { .. }) {
                #[cfg(not(debug_assertions))]
                kill_backend_sidecar(window.app_handle());
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
