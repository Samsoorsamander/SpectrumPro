use lettre::message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};

const DB_NAME: &str = "spectrum_pro.db";
const BACKUP_DIR_NAME: &str = "SpectrumProBackups";
const APP_BACKUP_SUBDIR: &str = "backups";
const MAX_BACKUPS: usize = 30;
const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn send_backup_email(
    smtp_host: String,
    smtp_port: u16,
    smtp_username: String,
    smtp_password: String,
    from_email: String,
    to_email: String,
    subject: String,
    body: String,
    attachment_path: String,
) -> Result<(), String> {
    let bytes = fs::read(&attachment_path)
        .map_err(|e| format!("Failed to read backup attachment: {}", e))?;
    let filename = std::path::Path::new(&attachment_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("spectrum_backup.db")
        .to_string();

    let from_mb: Mailbox = from_email
        .parse()
        .map_err(|e| format!("Invalid sender email: {}", e))?;
    let to_mb: Mailbox = to_email
        .parse()
        .map_err(|e| format!("Invalid recipient email: {}", e))?;

    let message = Message::builder()
        .from(from_mb)
        .to(to_mb)
        .subject(subject)
        .multipart(
            MultiPart::mixed()
                .singlepart(SinglePart::plain(body))
                .singlepart(
                    Attachment::new(filename).body(
                        bytes,
                        ContentType::parse("application/octet-stream")
                            .map_err(|e| format!("Invalid content-type: {}", e))?,
                    ),
                ),
        )
        .map_err(|e| format!("Failed to compose email: {}", e))?;

    let creds = Credentials::new(smtp_username, smtp_password);
    let builder = if smtp_port == 465 {
        SmtpTransport::relay(&smtp_host)
            .map_err(|e| format!("SMTP relay setup failed: {}", e))?
    } else {
        SmtpTransport::starttls_relay(&smtp_host)
            .map_err(|e| format!("SMTP STARTTLS setup failed: {}", e))?
    };
    let mailer = builder.credentials(creds).port(smtp_port).build();
    mailer
        .send(&message)
        .map_err(|e| format!("SMTP send failed: {}", e))?;
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DriveInfo {
    letter: String,
    root: String,
    writable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveBackupResult {
    letter: String,
    path: String,
    ok: bool,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FullBackupResult {
    ok: bool,
    primary_path: String,
    sidecar_path: Option<String>,
    stamp: String,
    drives: Vec<DriveBackupResult>,
    failures: Vec<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupListItem {
    path: String,
    name: String,
    size: u64,
    modified_ms: u64,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreResult {
    ok: bool,
    message: String,
    restored_path: Option<String>,
    sidecar_restored: bool,
}

fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let candidates: Vec<PathBuf> = [
        app.path()
            .app_config_dir()
            .ok()
            .map(|p| p.join(DB_NAME)),
        app.path().app_data_dir().ok().map(|p| p.join(DB_NAME)),
        app.path()
            .app_local_data_dir()
            .ok()
            .map(|p| p.join(DB_NAME)),
    ]
    .into_iter()
    .flatten()
    .collect();

    for path in &candidates {
        if path.is_file() {
            return Ok(path.clone());
        }
    }

    // Prefer AppConfig (matches existing JS backup paths) even if not yet created.
    app.path()
        .app_config_dir()
        .map(|p| p.join(DB_NAME))
        .map_err(|e| format!("Cannot resolve app config dir: {}", e))
}

fn resolve_primary_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve app config dir: {}", e))?
        .join(APP_BACKUP_SUBDIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create backups folder: {}", e))?;
    Ok(dir)
}

fn list_writable_drive_roots() -> Vec<DriveInfo> {
    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
        let letter_ch = letter as char;
        let root = format!("{}:\\", letter_ch);
        let root_path = Path::new(&root);
        if !root_path.exists() {
            continue;
        }
        let backup_dir = root_path.join(BACKUP_DIR_NAME);
        let writable = match fs::create_dir_all(&backup_dir) {
            Ok(_) => {
                // Probe write access
                let probe = backup_dir.join(".spectrum_pro_write_probe");
                match fs::write(&probe, b"ok") {
                    Ok(_) => {
                        let _ = fs::remove_file(&probe);
                        true
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        };
        drives.push(DriveInfo {
            letter: format!("{}:", letter_ch),
            root: root.clone(),
            writable,
        });
    }
    drives
}

fn verify_sqlite_backup(path: &Path) -> Result<(), String> {
    let meta = fs::metadata(path).map_err(|e| format!("Cannot read backup file: {}", e))?;
    if meta.len() < 100 {
        return Err("Backup file is too small or empty.".into());
    }
    let mut file = fs::File::open(path).map_err(|e| format!("Cannot open backup: {}", e))?;
    let mut magic = [0u8; 16];
    file.read_exact(&mut magic)
        .map_err(|e| format!("Cannot read backup header: {}", e))?;
    if magic != SQLITE_MAGIC {
        return Err("Backup is not a valid SQLite database (bad header).".into());
    }
    drop(file);

    // Read-only open so we never create -wal/-shm beside the backup.
    let flags =
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = rusqlite::Connection::open_with_flags(path, flags)
        .map_err(|e| format!("Cannot open backup for verification: {}", e))?;

    // quick_check is accurate enough for restore and much faster on large DBs.
    let result: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|e| format!("Database check failed: {}", e))?;
    if result.trim().to_ascii_lowercase() != "ok" {
        return Err(format!(
            "Backup did not pass database check (got: {}).",
            result
        ));
    }

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| format!("Cannot read schema: {}", e))?;
    let names: std::collections::HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Cannot list tables: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    for table in [
        "products",
        "customers",
        "companies",
        "transactionLogs",
        "settings",
        "expenses",
        "users",
    ] {
        if !names.contains(table) {
            return Err(format!(
                "Backup verification failed: missing expected table '{}'.",
                table
            ));
        }
    }
    // productBatches / customSwatches are created by migrations if absent.
    Ok(())
}

fn copy_file_atomic(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create folder {:?}: {}", parent, e))?;
    }
    let tmp = to.with_extension("tmp_copy");
    fs::copy(from, &tmp).map_err(|e| format!("Copy failed: {}", e))?;
    replace_path(&tmp, to)?;
    Ok(())
}

/// Replace `to` with `from` (typically a temp file). Windows-safe when the target may exist.
fn replace_path(from: &Path, to: &Path) -> Result<(), String> {
    remove_wal_sidecars(to);

    if to.exists() {
        match fs::remove_file(to) {
            Ok(()) => {}
            Err(remove_err) => {
                // Destination still locked or protected — try overwrite copy instead of rename.
                match fs::copy(from, to) {
                    Ok(_) => {
                        let _ = fs::remove_file(from);
                        remove_wal_sidecars(to);
                        return Ok(());
                    }
                    Err(copy_err) => {
                        let _ = fs::remove_file(from);
                        return Err(format!(
                            "Database file is locked (Access denied). Close other Spectrum Pro windows and try again. (remove: {}; overwrite: {})",
                            remove_err, copy_err
                        ));
                    }
                }
            }
        }
    }

    match fs::rename(from, to) {
        Ok(()) => {
            remove_wal_sidecars(to);
            Ok(())
        }
        Err(rename_err) => match fs::copy(from, to) {
            Ok(_) => {
                let _ = fs::remove_file(from);
                remove_wal_sidecars(to);
                Ok(())
            }
            Err(copy_err) => {
                let _ = fs::remove_file(from);
                Err(format!(
                    "Rename into place failed: {} (overwrite also failed: {})",
                    rename_err, copy_err
                ))
            }
        },
    }
}

fn write_sidecar(db_path: &Path, sidecar_json: &str) -> Result<PathBuf, String> {
    let side = sidecar_path_for(db_path);
    let mut f = fs::File::create(&side).map_err(|e| format!("Cannot write sidecar: {}", e))?;
    f.write_all(sidecar_json.as_bytes())
        .map_err(|e| format!("Cannot write sidecar data: {}", e))?;
    Ok(side)
}

fn sidecar_path_for(db_path: &Path) -> PathBuf {
    let stem = db_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("spectrum_pro");
    if let Some(parent) = db_path.parent() {
        parent.join(format!("{}.sidecar.json", stem))
    } else {
        PathBuf::from(format!("{}.sidecar.json", stem))
    }
}

fn enforce_retention(folder: &Path) -> Result<(), String> {
    let entries = match fs::read_dir(folder) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    let mut files: Vec<(SystemTime, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !(name.starts_with("spectrum_pro_") && name.ends_with(".db")) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        files.push((modified, path));
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    if files.len() <= MAX_BACKUPS {
        return Ok(());
    }
    for (_t, path) in files.into_iter().skip(MAX_BACKUPS) {
        let side = sidecar_path_for(&path);
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&side);
    }
    Ok(())
}

fn stamp_now() -> String {
    // Local-ish ISO without colons for Windows paths
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Prefer chrono-free readable stamp from JS when possible; fallback UTC epoch.
    // JS passes preferred stamp; this is only a fallback.
    format!("epoch_{}", secs)
}

#[tauri::command]
fn list_backup_drives() -> Vec<DriveInfo> {
    list_writable_drive_roots()
}

#[tauri::command]
fn run_full_backup(
    app: AppHandle,
    stamp: String,
    sidecar_json: String,
) -> Result<FullBackupResult, String> {
    let db_path = resolve_db_path(&app)?;
    if !db_path.is_file() {
        return Err(format!(
            "Live database not found at {:?}. Open the app once so the database is created.",
            db_path
        ));
    }
    verify_sqlite_backup(&db_path)
        .map_err(|e| format!("Live database failed verification before backup: {}", e))?;

    let stamp = if stamp.trim().is_empty() {
        stamp_now()
    } else {
        stamp.trim().to_string()
    };
    let file_name = format!("spectrum_pro_auto_{}.db", stamp);

    let primary_dir = resolve_primary_backup_dir(&app)?;
    let primary_path = primary_dir.join(&file_name);
    copy_file_atomic(&db_path, &primary_path)?;
    let sidecar_path = write_sidecar(&primary_path, &sidecar_json).ok();
    enforce_retention(&primary_dir)?;
    verify_sqlite_backup(&primary_path)
        .map_err(|e| format!("Primary backup verification failed — backup aborted: {}", e))?;

    let mut drives_out = Vec::new();
    let mut failures = Vec::new();

    for drive in list_writable_drive_roots() {
        if !drive.writable {
            failures.push(format!("{} (not writable)", drive.letter));
            drives_out.push(DriveBackupResult {
                letter: drive.letter.clone(),
                path: String::new(),
                ok: false,
                error: Some("Drive is not writable".into()),
            });
            continue;
        }
        let dest_dir = Path::new(&drive.root).join(BACKUP_DIR_NAME);
        let dest = dest_dir.join(&file_name);
        match copy_file_atomic(&primary_path, &dest)
            .and_then(|_| {
                if let Some(ref side) = sidecar_path {
                    let dest_side = sidecar_path_for(&dest);
                    copy_file_atomic(side, &dest_side)?;
                }
                enforce_retention(&dest_dir)?;
                verify_sqlite_backup(&dest)?;
                Ok(())
            }) {
            Ok(()) => {
                drives_out.push(DriveBackupResult {
                    letter: drive.letter.clone(),
                    path: dest.to_string_lossy().to_string(),
                    ok: true,
                    error: None,
                });
            }
            Err(e) => {
                failures.push(format!("{}: {}", drive.letter, e));
                drives_out.push(DriveBackupResult {
                    letter: drive.letter.clone(),
                    path: dest.to_string_lossy().to_string(),
                    ok: false,
                    error: Some(e),
                });
            }
        }
    }

    let ok = true; // primary succeeded
    let message = if failures.is_empty() {
        format!(
            "Backup completed. Saved to app folder and {} drive(s).",
            drives_out.iter().filter(|d| d.ok).count()
        )
    } else {
        format!(
            "Primary backup OK, but {} drive mirror(s) failed: {}",
            failures.len(),
            failures.join("; ")
        )
    };

    Ok(FullBackupResult {
        ok,
        primary_path: primary_path.to_string_lossy().to_string(),
        sidecar_path: sidecar_path.map(|p| p.to_string_lossy().to_string()),
        stamp,
        drives: drives_out,
        failures,
        message,
    })
}

fn collect_backups_in_dir(dir: &Path, source: &str, out: &mut Vec<BackupListItem>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let lower = name.to_lowercase();
        if !(lower.starts_with("spectrum_pro_") && lower.ends_with(".db")) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(BackupListItem {
            path: path.to_string_lossy().to_string(),
            name,
            size: meta.len(),
            modified_ms,
            source: source.to_string(),
        });
    }
}

#[tauri::command]
fn list_backups(app: AppHandle, include_drives: bool) -> Result<Vec<BackupListItem>, String> {
    let mut items = Vec::new();
    if let Ok(primary) = resolve_primary_backup_dir(&app) {
        collect_backups_in_dir(&primary, "AppConfig", &mut items);
    }
    if include_drives {
        for drive in list_writable_drive_roots() {
            if !drive.writable {
                continue;
            }
            let dir = Path::new(&drive.root).join(BACKUP_DIR_NAME);
            collect_backups_in_dir(&dir, &drive.letter, &mut items);
        }
    }
    items.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    // Dedupe by filename keeping newest path
    let mut seen = std::collections::HashSet::new();
    items.retain(|i| seen.insert(i.name.clone()));
    Ok(items)
}

fn remove_wal_sidecars(db_path: &Path) {
    let wal = PathBuf::from(format!("{}-wal", db_path.to_string_lossy()));
    let shm = PathBuf::from(format!("{}-shm", db_path.to_string_lossy()));
    let _ = fs::remove_file(wal);
    let _ = fs::remove_file(shm);
}

#[tauri::command]
fn restore_from_backup(app: AppHandle, backup_path: String) -> Result<RestoreResult, String> {
    let src = PathBuf::from(backup_path.trim());
    if !src.is_file() {
        return Err("Selected backup file was not found.".into());
    }

    // Verify BEFORE touching the live DB — any failure leaves data unchanged.
    verify_sqlite_backup(&src).map_err(|e| {
        format!(
            "Restore failed — no data was changed. Verification error: {}",
            e
        )
    })?;

    let live = resolve_db_path(&app)?;
    if let Some(parent) = live.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot prepare DB folder: {}", e))?;
    }

    // Drop WAL/SHM so Windows will allow replacing the main DB file.
    remove_wal_sidecars(&live);

    let pre_restore = live.with_extension("db.pre_restore");
    if live.is_file() {
        copy_file_atomic(&live, &pre_restore).map_err(|e| {
            format!(
                "Restore failed — no data was changed. Could not snapshot current DB: {}",
                e
            )
        })?;
    }

    // Retry replace a few times — antivirus / delayed handle release on Windows.
    let mut last_err = String::new();
    let mut replaced = false;
    for attempt in 0..5 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(200 * attempt as u64));
            remove_wal_sidecars(&live);
        }
        match copy_file_atomic(&src, &live) {
            Ok(()) => {
                replaced = true;
                break;
            }
            Err(e) => last_err = e,
        }
    }
    if !replaced {
        if pre_restore.is_file() {
            let _ = copy_file_atomic(&pre_restore, &live);
            remove_wal_sidecars(&live);
        }
        return Err(format!(
            "Restore failed — no data was changed. Could not replace database: {}",
            last_err
        ));
    }

    remove_wal_sidecars(&live);
    if let Err(e) = verify_sqlite_backup(&live) {
        if pre_restore.is_file() {
            let _ = copy_file_atomic(&pre_restore, &live);
            remove_wal_sidecars(&live);
        }
        return Err(format!(
            "Restore failed — no data was changed. Post-restore verification failed: {}",
            e
        ));
    }

    let mut sidecar_restored = false;
    let src_side = sidecar_path_for(&src);
    if src_side.is_file() {
        let dest_side = live
            .parent()
            .map(|p| p.join("spectrum_pro.sidecar.json"))
            .unwrap_or_else(|| PathBuf::from("spectrum_pro.sidecar.json"));
        if copy_file_atomic(&src_side, &dest_side).is_ok() {
            sidecar_restored = true;
        }
    }

    Ok(RestoreResult {
        ok: true,
        message: "Restore completed successfully. All verified data was applied.".into(),
        restored_path: Some(live.to_string_lossy().to_string()),
        sidecar_restored,
    })
}

