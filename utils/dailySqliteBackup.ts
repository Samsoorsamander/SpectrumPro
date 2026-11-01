import { invoke } from "@tauri-apps/api/core";
import { appConfigDir } from "@tauri-apps/api/path";
import { db } from "../db";

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const META_KEY = "spectrum_pro_last_sqlite_backup_meta";
const ZAKAT_PRICE_KEY = "spectrumpro_zakat_metal_prices";
const SESSION_KEY = "spectrum_pro_session";

let backupTimer: number | null = null;

type SettingsRow = {
  id?: number;
  dailyBackupEnabled?: boolean;
  lastBackupDate?: string;
  backupEmailEnabled?: boolean;
  backupEmailTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpFrom?: string;
};

export type DriveBackupResult = {
  letter: string;
  path: string;
  ok: boolean;
  error?: string | null;
};

export type FullBackupResult = {
  ok: boolean;
  primaryPath: string;
  sidecarPath?: string | null;
  stamp: string;
  drives: DriveBackupResult[];
  failures: string[];
  message: string;
};

export type BackupListItem = {
  path: string;
  name: string;
  size: number;
  modifiedMs: number;
  source: string;
};

export type RestoreResult = {
  ok: boolean;
  message: string;
  restoredPath?: string | null;
  sidecarRestored: boolean;
};

export type SqliteBackupMeta = {
  at: string;
  primaryPath: string;
  folderHint: string;
  stamp: string;
  driveCount: number;
  failures: string[];
  message: string;
};

export function isTauriApp() {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
}

export function readSqliteBackupMeta(): SqliteBackupMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SqliteBackupMeta;
  } catch {
    return null;
  }
}

function writeMeta(meta: SqliteBackupMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function latestSettingsRow<T extends SettingsRow>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0];
}

function buildSidecarJson(): string {
  const zakat = localStorage.getItem(ZAKAT_PRICE_KEY);
  return JSON.stringify({
    version: 1,
    at: new Date().toISOString(),
    localStorage: {
      [ZAKAT_PRICE_KEY]: zakat,
    },
  });
}

function applySidecarJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as {
      localStorage?: Record<string, string | null>;
    };
    const bag = parsed.localStorage || {};
    // Never touch session — keep user logged in.
    for (const [key, value] of Object.entries(bag)) {
      if (key === SESSION_KEY) continue;
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch {
    /* ignore malformed sidecar */
  }
}

function makeStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Full multi-drive backup. Checkpoint first, then Rust copies + retains 30 per folder.
 */
export async function triggerFullBackup(options?: {
  force?: boolean;
  /** When true, skip the dailyBackupEnabled gate (manual Backup Now). */
  bypassEnabledGate?: boolean;
}): Promise<FullBackupResult> {
  if (!isTauriApp()) {
    throw new Error("Backup requires the desktop app (Tauri).");
  }

  await db.init();
  const rows = (await db.settings.toArray()) as SettingsRow[];
  const s = latestSettingsRow(rows);
  if (!s) throw new Error("No settings record found.");

  if (!options?.bypassEnabledGate && !s.dailyBackupEnabled && !options?.force) {
    throw new Error("Automatic backup is turned off in settings.");
  }

  if (!options?.force && !options?.bypassEnabledGate) {
    const last = readSqliteBackupMeta();
    const lastMetaMs = last?.at ? new Date(last.at).getTime() : 0;
    const lastDbMs = s.lastBackupDate ? new Date(s.lastBackupDate).getTime() : 0;
    const lastMs = Math.max(lastMetaMs || 0, lastDbMs || 0);
    if (lastMs > 0 && Date.now() - lastMs < TWENTY_FOUR_H_MS) {
      throw new Error("Backup already ran within the last 24 hours.");
    }
  }

  await db.checkpointSqliteForFileCopy();

  const result = await invoke<FullBackupResult>("run_full_backup", {
    stamp: makeStamp(),
    sidecarJson: buildSidecarJson(),
  });

  if (!result.ok) {
    throw new Error(result.message || "Backup failed.");
  }

  let folderHint = "";
  try {
    folderHint = await appConfigDir();
  } catch {
    folderHint = "";
  }

  const meta: SqliteBackupMeta = {
    at: new Date().toISOString(),
    primaryPath: result.primaryPath,
    folderHint,
    stamp: result.stamp,
    driveCount: result.drives.filter((d) => d.ok).length,
    failures: result.failures || [],
    message: result.message,
  };
  writeMeta(meta);

  if (s.id != null) {
    await db.settings.update(s.id, { lastBackupDate: meta.at });
  }

  try {
    await sendBackupEmailIfConfigured(s, result.primaryPath);
  } catch (e) {
    console.warn("[Spectrum Pro] Backup email failed:", e);
  }

  return result;
}

async function sendBackupEmailIfConfigured(s: SettingsRow, attachmentPath: string) {
  if (!s.backupEmailEnabled) return;
  const to = (s.backupEmailTo || "").trim();
  const host = (s.smtpHost || "").trim();
  const user = (s.smtpUsername || "").trim();
  const pass = s.smtpPassword || "";
  const from = (s.smtpFrom || "").trim();
  if (!to || !host || !user || !pass || !from) return;
  const port = Number(s.smtpPort) || 587;
  await invoke("send_backup_email", {
    smtpHost: host,
    smtpPort: port,
    smtpUsername: user,
    smtpPassword: pass,
    fromEmail: from,
    toEmail: to,
    subject: `Spectrum Pro Backup ${new Date().toLocaleString()}`,
    body: "Automatic / manual SQLite backup from Spectrum Pro.",
    attachmentPath,
  });
}

