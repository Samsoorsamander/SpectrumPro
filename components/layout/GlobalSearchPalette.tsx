import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Users,
  Package,
  Building2,
  FileText,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { db } from "../../db";
import { useGlobalSearch } from "../../contexts/GlobalSearchContext";

type Hit = {
  id: string;
  label: string;
  sub?: string;
  path: string;
  icon: React.ReactNode;
  group: string;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable='true']"));
}

interface GlobalSearchPaletteProps {
  darkMode: boolean;
}

export const GlobalSearchPalette: React.FC<GlobalSearchPaletteProps> = ({
  darkMode,
}) => {
  const navigate = useNavigate();
  const { setQuery } = useGlobalSearch();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = () => {
    setOpen(true);
    setTerm("");
    setHits([]);
    setActive(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "f" && e.key !== "F") return;

      // Ctrl+F / Cmd+F — always open app search (block browser Find)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        openPalette();
        return;
      }

      // Plain F — same as tab-bar search, ignore while typing
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      openPalette();
    };
    const onOpen = () => openPalette();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("spectrum:open-global-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("spectrum:open-global-search", onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = term.trim().toLowerCase();
    if (q.length < 1) {
      setHits([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const run = async () => {
      try {
        const [products, customers, companies, txs, expenses] = await Promise.all([
          db.products.query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            limit: 400,
          }),
          db.customers.query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            limit: 400,
          }),
          db.companies.query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            limit: 400,
          }),
          db.transactionLogs.query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            orderBy: "date",
            orderDir: "DESC",
            limit: 300,
          }),
          db.expenses.query({ orderBy: "date", orderDir: "DESC", limit: 200 }),
        ]);
        if (cancelled) return;

        const next: Hit[] = [];

        for (const p of products) {
          const hay = `${p.name} ${p.skuCode || ""} ${p.company || ""} ${p.category || ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
          next.push({
            id: `p-${p.id}`,
            label: p.name,
            sub: `${p.company || "—"} · SKU ${p.skuCode || p.id}`,
            path: "/inventory",
            icon: <Package size={14} />,
            group: "Products",
          });
          if (next.filter((h) => h.group === "Products").length >= 8) break;
        }

        for (const c of customers) {
          const hay = `${c.name} ${c.phone || ""} ${c.address || ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
          next.push({
            id: `c-${c.id}`,
            label: c.name,
            sub: c.phone || "Customer",
            path: c.id ? `/ledger/customer/${c.id}` : "/customers",
            icon: <Users size={14} />,
            group: "Customers",
          });
          if (next.filter((h) => h.group === "Customers").length >= 8) break;
        }

        for (const c of companies) {
          const hay = `${c.name} ${c.contactPerson || ""} ${c.phone || ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
          next.push({
            id: `co-${c.id}`,
            label: c.name,
            sub: c.category || "Supplier",
            path: c.id ? `/ledger/company/${c.id}` : "/companies",
            icon: <Building2 size={14} />,
            group: "Companies",
          });
          if (next.filter((h) => h.group === "Companies").length >= 8) break;
        }

        for (const t of txs) {
          const hay = `${t.type} ${t.customerName || ""} ${t.companyName || ""} ${t.notes || ""} ${t.id}`.toLowerCase();
          if (!hay.includes(q)) continue;
          const path =
            t.type === "SALE" || t.type === "RETURN"
              ? "/invoices"
              : t.type === "PURCHASE" || t.type === "PURCHASE_RETURN"
                ? "/purchases"
                : t.type === "PAYMENT" || t.type === "SALARY"
                  ? "/payments"
                  : "/daybook";
          next.push({
            id: `tx-${t.id}`,
            label: `${t.type} #${t.id}`,
            sub: t.customerName || t.companyName || t.employeeName || "Transaction",
            path,
            icon: t.type === "SALE" ? <ShoppingCart size={14} /> : <FileText size={14} />,
            group: "Documents",
          });
          if (next.filter((h) => h.group === "Documents").length >= 8) break;
        }

        for (const e of expenses) {
          const hay = `${e.description} ${e.paidTo || ""} ${e.category || ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
          next.push({
            id: `ex-${e.id}`,
            label: e.description,
            sub: `${e.category || "Expense"} · AFN ${(Number(e.amount) || 0).toLocaleString()}`,
            path: "/expenses",
            icon: <Wallet size={14} />,
            group: "Expenses",
          });
          if (next.filter((h) => h.group === "Expenses").length >= 6) break;
        }

        setHits(next.slice(0, 40));
        setActive(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const delay = window.setTimeout(run, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(delay);
    };
  }, [term, open]);

  const grouped = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const h of hits) {
      const list = map.get(h.group) || [];
      list.push(h);
      map.set(h.group, list);
    }
    return Array.from(map.entries());
  }, [hits]);

  const go = (hit?: Hit) => {
    const target = hit || hits[active];
    if (!target) {
      if (term.trim()) {
        setQuery(term.trim());
        setOpen(false);
      }
      return;
    }
    setQuery(term.trim());
    navigate(target.path);
    setOpen(false);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-[12vh] px-3">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div
        className={`relative w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl border ${
          darkMode
            ? "bg-[#1a1d23] border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-2.5 border-b ${
            darkMode ? "border-gray-800" : "border-gray-100"
          }`}
        >
          <Search size={16} className="text-red-500 shrink-0" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go();
              }
            }}
            placeholder="Search products, customers, companies, invoices…"
            className={`flex-1 bg-transparent outline-none text-sm font-medium ${
              darkMode
                ? "text-white placeholder:text-gray-500"
                : "text-gray-900 placeholder:text-gray-400"
            }`}
          />
          <kbd
            className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
              darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"
            }`}
          >
            Esc
          </kbd>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 text-gray-500 hover:text-red-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto custom-scrollbar py-1">
          {loading && (
            <p className="px-4 py-6 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">
              Searching…
            </p>
          )}
          {!loading && term.trim() && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-xs font-bold text-gray-500">
              No matches for “{term.trim()}”
            </p>
          )}
          {!loading && !term.trim() && (
            <p className="px-4 py-6 text-center text-xs font-bold text-gray-500">
              Type to search the whole registry · <kbd className="px-1">Ctrl+F</kbd> anytime
            </p>
          )}
          {!loading &&
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1">
                <p
                  className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
                    darkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {group}
                </p>
                {items.map((hit) => {
                  const index = hits.findIndex((h) => h.id === hit.id);
                  const isActive = index === active;
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(hit)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                        isActive
                          ? "bg-red-500/15 text-red-500"
                          : darkMode
                            ? "text-gray-200 hover:bg-gray-800/80"
                            : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          darkMode ? "bg-gray-800" : "bg-gray-100"
                        }`}
                      >
                        {hit.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold truncate">{hit.label}</span>
                        {hit.sub && (
                          <span className="block text-[10px] text-gray-500 truncate">
                            {hit.sub}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