#[tauri::command]
fn read_restore_sidecar(app: AppHandle) -> Result<Option<String>, String> {
    let live = resolve_db_path(&app)?;
    let side = live
        .parent()
        .map(|p| p.join("spectrum_pro.sidecar.json"))
        .unwrap_or_else(|| PathBuf::from("spectrum_pro.sidecar.json"));
    if !side.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(&side).map_err(|e| format!("Cannot read sidecar: {}", e))?;
    Ok(Some(text))
}

/// Native OS file dialog — pick a `.db` backup from any folder on the PC.
#[tauri::command]
fn pick_backup_file() -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Select Spectrum Pro backup (.db)")
        .add_filter("SQLite backup", &["db"])
        .add_filter("All files", &["*"])
        .pick_file();

    match picked {
        None => Ok(None),
        Some(path) => {
            if !path.is_file() {
                return Err("Selected path is not a file.".into());
            }
            // Verify immediately so the UI only keeps accurate restore candidates.
            verify_sqlite_backup(&path).map_err(|e| {
                format!(
                    "That file cannot be restored (verification failed): {}",
                    e
                )
            })?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
    }
}

/// Re-check a path the user typed or selected — returns ok + size for UI.
#[tauri::command]
fn validate_backup_file(backup_path: String) -> Result<BackupListItem, String> {
    let path = PathBuf::from(backup_path.trim());
    if !path.is_file() {
        return Err("File not found. Choose a valid .db backup path.".into());
    }
    verify_sqlite_backup(&path)?;
    let meta = fs::metadata(&path).map_err(|e| format!("Cannot read file: {}", e))?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("backup.db")
        .to_string();
    Ok(BackupListItem {
        path: path.to_string_lossy().to_string(),
        name,
        size: meta.len(),
        modified_ms,
        source: "Browse".into(),
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SqlStep {
    sql: String,
    args: Option<Vec<serde_json::Value>>,
}

/// Run multiple SQL statements in one rusqlite transaction (atomic on desktop).
#[tauri::command]
fn run_sqlite_transaction(app: AppHandle, steps: Vec<SqlStep>) -> Result<(), String> {
    let path = resolve_db_path(&app)?;
    let mut conn = rusqlite::Connection::open(&path)
        .map_err(|e| format!("Cannot open database for transaction: {}", e))?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| format!("Cannot begin transaction: {}", e))?;

    for step in steps {
        let args = step.args.unwrap_or_default();
        let values: Vec<rusqlite::types::Value> = args
            .iter()
            .map(|v| match v {
                serde_json::Value::Null => rusqlite::types::Value::Null,
                serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        rusqlite::types::Value::Integer(i)
                    } else if let Some(f) = n.as_f64() {
                        rusqlite::types::Value::Real(f)
                    } else {
                        rusqlite::types::Value::Text(n.to_string())
                    }
                }
                serde_json::Value::String(s) => rusqlite::types::Value::Text(s.clone()),
                other => rusqlite::types::Value::Text(other.to_string()),
            })
            .collect();
        tx.execute(&step.sql, rusqlite::params_from_iter(values.iter()))
            .map_err(|e| format!("SQL step failed: {} — {}", e, step.sql))?;
    }

    tx.commit()
        .map_err(|e| format!("Cannot commit transaction: {}", e))?;
    Ok(())
}

