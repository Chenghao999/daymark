use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryInfo {
    name: String,
    is_directory: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeSignature {
    file_count: u64,
    latest_mtime_ms: Option<u64>,
    /// Stable hash of (path, size, mtime) for every Markdown file. Sync
    /// clients may preserve mtimes, so the newest mtime alone can miss a
    /// replaced file; the size keeps the fingerprint sensitive to it.
    fingerprint: String,
}

/// Timestamp (ms since epoch) of a file. Kept for compatibility with earlier
/// builds; new code uses `tree_signature` for the whole Markdown tree.
#[tauri::command]
fn file_mtime_ms(path: String) -> Result<Option<u64>, String> {
    match fs::metadata(&path) {
        Ok(meta) => Ok(meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)),
        Err(_) => Ok(None),
    }
}

/// Read a UTF-8 text file. A missing file is `None`, not an error, so the
/// storage layer can treat "not created yet" as empty.
#[tauri::command]
fn read_text_file(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_atomic(path: &str, contents: &[u8]) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = format!("{path}.tmp");
    fs::write(&tmp, contents).map_err(|error| error.to_string())?;
    fs::rename(&tmp, path).map_err(|error| {
        let _ = fs::remove_file(&tmp);
        error.to_string()
    })
}

/// Atomic text write: temp file, then rename over the target. Cloud-sync
/// clients never see a half-written daily file.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(&path, contents.as_bytes())
}

/// Atomic binary write, used by the DOCX exporter.
#[tauri::command]
fn write_file_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    write_atomic(&path, &contents)
}

#[tauri::command]
fn create_dir_all(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(&path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        entries.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_directory: file_type.is_dir(),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|error| error.to_string())
}

fn visit_markdown(
    directory: &Path,
    depth: u32,
    file_count: &mut u64,
    latest_mtime_ms: &mut Option<u64>,
    hasher: &mut DefaultHasher,
) {
    // root (0) -> month folder (1) -> day file (2)
    if depth > 2 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            visit_markdown(&entry.path(), depth + 1, file_count, latest_mtime_ms, hasher);
            continue;
        }
        if !name.ends_with(".md") {
            continue;
        }
        *file_count += 1;
        let path = entry.path();
        path.to_string_lossy().hash(hasher);
        if let Ok(metadata) = entry.metadata() {
            metadata.len().hash(hasher);
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                    let millis = duration.as_millis() as u64;
                    millis.hash(hasher);
                    if latest_mtime_ms.is_none_or(|latest| millis > latest) {
                        *latest_mtime_ms = Some(millis);
                    }
                }
            }
        }
    }
}

/// One cheap signature for the whole data folder: number of Markdown files,
/// the newest mtime and a fingerprint of every file's path, size and mtime.
/// A sync client adding, removing, touching or replacing any file changes it.
#[tauri::command]
fn tree_signature(root: String) -> Result<TreeSignature, String> {
    let path = Path::new(&root);
    if !path.exists() {
        return Ok(TreeSignature {
            file_count: 0,
            latest_mtime_ms: None,
            fingerprint: String::new(),
        });
    }
    let mut file_count = 0;
    let mut latest_mtime_ms = None;
    let mut hasher = DefaultHasher::new();
    visit_markdown(
        path,
        0,
        &mut file_count,
        &mut latest_mtime_ms,
        &mut hasher,
    );
    Ok(TreeSignature {
        file_count,
        latest_mtime_ms,
        fingerprint: format!("{:016x}", hasher.finish()),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            file_mtime_ms,
            read_text_file,
            write_text_file,
            write_file_bytes,
            create_dir_all,
            list_dir,
            path_exists,
            remove_file,
            rename_path,
            tree_signature
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
