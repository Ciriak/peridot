#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running the Peridot desktop application");
}

#[cfg(all(test, not(any(target_os = "android", target_os = "ios"))))]
mod tests {
    use std::str::FromStr;

    use tauri_plugin_global_shortcut::{Code, Shortcut};

    #[test]
    fn media_key_accelerators_are_valid_global_shortcuts() {
        let shortcuts = [
            ("MediaPlayPause", Code::MediaPlayPause),
            ("MediaTrackNext", Code::MediaTrackNext),
            ("MediaTrackPrevious", Code::MediaTrackPrevious),
        ];

        for (accelerator, expected_key) in shortcuts {
            let shortcut = Shortcut::from_str(accelerator).unwrap();
            assert_eq!(shortcut.key, expected_key);
            assert!(shortcut.mods.is_empty());
        }
    }
}
