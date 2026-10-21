use std::time::UNIX_EPOCH;

/// Timestamp (ms since epoch) of a file, used by the sync scanner to detect
/// external writes from a cloud-sync client. Returns `None` when the file is
/// missing, which the frontend treats as "not created yet".
#[tauri::command]
fn file_mtime_ms(path: String) -> Result<Option<u64>, String> {
    match std::fs::metadata(&path) {
        Ok(meta) => Ok(meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)),
        Err(_) => Ok(None),
    }
}

/// Atomic write: write to a sibling temp file, then rename over the target.
/// Keeps cloud-sync clients from ever seeing a half-written report file.
#[tauri::command]
fn write_file_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    let tmp = format!("{path}.tmp");
    std::fs::write(&tmp, &contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![file_mtime_ms, write_file_bytes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