export async function listBackupFiles(includeDrives = true): Promise<BackupListItem[]> {
  if (!isTauriApp()) return [];
  return invoke<BackupListItem[]>("list_backups", { includeDrives });
}

export async function listBackupDrives() {
  if (!isTauriApp()) return [];
  return invoke<{ letter: string; root: string; writable: boolean }[]>("list_backup_drives");
}

/** Open native OS file dialog — pick a verified .db from any folder. */
export async function pickBackupFileFromDisk(): Promise<string | null> {
  if (!isTauriApp()) {
    throw new Error("Browse requires the desktop app (Tauri).");
  }
  return invoke<string | null>("pick_backup_file");
}

/** Validate a path (typed or browsed) before restore. */
export async function validateBackupFilePath(backupPath: string): Promise<BackupListItem> {
  if (!isTauriApp()) {
    throw new Error("Validation requires the desktop app (Tauri).");
  }
  return invoke<BackupListItem>("validate_backup_file", {
    backupPath: backupPath.trim(),
  });
}

/**
 * Atomic restore. Clears the local login session so the next sign-in must use
 * credentials from the restored database (backup owner), not the previous PC session.
 * Throws if verification fails — live data is unchanged (file not swapped).
 * Always re-inits / reloads the SQL connection after closeSqliteForRestore.
 */
export async function restoreFromBackupFile(backupPath: string): Promise<RestoreResult> {
  if (!isTauriApp()) {
    throw new Error("Restore requires the desktop app (Tauri).");
  }
  if (!backupPath?.trim()) {
    throw new Error("No backup file selected.");
  }

  let closedForRestore = false;
  try {
    // Unlock the live DB file on Windows before replacing it.
    await db.checkpointSqliteForFileCopy();
    await db.closeSqliteForRestore();
    closedForRestore = true;
    await new Promise((r) => setTimeout(r, 350));

    const result = await invoke<RestoreResult>("restore_from_backup", {
      backupPath: backupPath.trim(),
    });

    if (!result.ok) {
      throw new Error(result.message || "Restore failed — no data was changed.");
    }

    try {
      const sidecar = await invoke<string | null>("read_restore_sidecar");
      if (sidecar) applySidecarJson(sidecar);
    } catch {
      /* sidecar optional */
    }

    // Never keep the pre-restore session — require login against restored users table.
    localStorage.removeItem(SESSION_KEY);

    return result;
  } catch (err) {
    if (closedForRestore) {
      // Connection was closed before swap; reopen so the app is usable again.
      try {
        await db.init();
      } catch {
        /* reload will recover */
      }
    }
    throw err;
  }
}

/** Hard reload after restore so SQL reconnects; session must already be cleared. */
export function reloadAppAfterRestore() {
  localStorage.removeItem(SESSION_KEY);
  window.location.reload();
}

/** @deprecated Use reloadAppAfterRestore — session is intentionally not preserved. */
export function reloadAppKeepingSession() {
  reloadAppAfterRestore();
}

async function runBackupIfDue(force = false): Promise<void> {
  if (!isTauriApp()) return;
  await db.init();
  const rows = (await db.settings.toArray()) as SettingsRow[];
  const s = latestSettingsRow(rows);
  if (!s?.dailyBackupEnabled) return;

  const last = readSqliteBackupMeta();
  const lastMetaMs = last?.at ? new Date(last.at).getTime() : 0;
  const lastDbMs = s.lastBackupDate ? new Date(s.lastBackupDate).getTime() : 0;
  const lastMs = Math.max(lastMetaMs || 0, lastDbMs || 0);
  if (!force && lastMs > 0 && Date.now() - lastMs < TWENTY_FOUR_H_MS) return;

  await triggerFullBackup({ force: true, bypassEnabledGate: true });
}

/**
 * Call once after DB init. Runs a backup when the last run was ≥24h ago (or never),
 * then schedules the next check while the app stays open.
 */
export function startDailySqliteBackupScheduler(): void {
  if (!isTauriApp()) return;
  if (backupTimer != null) return;

  const scheduleNext = async () => {
    try {
      await db.init();
      const rows = (await db.settings.toArray()) as SettingsRow[];
      const s = latestSettingsRow(rows);
      const last = readSqliteBackupMeta();
      const lastMetaMs = last?.at ? new Date(last.at).getTime() : 0;
      const lastDbMs = s?.lastBackupDate ? new Date(s.lastBackupDate).getTime() : 0;
      const lastMs = Math.max(lastMetaMs || 0, lastDbMs || 0);
      const now = Date.now();
      const waitMs =
        lastMs > 0 ? Math.max(30_000, TWENTY_FOUR_H_MS - (now - lastMs)) : 30_000;
      backupTimer = window.setTimeout(tick, waitMs);
    } catch {
      backupTimer = window.setTimeout(tick, 60_000);
    }
  };

  const tick = () => {
    runBackupIfDue()
      .catch((e) => console.error("[Spectrum Pro] Daily SQLite backup failed:", e))
      .finally(() => {
        void scheduleNext();
      });
  };

  // Delay first check so login / first screen paint aren't competing with backup I/O.
  backupTimer = window.setTimeout(tick, 45_000);
}

/** Manual one-click backup (Backup Now). Bypasses 24h gate and enabled toggle. */
export async function triggerSqliteBackupNow(): Promise<SqliteBackupMeta | null> {
  await triggerFullBackup({ force: true, bypassEnabledGate: true });
  return readSqliteBackupMeta();
}