/// WebView2 must not store its user-data folder next to the .exe — that fails when the
/// app is installed on a non-writable drive (e.g. E:\) and the window opens blank.
#[cfg(windows)]
fn pin_webview2_user_data_folder() {
    let local = match std::env::var_os("LOCALAPPDATA") {
        Some(v) => PathBuf::from(v),
        None => return,
    };
    let udf = local
        .join("com.spectrumpro.management.system")
        .join("EBWebView");
    if fs::create_dir_all(&udf).is_ok() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &udf);
    }
}

/// Windows 10+ is 10.0. Runtime 109 is only safe on Windows 7/8.
#[cfg(windows)]
fn windows_major_version() -> u32 {
    #[repr(C)]
    struct OsVersionInfoW {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        csd: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
    }
    unsafe {
        let mut info: OsVersionInfoW = std::mem::zeroed();
        info.size = std::mem::size_of::<OsVersionInfoW>() as u32;
        if RtlGetVersion(&mut info) == 0 {
            info.major
        } else {
            10
        }
    }
}

#[cfg(windows)]
fn show_windows_message(text: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            typ: u32,
        ) -> i32;
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let body = wide(text);
    let caption = wide("Spectrum Pro");
    unsafe {
        MessageBoxW(std::ptr::null_mut(), body.as_ptr(), caption.as_ptr(), 0x00000010);
    }
}

