import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  RefreshCw,
  AlertTriangle,
  Package,
  Clock,
  Users,
  Building2,
  Briefcase,
  Database,
  ChevronRight,
} from "lucide-react";
import {
  AppNotification,
  NotificationSeverity,
  scanNotifications,
} from "../utils/notifications";
import { useLazyScreenDataSync } from "../utils/dataSync";

const severityClass = (s: NotificationSeverity, darkMode: boolean) => {
  if (s === "critical") {
    return darkMode
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : "bg-red-50 text-red-600 border-red-100";
  }
  if (s === "warning") {
    return darkMode
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-amber-50 text-amber-700 border-amber-100";
  }
  return darkMode
    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
    : "bg-blue-50 text-blue-700 border-blue-100";
};

const kindIcon = (kind: AppNotification["kind"]) => {
  switch (kind) {
    case "low_stock":
      return <Package size={16} />;
    case "expiry":
      return <Clock size={16} />;
    case "customer_ar":
      return <Users size={16} />;
    case "supplier_due":
      return <Building2 size={16} />;
    case "salary_due":
      return <Briefcase size={16} />;
    case "backup":
      return <Database size={16} />;
    default:
      return <AlertTriangle size={16} />;
  }
};

export default function Notifications({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const list = await scanNotifications(force);
      setItems(list);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useLazyScreenDataSync(() => {
    void load(false);
  });

  return (
    <div className="space-y-3 pb-6 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-red-500/10 text-red-500 shrink-0">
            <Bell size={20} />
          </div>
          <div className="min-w-0">
            <h1
              className={`text-sm font-black uppercase tracking-widest truncate ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Notifications
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {loading
                ? "Scanning registry…"
                : `${items.length} alert${items.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
            darkMode
              ? "bg-gray-800 text-gray-300 hover:text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:text-red-500 shadow-sm"
          } disabled:opacity-50`}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-bold">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="py-24 flex flex-col items-center gap-3 text-gray-500">
          <RefreshCw size={28} className="animate-spin text-red-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">
            Checking stock, dues & backup…
          </p>
        </div>
      ) : items.length === 0 ? (
        <div
          className={`py-24 rounded-[32px] border text-center ${
            darkMode
              ? "bg-[#1a1d23] border-gray-800"
              : "bg-white border-gray-100 shadow-sm"
          }`}
        >
          <Bell size={40} className="mx-auto mb-4 opacity-20" />
          <p
            className={`text-sm font-black uppercase tracking-widest ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            All clear
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-2">
            No stock, expiry, dues, or backup alerts right now
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => navigate(n.deepLink)}
              className={`w-full text-left p-4 rounded-2xl border flex items-start gap-3 transition-all ${
                darkMode
                  ? "bg-[#1a1d23] border-gray-800 hover:border-red-500/40"
                  : "bg-white border-gray-100 shadow-sm hover:border-red-200"
              }`}
            >
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${severityClass(
                  n.severity,
                  darkMode
                )}`}
              >
                {kindIcon(n.kind)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={`text-sm font-black truncate ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {n.title}
                  </p>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${severityClass(
                      n.severity,
                      darkMode
                    )}`}
                  >
                    {n.severity}
                  </span>
                </div>
                <p className="text-xs font-bold text-gray-500 mt-1">{n.body}</p>
              </div>
              <ChevronRight size={16} className="text-gray-500 shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
