import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  PiggyBank,
  Plus,
  X,
  Trash2,
  Edit2,
  RefreshCw,
  Calendar,
  Banknote,
} from "lucide-react";
import { db } from "../db";
import { Transaction } from "../types";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { useFeedback } from "../contexts/FeedbackContext";
import { LandscapeModal } from "../components/ui/LandscapeModal";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useOpenNewFromQuery } from "../hooks/useOpenNewFromQuery";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { useScreenActive } from "../contexts/ScreenActiveContext";
import { TX_LIST_COLUMNS } from "../utils/txListColumns";
import { notifyLedgerChanged, useLazyScreenDataSync } from "../utils/dataSync";

export default function Capital({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const screenActive = useScreenActive();
    const { showSuccess, showError } = useFeedback();
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [sourceName, setSourceName] = useState("");
    const [capitalKind, setCapitalKind] = useState<"OWNER" | "EXTERNAL">("OWNER");
    const [amount, setAmount] = useState<number>(0);
    const [dateStr, setDateStr] = useState(
    () => new Date().toISOString().split("T")[0]
    );
    const [notes, setNotes] = useState("");
    const [listVersion, setListVersion] = useState(0);
    const [amountTotal, setAmountTotal] = useState(0);
    const refresh = useCallback(() => setListVersion((v) => v + 1), []);
    useLazyScreenDataSync(refresh);
    useEffect(() => {
    const state = location.state as { editId?: number; deleteId?: number } | null;
    if (!state?.editId && !state?.deleteId) return;
    navigate(location.pathname, { replace: true, state: null });
    (async () => {
    if (state.editId) {
    const t = await db.transactionLogs.get(state.editId);
    if (t && t.type === "CAPITAL_INJECTION" && !t.isDeleted) {
    setEditingId(t.id!);
    setSourceName(t.customerName || "");
    setCapitalKind(t.capitalKind === "EXTERNAL" ? "EXTERNAL" : "OWNER");
    setAmount(Number(t.paidAmount) || 0);
    setDateStr(new Date(t.date).toISOString().split("T")[0]);
    setNotes(t.notes || "");
    setShowModal(true);
    } else {
    showError("Not found", "Capital entry was not found.");
    }
    }
    if (state.deleteId) {
    setDeleteId(state.deleteId);
    setShowDeleteConfirm(true);
    }
    })();
    }, [location.state]);
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
  } = useDbPagination<Transaction>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [
        { col: "type", val: "CAPITAL_INJECTION" },
        { col: "isDeleted", val: 0 },
      ];
      const term = searchQuery.trim();
      const orWhere: DbWhere = term
        ? [
            { col: "customerName", op: "LIKE", val: `%${term}%` },
            { col: "notes", op: "LIKE", val: `%${term}%` },
          ]
        : [];
      const [rows, count] = await Promise.all([
        db.transactionLogs.query({
          where,
          orWhere,
          orderBy: "date",
          orderDir: "DESC",
          limit: size,
          offset,
          columns: [...TX_LIST_COLUMNS],
        }),
        db.transactionLogs.countWhere(where, orWhere),
      ]);
      return { rows: rows as Transaction[], total: count };
    },
    [searchQuery, listVersion],
    undefined,
    `capital:${searchQuery}:${listVersion}`
  );

  useEffect(() => {
    if (!screenActive) return;
    let cancelled = false;
    (async () => {
      const where: DbWhere = [
        { col: "type", val: "CAPITAL_INJECTION" },
        { col: "isDeleted", val: 0 },
      ];
      const term = searchQuery.trim();
      const orWhere: DbWhere = term
        ? [
            { col: "customerName", op: "LIKE", val: `%${term}%` },
            { col: "notes", op: "LIKE", val: `%${term}%` },
          ]
        : [];
      const amountRows = await db.transactionLogs.query({
        where,
        orWhere,
        columns: ["paidAmount"],
      });
      if (cancelled) return;
      setAmountTotal(
        (amountRows as { paidAmount?: number }[]).reduce(
          (s, t) => s + (Number(t.paidAmount) || 0),
          0
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [screenActive, searchQuery, listVersion]);

  const openAdd = () => {
    setEditingId(null);
    setSourceName("");
    setCapitalKind("OWNER");
    setAmount(0);
    setDateStr(new Date().toISOString().split("T")[0]);
    setNotes("");
    setShowModal(true);
  };

  useOpenNewFromQuery(openAdd);

  const openEdit = (t: Transaction) => {
    if (!t.id) return;
    setEditingId(t.id);
    setSourceName(t.customerName || "");
    setCapitalKind(t.capitalKind === "EXTERNAL" ? "EXTERNAL" : "OWNER");
    setAmount(Number(t.paidAmount) || 0);
    setDateStr(new Date(t.date).toISOString().split("T")[0]);
    setNotes(t.notes || "");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showError("Invalid amount", "Enter a valid amount.");
      return;
    }
    if (!sourceName.trim()) {
      showError("Source required", "Enter a source (e.g. personal savings, investor).");
      return;
    }

    const payload: Omit<Transaction, "id"> = {
      date: new Date(dateStr),
      type: "CAPITAL_INJECTION",
      totalAmount: amt,
      paidAmount: amt,
      discount: 0,
      items: [],
      customerName: sourceName.trim(),
      capitalKind,
      notes: notes.trim() || `Capital injection — ${sourceName.trim()}`,
      isDeleted: false,
    };

    try {
      if (editingId) {
        await db.transactionLogs.update(editingId, payload);
      } else {
        await db.transactionLogs.add(payload as Transaction);
      }
      setShowModal(false);
      refresh();
      showSuccess(
        editingId ? "Updated" : "Recorded",
        editingId ? "Entry updated." : "Capital recorded in the registry."
      );
      notifyLedgerChanged();
    } catch (err: any) {
      console.error(err);
      showError("Could not save", err?.message || "Could not save.");
    }
  };

  const confirmDelete = (id: number) => {
    setDeleteId(id);
    setShowDeleteConfirm(true);
  };

  const doDelete = async () => {
    if (deleteId == null) return;
    try {
      await db.transactionLogs.delete(deleteId);
      setShowDeleteConfirm(false);
      setDeleteId(null);
      refresh();
      notifyLedgerChanged();
    } catch (err: any) {
      showError("Could not remove", err?.message || "Could not remove entry.");
    }
  };

  return (
    <div className="space-y-3 pb-6 w-full h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-end gap-3 px-1 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
            AFN {amountTotal.toLocaleString()}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              refresh();
            }}
            className={`p-2 rounded-lg transition-all ${
              darkMode
                ? "bg-gray-800 text-gray-500 hover:text-white"
                : "bg-gray-100 text-gray-400 hover:text-emerald-600"
            }`}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-500 transition-all"
          >
            <Plus size={14} /> Record injection
          </button>
        </div>
      </div>

      <div
        className={`rounded-2xl border overflow-hidden flex-1 min-h-0 flex flex-col ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800"
            : "bg-white shadow-sm border-gray-100"
        }`}
      >
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10">
                <tr
                  className={`text-[10px] font-black uppercase tracking-widest border-b border-gray-800/10 ${
                    darkMode ? "bg-[#1a1d23] text-gray-500" : "bg-white text-gray-400"
                  }`}
                >
                  <th className="py-2 px-3">Source</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Notes</th>
                  <th className="py-2 px-3 text-right">Amount (AFN)</th>
                  <th className="py-2 px-3 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  darkMode ? "divide-gray-800/30" : "divide-gray-50"
                }`}
              >
                {pageItems.map((t) => (
                  <tr
                    key={t.id}
                    className={`group ${
                      darkMode ? "hover:bg-gray-800/20" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="py-5 px-8">
                      <p
                        className={`text-sm font-black uppercase ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {t.customerName || "—"}
                      </p>
                      <p className="text-[10px] font-bold text-gray-500">
                        Ref #{t.id}
                        {" · "}
                        {t.capitalKind === "EXTERNAL" ? "Someone else" : "My capital"}
                      </p>
                    </td>
                    <td className="py-5 px-4">
                      <span
                        className={`text-xs font-bold ${
                          darkMode ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {new Date(t.date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-5 px-4 max-w-xs">
                      <p
                        className={`text-xs font-medium truncate ${
                          darkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                        title={t.notes}
                      >
                        {t.notes || "—"}
                      </p>
                    </td>
                    <td className="py-5 px-8 text-right">
                      <span className="text-sm font-black text-emerald-500">
                        +{Number(t.paidAmount).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-5 px-6 text-center">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="p-2 text-gray-400 hover:text-blue-500 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => t.id && confirmDelete(t.id)}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))},
                {total === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-32 text-center text-gray-500 font-black uppercase text-xs tracking-widest"
                    >
                      <Banknote className="mx-auto mb-4 opacity-20" size={48} />
                      No capital injections yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
        <PaginationBar
          darkMode={darkMode}
          total={total}
          shown={shown}
          hasMore={hasMore}
          onLoadMore={loadMore}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      </div>

      <AnimatePresence>
        {showModal && (
          <LandscapeModal
            darkMode={darkMode}
            open={showModal}
            onClose={() => setShowModal(false)}
            title={editingId ? "Edit injection" : "New injection"}
            icon={<PiggyBank size={16} />}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase ${
                    darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="capital-form"
                  className="flex-[2] py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"
                >
                  {editingId ? "Save changes" : "Record in registry"}
                </button>
              </>
            }
          >
            <form id="capital-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
                  Source / investor
                </label>
                <input
                  required
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g. Personal savings, Bank loan, Partner"
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 ${
                    darkMode
                      ? "bg-gray-900 text-white ring-gray-800"
                      : "bg-gray-50 ring-gray-200"
                  }`}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
                  Whose money is this?
                </label>
                <select
                  value={capitalKind}
                  onChange={(e) =>
                    setCapitalKind(e.target.value === "EXTERNAL" ? "EXTERNAL" : "OWNER")
                  }
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${
                    darkMode
                      ? "bg-gray-900 text-white ring-gray-800"
                      : "bg-gray-50 ring-gray-200"
                  }`}
                >
                  <option value="OWNER">My capital (owner)</option>
                  <option value="EXTERNAL">Someone else's (partner / investor / lender)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
                  Amount (AFN)
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  step="any"
                  value={amount ?? ""}
                  onChange={(e) =>
                    setAmount(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className={`w-full px-3 py-2 rounded-lg text-xs font-black border-none ring-1 ${
                    darkMode
                      ? "bg-gray-900 text-white ring-gray-800"
                      : "bg-gray-50 ring-gray-200"
                  }`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
                  Date
                </label>
                <input
                  required
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 ${
                    darkMode
                      ? "bg-gray-900 text-white ring-gray-800"
                      : "bg-gray-50 ring-gray-200"
                  }`}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 resize-none ${
                    darkMode
                      ? "bg-gray-900 text-white ring-gray-800"
                      : "bg-gray-50 ring-gray-200"
                  }`}
                  placeholder="Purpose, reference, repayment terms…"
                />
              </div>
            </form>
          </LandscapeModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`relative w-full max-w-sm p-6 rounded-2xl text-center ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white shadow-2xl"
              }`}
            >
              <h3
                className={`text-base font-black mb-3 uppercase ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Remove this entry?
              </h3>
              <p className="text-[9px] text-gray-500 mb-5">
                It will be permanently removed from history and cash summaries (hard delete).
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase bg-gray-100 text-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={doDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
