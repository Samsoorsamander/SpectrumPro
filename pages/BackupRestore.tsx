import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HardDrive,
  RefreshCw,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Database,
  ArrowLeft,
  FolderOpen,
} from "lucide-react";
import { db } from "../db";
import { SystemSettings } from "../types";
import { useFeedback } from "../contexts/FeedbackContext";
import {
  isTauriApp,
  listBackupFiles,
  listBackupDrives,
  triggerFullBackup,
  restoreFromBackupFile,
  reloadAppAfterRestore,
  readSqliteBackupMeta,
  pickBackupFileFromDisk,
  validateBackupFilePath,
  type BackupListItem,
  type FullBackupResult,
  type SqliteBackupMeta,
} from "../utils/dailySqliteBackup";

function latestSettings(rows: SystemSettings[]): SystemSettings | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0];
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupRestore({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useFeedback();
  const desktop = isTauriApp();

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [meta, setMeta] = useState<SqliteBackupMeta | null>(null);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [drives, setDrives] = useState<{ letter: string; writable: boolean }[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [busyBackup, setBusyBackup] = useState(false);
  const [busyRestore, setBusyRestore] = useState(false);
  const [lastResult, setLastResult] = useState<FullBackupResult | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [browseInfo, setBrowseInfo] = useState<BackupListItem | null>(null);

  const refresh = useCallback(async () => {
    const rows = (await db.settings.toArray()) as SystemSettings[];
    setSettings(latestSettings(rows));
    setMeta(readSqliteBackupMeta());
    if (!desktop) return;
    try {
      const [files, driveList] = await Promise.all([
        listBackupFiles(true),
        listBackupDrives(),
      ]);
      setBackups(files);
      setDrives(driveList.map((d) => ({ letter: d.letter, writable: d.writable })));
    } catch (e) {
      console.error(e);
    }
  }, [desktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectPath = (path: string, info?: BackupListItem | null) => {
    setSelectedPath(path);
    setBrowseInfo(info ?? null);
  };

  const handleBrowse = async () => {
    if (!desktop) {
      showError("Desktop only", "File browsing requires the Spectrum Pro desktop app.");
      return;
    }
    setBrowsing(true);
    try {
      const path = await pickBackupFileFromDisk();
      if (!path) return;
      const info = await validateBackupFilePath(path);
      selectPath(path, info);
      // Keep browsed file visible at top of list even if not in known folders
      setBackups((prev) => {
        const without = prev.filter((b) => b.path !== info.path);
        return [info, ...without];
      });
      showSuccess("Backup verified", "File passed integrity check and is ready to restore.");
    } catch (e: any) {
      showError("Invalid backup file", e?.message || String(e));
    } finally {
      setBrowsing(false);
    }
  };

  const saveDailyToggle = async (enabled: boolean) => {
    if (!settings?.id) {
      showError("Save failed", "Settings record not found.");
      return;
    }
    setSavingToggle(true);
    try {
      await db.settings.update(settings.id, { dailyBackupEnabled: enabled });
      setSettings({ ...settings, dailyBackupEnabled: enabled });
      showSuccess(
        enabled ? "Auto backup on" : "Auto backup off",
        enabled
          ? "A full backup will run at most once every 24 hours."
          : "Only manual backups will run."
      );
    } catch (e: any) {
      showError("Could not save", e?.message || String(e));
    } finally {
      setSavingToggle(false);
    }
  };

  const handleBackupNow = async () => {
    if (!desktop) {
      showError("Desktop only", "Multi-drive backup requires the Spectrum Pro desktop app.");
      return;
    }
    setBusyBackup(true);
    setLastResult(null);
    try {
      const result = await triggerFullBackup({ force: true, bypassEnabledGate: true });
      setLastResult(result);
      setMeta(readSqliteBackupMeta());
      await refresh();
      if (result.failures?.length) {
        showInfo("Backup saved with warnings", result.message);
      } else {
        showSuccess("Backup complete", result.message);
      }
    } catch (e: any) {
      showError("Backup failed", e?.message || String(e));
    } finally {
      setBusyBackup(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedPath) {
      showError("No file selected", "Browse or choose a backup from the list first.");
      return;
    }
    setConfirmRestore(false);
    setBusyRestore(true);
    try {
      // Re-verify immediately before swap so restore stays accurate.
      await validateBackupFilePath(selectedPath);
      const result = await restoreFromBackupFile(selectedPath);
      showSuccess(
        "Restore complete",
        `${result.message} You have been signed out — log in with the backup owner's credentials.`
      );
      window.setTimeout(() => reloadAppAfterRestore(), 400);
    } catch (e: any) {
      showError("Restore failed — no data was changed", e?.message || String(e));
      setBusyRestore(false);
      // DB connection may have been closed before swap; hard reload recovers SQL plugin.
      window.setTimeout(() => window.location.reload(), 800);
    }
  };

  const panel = darkMode
    ? "bg-[#1a1d23] border-gray-800"
    : "bg-[#e2e5eb] border-gray-300 shadow-sm";
  const muted = darkMode ? "text-gray-400" : "text-gray-500";

  return (
    <div className="space-y-4 pb-8 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className={`p-2 rounded-xl ${darkMode ? "bg-gray-800 text-gray-300" : "bg-white border text-gray-600"}`}
          title="Back to settings"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className={`text-lg font-black uppercase tracking-tight ${darkMode ? "text-white" : "text-gray-900"}`}>
            Backup &amp; Restore
          </h2>
          <p className={`text-[11px] font-medium ${muted}`}>
            Full database backup to every writable drive · keep 30 copies each · restore only if 100% verified
          </p>
        </div>
      </div>

      {!desktop && (
        <div className={`p-4 rounded-2xl border flex gap-3 ${darkMode ? "border-amber-500/30 bg-amber-500/10" : "border-amber-200 bg-amber-50"}`}>
          <AlertTriangle className="text-amber-500 shrink-0" size={20} />
          <p className={`text-xs font-bold ${darkMode ? "text-amber-200" : "text-amber-800"}`}>
            Multi-drive backup and restore require the Spectrum Pro desktop installer. Browser mode cannot copy to PC drives.
          </p>
        </div>
      )}

      <div className={`rounded-2xl border p-4 ${panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl ${darkMode ? "bg-indigo-500/15 text-indigo-400" : "bg-indigo-50 text-indigo-600"}`}>
              <Clock size={18} />
            </div>
            <div>
              <p className={`text-sm font-black uppercase ${darkMode ? "text-white" : "text-gray-900"}`}>
                Automatic backup (every 24 hours)
              </p>
              <p className={`text-[11px] mt-0.5 ${muted}`}>
                Copies the full SQLite database (all products, batches, sales, customers, settings, logos) plus zakat preferences.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!settings?.id || savingToggle}
            onClick={() => saveDailyToggle(!settings?.dailyBackupEnabled)}
            className={`w-14 h-7 rounded-full relative transition-colors shrink-0 ${
              settings?.dailyBackupEnabled ? "bg-indigo-600" : darkMode ? "bg-gray-700" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                settings?.dailyBackupEnabled ? "left-8" : "left-1"
              }`}
            />
          </button>
        </div>
        {meta && (
          <p className={`mt-3 text-[10px] font-bold uppercase tracking-widest ${muted}`}>
            Last backup: {new Date(meta.at).toLocaleString()} · {meta.driveCount} drive(s)
            {meta.failures?.length ? ` · ${meta.failures.length} mirror warning(s)` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`rounded-2xl border p-4 space-y-3 ${panel}`}>
          <div className="flex items-center gap-2">
            <Download size={16} className="text-emerald-500" />
            <h3 className={`text-xs font-black uppercase tracking-widest ${darkMode ? "text-white" : "text-gray-900"}`}>
              Manual backup
            </h3>
          </div>
          <p className={`text-[11px] ${muted}`}>
            Creates a verified copy in the app folder and on every writable drive (including USB), then keeps only the newest 30 files per location.
          </p>
          <button
            type="button"
            disabled={!desktop || busyBackup || busyRestore}
            onClick={handleBackupNow}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busyBackup ? <RefreshCw size={16} className="animate-spin" /> : <HardDrive size={16} />}
            {busyBackup ? "Backing up…" : "Backup now"}
          </button>
          {lastResult && (
            <div className={`text-[10px] font-bold space-y-1 pt-2 border-t ${darkMode ? "border-gray-800" : "border-gray-200"}`}>
              <p className={darkMode ? "text-gray-300" : "text-gray-700"}>{lastResult.message}</p>
              <ul className={`max-h-32 overflow-auto space-y-0.5 ${muted}`}>
                {lastResult.drives.map((d) => (
                  <li key={d.letter}>
                    {d.letter} {d.ok ? "OK" : `FAIL — ${d.error || "error"}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {drives.length > 0 && (
            <p className={`text-[10px] ${muted}`}>
              Detected drives:{" "}
              {drives.map((d) => `${d.letter}${d.writable ? "" : " (ro)"}`).join(", ")}
            </p>
          )}
        </div>

        <div className={`rounded-2xl border p-4 space-y-3 ${panel}`}>
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-red-500" />
            <h3 className={`text-xs font-black uppercase tracking-widest ${darkMode ? "text-white" : "text-gray-900"}`}>
              Restore
            </h3>
          </div>
          <p className={`text-[11px] ${muted}`}>
            Pick a backup from the list below, or browse any folder on your PC. Only files that pass 100% verification can be restored. You will be signed out and must log in with the credentials stored in that backup.
          </p>
          <button
            type="button"
            disabled={!desktop || browsing || busyRestore || busyBackup}
            onClick={() => void handleBrowse()}
            className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 ${
              darkMode
                ? "bg-gray-800 text-gray-100 hover:bg-gray-700"
                : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
            }`}
          >
            {browsing ? <RefreshCw size={16} className="animate-spin" /> : <FolderOpen size={16} />}
            {browsing ? "Opening file picker…" : "Browse any folder…"}
          </button>
          {selectedPath && (
            <div className={`rounded-xl p-3 text-[10px] font-bold break-all ${darkMode ? "bg-black/30 text-gray-300" : "bg-white/80 text-gray-700 border border-gray-200"}`}>
              <p className={`uppercase tracking-widest mb-1 ${muted}`}>Selected file</p>
              <p>{selectedPath}</p>
              {browseInfo && (
                <p className={`mt-1 ${muted}`}>
                  {browseInfo.name} · {formatBytes(browseInfo.size)} · verified
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={!desktop || busyRestore || busyBackup || !selectedPath}
            onClick={() => setConfirmRestore(true)}
            className="w-full py-3 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busyRestore ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {busyRestore ? "Restoring…" : "Restore selected backup"}
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${panel}`}>
        <div className={`px-4 py-3 flex items-center justify-between border-b ${darkMode ? "border-gray-800" : "border-gray-200"}`}>
          <div className="flex items-center gap-2">
            <Database size={16} className={muted} />
            <span className={`text-xs font-black uppercase tracking-widest ${darkMode ? "text-white" : "text-gray-900"}`}>
              Available backups
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className={`p-2 rounded-lg ${darkMode ? "hover:bg-gray-800 text-gray-400" : "hover:bg-white text-gray-500"}`}
            title="Refresh list"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="max-h-[360px] overflow-auto custom-scrollbar">
          {backups.length === 0 ? (
            <p className={`py-12 text-center text-xs font-bold uppercase tracking-widest ${muted}`}>
              No backup files found yet
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`text-[9px] font-black uppercase tracking-widest ${muted}`}>
                  <th className="py-2 px-4">Select</th>
                  <th className="py-2 px-2">File</th>
                  <th className="py-2 px-2">Source</th>
                  <th className="py-2 px-2 text-right">Size</th>
                  <th className="py-2 px-4 text-right">Modified</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? "divide-gray-800/50" : "divide-gray-100"}`}>
                {backups.map((b) => (
                  <tr
                    key={b.path}
                    className={`cursor-pointer ${
                      selectedPath === b.path
                        ? darkMode
                          ? "bg-indigo-500/10"
                          : "bg-indigo-50"
                        : ""
                    }`}
                    onClick={() => selectPath(b.path, b.source === "Browse" ? b : null)}
                  >
                    <td className="py-2.5 px-4">
                      <input
                        type="radio"
                        name="backup"
                        checked={selectedPath === b.path}
                        onChange={() => selectPath(b.path, b.source === "Browse" ? b : null)}
                      />
                    </td>
                    <td className={`py-2.5 px-2 font-bold ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                      {b.name}
                    </td>
                    <td className={`py-2.5 px-2 ${muted}`}>{b.source}</td>
                    <td className={`py-2.5 px-2 text-right tabular-nums ${muted}`}>{formatBytes(b.size)}</td>
                    <td className={`py-2.5 px-4 text-right ${muted}`}>
                      {b.modifiedMs ? new Date(b.modifiedMs).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmRestore(false)} />
          <div className={`relative w-full max-w-md p-6 rounded-2xl border ${panel}`}>
            <h3 className={`text-base font-black uppercase mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}>
              Confirm restore
            </h3>
            <p className={`text-xs mb-4 ${muted}`}>
              This replaces the live database with the selected backup after full verification. You will be signed out and must use the username/password from the backup to sign in again. Current data is snapshotted first; if verification fails, nothing changes.
            </p>
            <p className={`text-[10px] font-mono mb-5 break-all ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
              {selectedPath}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestore(false)}
                className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase text-gray-500 bg-gray-500/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestore}
                className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase bg-red-600 text-white"
              >
                Restore now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
