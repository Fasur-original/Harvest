use tauri::{Manager, PhysicalPosition, WindowEvent};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            place_display_window(app.handle())?;
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
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
