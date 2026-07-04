use tauri::{Manager, PhysicalPosition};

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