/// Prefer a folder that actually contains msedgewebview2.exe (flat install path, or the
/// older double-nested NSIS layout). Must run before the WebView window is created.
/// Only used on Windows 7/8. On Windows 10/11, runtime 109 launches Edge as a separate
/// browser and leaves this app with no window.
#[cfg(windows)]
fn resolve_webview2_browser_folder(app: &AppHandle) {
    const RUNTIME_DIR: &str = "Microsoft.WebView2.FixedVersionRuntime.109.0.1518.78.x86";

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(configured) = std::env::var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER") {
        candidates.push(PathBuf::from(configured));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let flat = resource_dir.join(RUNTIME_DIR);
        let nested = flat.join(RUNTIME_DIR);
        candidates.push(flat);
        candidates.push(nested);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let flat = exe_dir.join(RUNTIME_DIR);
            let nested = flat.join(RUNTIME_DIR);
            candidates.push(flat);
            candidates.push(nested);
        }
    }

    for dir in candidates {
        if dir.join("msedgewebview2.exe").is_file() {
            std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &dir);
            log::info!("WebView2 browser folder: {}", dir.display());
            return;
        }
    }
}

#[cfg(windows)]
fn configure_webview2_runtime(app: &AppHandle) {
    let major = windows_major_version();
    if major >= 10 {
        std::env::remove_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER");
        log::info!("Windows {major}: using the installed WebView2, not runtime 109");
    } else {
        resolve_webview2_browser_folder(app);
    }
}

pub fn run() {
    #[cfg(windows)]
    pin_webview2_user_data_folder();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            #[cfg(windows)]
            configure_webview2_runtime(app.handle());

            // Window create is deferred (tauri.conf create:false) so WebView2 env
            // vars above are applied before the first WebView is constructed.
            if let Some(cfg) = app.config().app.windows.first() {
                match tauri::WebviewWindowBuilder::from_config(app.handle(), cfg)?
                    .visible(true)
                    .focused(true)
                    .center()
                    .build()
                {
                    Ok(window) => {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    Err(err) => {
                        #[cfg(windows)]
                        show_windows_message(
                            "Spectrum Pro could not open its window.\n\n\
                             On Windows 10 or 11, install the 64-bit setup \
                             (SpectrumPro_1.0.0_x64-setup.exe). The 32-bit setup is for Windows 7.\n\n\
                             The 32-bit app on newer Windows starts in the background and opens \
                             Microsoft Edge instead of the Spectrum Pro window.",
                        );
                        return Err(Box::new(err));
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            send_backup_email,
            list_backup_drives,
            run_full_backup,
            list_backups,
            restore_from_backup,
            read_restore_sidecar,
            pick_backup_file,
            validate_backup_file,
            run_sqlite_transaction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
