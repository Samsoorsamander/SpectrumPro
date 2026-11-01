import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../db";
import {
  Transaction,
  TransactionItem,
  SystemSettings,
  Product,
  Company,
} from "../types";
import {
  FileText,
  Filter,
  Trash2,
  Printer,
  X,
  RefreshCw,
  Check,
  Edit2,
  Save,
  Eye,
  Download,
  Building2,
  Calendar,
  Hash,
  AlertTriangle,
  Info,
  ChevronDown,
  Search,
  Package,
  Plus,
  Minus,
  User,
} from "lucide-react";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { useFeedback } from "../contexts/FeedbackContext";
import { SimpleBookReportPage, book } from "../components/SimpleBookReport";
import PrintMountPortal from "../components/PrintMountPortal";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { TX_LIST_COLUMNS } from "../utils/txListColumns";
import { useLocation, useNavigate } from "react-router-dom";
import {
  allocateFifo,
  applyFifoDeductions,
  fifoWeightedAvgCost,
  parseSaleLineQty,
  recomputeProductCostsFromBatches,
  restoreSaleBatchAllocations,
  revertPurchaseQuantityLegacy,
  stockDeltaWhenPosting,
  undoPostedSaleLine,
  normalizeAllocationsToLineQty,
} from "../batchFifo";
import {
  notifyInventoryChanged,
  notifyLedgerChanged,
  useLazyScreenDataSync,
} from "../utils/dataSync";

function toDateInputValue(d: Date | string | undefined): string {
  if (d == null) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Invoices({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showSuccess, showError } = useFeedback();
    const [products, setProducts] = useState<Product[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [listSearch, setListSearch] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [filterCompany, setFilterCompany] = useState("All");
    const [activeTab, setActiveTab] = useState<"ALL" | "SALE" | "RETURN">("ALL");
    const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(
    null,
    );
    const [isExporting, setIsExporting] = useState(false);
    const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<Transaction | null>(null);
    const [productSearch, setProductSearch] = useState("");
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const simplePdfRef = useRef<HTMLDivElement>(null);
    const [invoiceListVersion, setInvoiceListVersion] = useState(0);
    useEffect(() => {
    loadSettings();
    }, []);
    useEffect(() => {
    if (isEditing || showProductDropdown || selectedInvoice) {
    loadProducts();
    loadCompanies();
    }
    }, [isEditing, showProductDropdown, selectedInvoice]);
    const loadSettings = async () => {
    const s = await db.settings.toArray();
    if (s.length > 0) setBizSettings(s[0]);
    };
    const loadProducts = async () => {
    const p = await db.products.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    orderBy: "name",
    orderDir: "ASC",
    limit: 500,
    });
    setProducts(p);
    };
    const loadCompanies = async () => {
    const c = await db.companies.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    orderBy: "name",
    orderDir: "ASC",
    });
    setCompanies(c);
    };
    const DOC_TYPES =
    activeTab === "SALE"
    ? ["SALE"]
    : activeTab === "RETURN"
    ? ["RETURN", "PURCHASE_RETURN"]
    : ["SALE", "RETURN", "PURCHASE", "PURCHASE_RETURN", "PAYMENT"];
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    loading: isLoading,
    hasMore,
    loadMore,
  } = useDbPagination<Transaction>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "type", op: "IN", val: DOC_TYPES }
      ];
      if (filterCompany !== "All") {
        where.push({ col: "companyName", val: filterCompany });
      }
      if (startDate) {
        where.push({ col: "date", op: ">=", val: startDate });
      }
      if (endDate) {
        where.push({ col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` });
      }
      if ((listSearch || searchQuery).trim()) {
        where.push({
          col: "customerName",
          op: "LIKE",
          val: `%${(listSearch || searchQuery).trim()}%`,
        });
      }
      const [rows, count] = await Promise.all([
        db.transactionLogs.query({
          where,
          orderBy: "date",
          orderDir: "DESC",
          limit: size,
          offset,
          columns: [...TX_LIST_COLUMNS],
        }),
        db.transactionLogs.countWhere(where)
      ]);
      return { rows: rows as Transaction[], total: count };
    },
    [
      activeTab,
      filterCompany,
      startDate,
      endDate,
      listSearch,
      searchQuery,
      invoiceListVersion,
    ],
    undefined,
    `invoices:${activeTab}:${filterCompany}:${startDate}:${endDate}:${listSearch}:${searchQuery}:${invoiceListVersion}`
  );

  const loadInvoices = useCallback(() => setInvoiceListVersion((v) => v + 1), []);
  useLazyScreenDataSync(loadInvoices);

  const handlePrintVoucher = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const handleDownloadPDF = async (tx: Transaction) => {
    if (!simplePdfRef.current) return;
    setIsExporting(true);
    try {
      const { exportElementToPdf } = await import("../utils/pdfExport");
      await exportElementToPdf(simplePdfRef.current, `Invoice_${tx.id}`, {
        scale: 1.5,
        backgroundColor: "#ffffff",
      });
    } catch (err) {
      console.error(err);
      showError("PDF failed", "Could not generate the document PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const loadFullTransaction = async (tx: Transaction) => {
    if (tx.id == null) return tx;
    // Always re-read from DB — list rows omit `items` and must never drive stock reverse.
    const full = await db.transactionLogs.get(tx.id);
    if (!full) return tx;
    const row = full as Transaction;
    if (typeof (row as { items?: unknown }).items === "string") {
      try {
        row.items = JSON.parse(
          (row as { items: unknown }).items as string
        ) as TransactionItem[];
      } catch {
        row.items = [];
      }
    }
    return row;
  };

  const hardDeleteInvoice = async (tx: Transaction) => {
    if (
      !window.confirm(
        `CRITICAL SECURITY ACTION: Permanent Deletion of Invoice #DOC-${tx.id}.\n\nThis will hard-delete the document and revert physical stock and balances. Continue?`
      )
    )
      return;
    try {
      const full = await loadFullTransaction(tx);
      if (!full.id) {
        showError("Not found", "Invoice record was not found.");
        return;
      }
      if (
        (full.type === "SALE" ||
          full.type === "PURCHASE" ||
          full.type === "RETURN" ||
          full.type === "PURCHASE_RETURN") &&
        !(full.items?.length)
      ) {
        showError(
          "Incomplete document",
          "Could not load invoice lines to reverse stock. Try again."
        );
        return;
      }

      await db.transaction(
        "rw",
        ["products", "customers", "transactionLogs", "companies", "productBatches"],
        async () => {
          if (full.type === "SALE") {
            for (const raw of full.items ?? []) {
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const item: TransactionItem = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: Number(raw.total) || qIn * up,
              };
              await undoPostedSaleLine(item.productId, item);
            }
          } else if (full.type === "PURCHASE") {
            for (const line of full.items ?? []) {
              const it = line as TransactionItem & { batchId?: number };
              if (it.batchId) {
                await db.productBatches.delete(it.batchId);
              } else {
                await revertPurchaseQuantityLegacy(
                  it.productId,
                  Number(it.quantity) || 0
                );
              }
              await recomputeProductCostsFromBatches(it.productId);
            }
          } else if (full.type === "RETURN") {
            for (const raw of full.items ?? []) {
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const item: TransactionItem = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: Number(raw.total) || qIn * up,
              };
              const allocs = normalizeAllocationsToLineQty(item);
              if (allocs.length > 0) {
                await applyFifoDeductions(
                  allocs.map((a) => ({
                    productId: item.productId,
                    batchId: a.batchId,
                    quantity: a.quantity,
                    unitCost: a.unitCost,
                    batchNumber: a.batchNumber,
                  }))
                );
                await recomputeProductCostsFromBatches(item.productId);
              } else {
                const product = await db.products.get(item.productId);
                if (!product) continue;
                const q = parseSaleLineQty(item);
                await db.products.update(item.productId, {
                  stock: Math.max(0, (Number(product.stock) || 0) - q),
                });
              }
            }
          } else if (full.type === "PURCHASE_RETURN") {
            for (const raw of full.items ?? []) {
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const item: TransactionItem = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: Number(raw.total) || qIn * up,
              };
              const allocs = normalizeAllocationsToLineQty(item);
              if (allocs.length > 0) {
                await restoreSaleBatchAllocations(item.productId, allocs);
              } else {
                const product = await db.products.get(item.productId);
                if (!product) continue;
                const q = parseSaleLineQty(item);
                await db.products.update(item.productId, {
                  stock: (Number(product.stock) || 0) + q,
                });
              }
            }
          }

          if (full.customerId) {
            const customer = await db.customers.get(full.customerId);
            if (customer) {
              const billEffect =
                full.type === "SALE"
                  ? full.totalAmount - full.paidAmount
                  : -full.totalAmount;
              await db.customers.update(full.customerId, {
                balance: (customer.balance || 0) - billEffect,
                totalCredit: Math.max(
                  0,
                  (customer.totalCredit || 0) -
                    (full.type === "SALE" ? full.totalAmount : 0)
                ),
                totalDebit: Math.max(
                  0,
                  (customer.totalDebit || 0) -
                    (full.type === "SALE"
                      ? full.paidAmount
                      : full.type === "RETURN"
                      ? full.totalAmount
                      : 0)
                ),
              });
            }
          }
          // Hard delete — never soft-delete invoices.
          await db.transactionLogs.delete(full.id!);
        }
      );
      showSuccess(
        "Purged",
        "Invoice hard-deleted; stock and ledger synchronized."
      );
      notifyInventoryChanged();
      notifyLedgerChanged();
      loadInvoices();
    } catch (err: any) {
      console.error("Invoice purge error:", err);
      showError("Could not delete invoice", err?.message || String(err));
    }
  };

  const handleSelectInvoice = async (tx: Transaction) => {
    setSelectedInvoice(await loadFullTransaction(tx));
  };

  const handleOpenEdit = async (tx: Transaction) => {
    setSelectedInvoice(null);
    setProductSearch("");
    setShowProductDropdown(false);
    const full = await loadFullTransaction(tx);
    const raw = JSON.parse(JSON.stringify(full)) as Transaction;
    const items = (raw.items ?? []).map((it) => {
      const q = Number(it.quantity) || 0;
      const up = Number(it.unitPrice) || 0;
      return {
        ...it,
        quantity: q,
        unitPrice: up,
        total: Number(it.total) || q * up,
      };
    });
    setEditData({ ...raw, items });
    setIsEditing(true);
  };

  useEffect(() => {
    const state = location.state as { editId?: number; deleteId?: number } | null;
    if (!state?.editId && !state?.deleteId) return;
    navigate(location.pathname, { replace: true, state: null });
    (async () => {
      const id = state.editId ?? state.deleteId;
      if (id == null) return;
      const tx = await db.transactionLogs.get(id);
      if (!tx || tx.isDeleted) {
        showError("Not found", "Invoice record was not found.");
        return;
      }
      if (state.editId) handleOpenEdit(tx);
      if (state.deleteId) await hardDeleteInvoice(tx);
    })();
  }, [location.state]);

  const addItemToEdit = (product: Product) => {
    if (!editData) return;
    const unitPrice =
      editData.type === "PURCHASE" || editData.type === "PURCHASE_RETURN"
        ? Number(product.purchasePrice) || 0
        : Number(product.salePrice) || 0;
    const newItem: TransactionItem = {
      productId: product.id!,
      productName: product.name,
      quantity: 1,
      unitPrice,
      itemDiscount: 0,
      total: unitPrice,
      unit: product.unit,
    };
    const updatedItems = [...(editData.items ?? []), newItem];
    const newTotal = updatedItems.reduce((s, i) => s + i.total, 0);
    setEditData({ ...editData, items: updatedItems, totalAmount: newTotal });
    setProductSearch("");
    setShowProductDropdown(false);
  };

  const removeItemFromEdit = (idx: number) => {
    if (!editData) return;
    const updatedItems = (editData.items ?? []).filter((_, i) => i !== idx);
    const newTotal = updatedItems.reduce((s, i) => s + i.total, 0);
    setEditData({ ...editData, items: updatedItems, totalAmount: newTotal });
  };

  const updateEditItem = (idx: number, updates: Partial<TransactionItem>) => {
    if (!editData) return;
    const newItems = [...(editData.items ?? [])];
    const merged: TransactionItem = { ...newItems[idx], ...updates };
    merged.quantity = Number(merged.quantity) || 0;
    merged.unitPrice = Number(merged.unitPrice) || 0;
    merged.total = merged.quantity * merged.unitPrice;
    newItems[idx] = merged;
    const newSubTotal = newItems.reduce((s, i) => s + i.total, 0);
    setEditData({ ...editData, items: newItems, totalAmount: newSubTotal });
  };

  const saveInvoiceEdits = async () => {
    if (!editData || !editData.id) return;

    const stockTypes: Transaction["type"][] = [
      "SALE",
      "PURCHASE",
      "RETURN",
      "PURCHASE_RETURN",
    ];
    const typeMovesStock = (t: Transaction["type"]) => stockTypes.includes(t);

    if (editData.type === "SALE") {
      if (!(editData.items ?? []).length) {
        showError("No lines", "Add at least one product line.");
        return;
      }
      for (const i of editData.items ?? []) {
        const q = parseSaleLineQty(i);
        if (q <= 0) {
          showError("Invalid quantity", "Each line needs a quantity greater than zero.");
          return;
        }
      }
    }

    try {
      await db.transaction(
        "rw",
        ["products", "customers", "transactionLogs", "productBatches"],
        async () => {
          const oldRow = await db.transactionLogs.get(editData.id!);
          if (!oldRow) {
            throw new Error("Document was not found in the registry.");
          }

          let itemsToSave: TransactionItem[] = editData.items ?? [];
          let totalAmountSaved = Number(editData.totalAmount) || 0;

          if (editData.type === "SALE" && oldRow.type === "SALE") {
            for (const raw of oldRow.items ?? []) {
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const item: TransactionItem = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: qIn * up,
              };
              await undoPostedSaleLine(item.productId, item);
            }

            const built: TransactionItem[] = [];
            for (const raw of editData.items ?? []) {
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const coherent: TransactionItem = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: qIn * up,
              };
              const qty = parseSaleLineQty(coherent);
              const unitPrice = up;
              const allocs = await allocateFifo(coherent.productId, qty);
              await applyFifoDeductions(allocs);
              await recomputeProductCostsFromBatches(coherent.productId);
              const avg = fifoWeightedAvgCost(allocs);
              built.push({
                ...coherent,
                quantity: qty,
                unitPrice,
                total: qty * unitPrice,
                batchAllocations: allocs.map((a) => ({
                  batchId: a.batchId,
                  batchNumber: a.batchNumber,
                  quantity: a.quantity,
                  unitCost: a.unitCost,
                })),
                fifoAvgUnitCost: avg,
              });
            }
            itemsToSave = built;
            const lineGross = built.reduce(
              (s, i) => s + (Number(i.total) || 0),
              0
            );
            const billDisc = Number(editData.discount) || 0;
            totalAmountSaved = Math.max(0, lineGross - billDisc);
          } else if (typeMovesStock(editData.type)) {
            for (const raw of oldRow.items ?? []) {
              if (!typeMovesStock(oldRow.type)) continue;
              const product = await db.products.get(raw.productId);
              if (!product) continue;
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const coherent = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: qIn * up,
              };
              const d = stockDeltaWhenPosting(
                oldRow.type,
                parseSaleLineQty(coherent)
              );
              await db.products.update(raw.productId, {
                stock: Math.max(0, (Number(product.stock) || 0) - d)
              });
            }
            for (const raw of editData.items ?? []) {
              const product = await db.products.get(raw.productId);
              if (!product) continue;
              const up = Number(raw.unitPrice) || 0;
              const qIn = Number(raw.quantity) || 0;
              const coherent = {
                ...raw,
                quantity: qIn,
                unitPrice: up,
                total: qIn * up,
              };
              const d = stockDeltaWhenPosting(
                editData.type,
                parseSaleLineQty(coherent)
              );
              await db.products.update(raw.productId, {
                stock: Math.max(0, (Number(product.stock) || 0) + d)
              });
            }
            const normalized = (editData.items ?? []).map((i) => {
              const qty = Number(i.quantity) || 0;
              const up = Number(i.unitPrice) || 0;
              return { ...i, quantity: qty, unitPrice: up, total: qty * up };
            });
            itemsToSave = normalized;
            totalAmountSaved = normalized.reduce(
              (s, i) => s + (Number(i.total) || 0),
              0
            );
          }

          const oldTotalAmt = Number(oldRow.totalAmount) || 0;
          const paid = Number(editData.paidAmount) || 0;
          const oldPaid = Number(oldRow.paidAmount) || 0;

          const oldNetEffect =
            oldRow.type === "SALE"
              ? oldTotalAmt - oldPaid
              : oldRow.type === "PAYMENT"
              ? -oldPaid
              : -oldTotalAmt;
          const newNetEffect =
            editData.type === "SALE"
              ? totalAmountSaved - paid
              : editData.type === "PAYMENT"
              ? -paid
              : -totalAmountSaved;
          const persistedNewBalance =
            (Number(editData.oldBalance) || 0) + newNetEffect;

          if (editData.customerId) {
            const customer = await db.customers.get(editData.customerId);
            if (customer) {
              const balanceDiff = newNetEffect - oldNetEffect;
              await db.customers.update(editData.customerId, {
                balance: (customer.balance || 0) + balanceDiff,
                totalCredit:
                  (customer.totalCredit || 0) +
                  (totalAmountSaved - oldTotalAmt),
                totalDebit:
                  (customer.totalDebit || 0) + (paid - oldPaid)
              });
            }
          }

          const updatePayload = {
            date: editData.date,
            customerId: editData.customerId ?? null,
            companyId: editData.companyId ?? null,
            employeeId: editData.employeeId ?? null,
            customerName: editData.customerName ?? "",
            companyName: editData.companyName ?? "",
            employeeName: editData.employeeName ?? "",
            type: editData.type,
            totalAmount: totalAmountSaved,
            paidAmount: paid,
            discount: Number(editData.discount) || 0,
            items: itemsToSave,
            notes: editData.notes ?? "",
            oldBalance: Number(editData.oldBalance) || 0,
            newBalance: persistedNewBalance,
          };
          await db.transactionLogs.update(editData.id!, updatePayload);
        }
      );
      showSuccess("Saved", "Changes committed — registry synchronized.");
      setIsEditing(false);
      setEditData(null);
      setProductSearch("");
      setShowProductDropdown(false);
      notifyInventoryChanged();
      notifyLedgerChanged();
      loadInvoices();
    } catch (err: any) {
      console.error("Invoice edit error:", err);
      const msg = err?.message || String(err);
      if (msg.includes("Insufficient batch stock")) {
        showError(
          "Not enough stock",
          "Batch inventory cannot cover the new quantities. Reduce quantities or receive stock first."
        );
      } else {
        showError("Could not save changes", msg);
      }
    }
  };

  const editProductOptions = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 25);
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [products, productSearch]);

  const inputStyle = { colorScheme: darkMode ? "dark" : "light" };

  return (
    <div className="space-y-3 w-full h-full flex flex-col min-h-0">
      <div className="no-print flex flex-col xl:flex-row gap-3 justify-between xl:items-center">
        <div className="flex flex-wrap items-center gap-4 no-print w-full">
          <div className="relative flex-1 min-w-[180px] max-w-sm mr-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search customer name…"
              className={`w-full pl-8 pr-3 py-2 rounded-lg text-xs font-bold outline-none border-none ring-1 ${
                darkMode
                  ? "bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600"
                  : "bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400"
              }`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2">
              Date Frame
            </span>
            <div
              className={`flex items-center gap-2 p-1.5 rounded-2xl border ${
                darkMode
                  ? "bg-[#1a1d23] border-gray-800"
                  : "bg-white border-gray-200"
              }`}
            >
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
                className={`bg-transparent px-3 py-1.5 outline-none text-[10px] font-black uppercase ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              />
              <div className="w-4 h-0.5 bg-gray-500/20" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
                className={`bg-transparent px-3 py-1.5 outline-none text-[10px] font-black uppercase ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2">
              Supplier Filter
            </span>
            <select
              value={filterCompany}
              onFocus={() => {
                if (companies.length === 0) loadCompanies();
              }}
              onChange={(e) => setFilterCompany(e.target.value)}
              className={`border-none rounded-2xl px-5 py-3.5 text-[10px] font-black uppercase outline-none ring-1 transition-all ${
                darkMode
                  ? "bg-[#1a1d23] text-white ring-gray-800"
                  : "bg-white text-gray-900 ring-gray-200"
              }`}
            >
              <option value="All">All Suppliers</option>
              {companies.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setListSearch("");
              setSearchQuery("");
              setStartDate("");
              setEndDate("");
              setFilterCompany("All");
              setActiveTab("ALL");
              loadInvoices();
            }}
            className={`p-3.5 rounded-2xl border transition-all mt-auto ${
              darkMode
                ? "bg-gray-800 text-gray-400 hover:text-white"
                : "bg-white text-gray-500 hover:text-red-500 shadow-sm"
            }`}
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 rounded-3xl w-fit bg-gray-500/10 backdrop-blur-md no-print ml-2">
        {(["ALL", "SALE", "RETURN"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab
                ? "bg-red-600 text-white shadow-lg"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        className={`print:hidden rounded-[48px] border overflow-hidden flex-1 relative flex flex-col ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800"
            : "bg-white border-gray-100 shadow-2xl"
        }`}
      >
        <div className="h-full flex flex-col min-h-0">
          <div className="overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20">
                <tr
                  className={`${
                    darkMode ? "bg-[#1a1d23]" : "bg-white"
                  } border-b border-gray-800/10 text-[10px] font-black uppercase text-gray-500 tracking-widest`}
                >
                  <th className="py-6 px-10">Doc #</th>
                  <th className="py-6 px-4">Entity</th>
                  <th className="py-6 px-4 text-right">Value</th>
                  <th className="py-6 px-4 text-center">Status</th>
                  <th className="py-6 px-10 text-right no-print">Operations</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  darkMode ? "divide-gray-800/40" : "divide-gray-50"
                }`}
              >
                {pageItems.map((tx) => (
                  <tr
                    key={tx.id}
                    className="group hover:bg-red-500/5 transition-all"
                  >
                    <td className="py-6 px-10">
                      <p
                        className={`text-[13px] font-black uppercase ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        #DOC-{tx.id}
                      </p>
                      <p className="text-[10px] font-bold text-gray-500">
                        {new Date(tx.date).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="py-6 px-4">
                      <p
                        className={`text-sm font-black uppercase ${
                          darkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {tx.customerName || tx.companyName || "General Cash"}
                      </p>
                      <span
                        className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                          tx.type === "SALE"
                            ? "bg-green-500/10 text-green-500"
                            : tx.type === "PURCHASE"
                            ? "bg-blue-500/10 text-blue-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-6 px-4 text-right">
                      <p className="text-sm font-black text-red-600">
                        AFN {tx.totalAmount.toLocaleString()}
                      </p>
                    </td>
                    <td className="py-6 px-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                          tx.paidAmount >= tx.totalAmount
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        }`}
                      >
                        {tx.paidAmount >= tx.totalAmount
                          ? "Settled"
                          : "Partial"}
                      </span>
                    </td>
                    <td className="py-6 px-10 text-right no-print">
                      <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleSelectInvoice(tx)}
                          className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-red-500"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => void handleOpenEdit(tx)}
                          className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-blue-500"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => hardDeleteInvoice(tx)}
                          className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
      </div>

      <AnimatePresence>
        {selectedInvoice && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInvoice(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md no-print"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`relative w-full max-w-4xl max-h-[90vh] rounded-[48px] overflow-hidden flex flex-col ${
                darkMode
                  ? "bg-[#1a1d23] border border-gray-800"
                  : "bg-white shadow-2xl"
              }`}
            >
              <div
                className={`p-6 border-b flex justify-between items-center no-print bg-gray-500/5 ${
                  darkMode ? "border-gray-700/50" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="text-red-500" size={20} />
                  <h3
                    className={`font-black text-xs uppercase tracking-widest ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Official Voucher Registry
                  </h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={handlePrintVoucher}
                    className={`flex items-center gap-2 px-4 py-3 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                      darkMode
                        ? "bg-gray-800 text-white hover:bg-gray-700"
                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                    }`}
                  >
                    <Printer size={16} /> Print
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedInvoice && void handleOpenEdit(selectedInvoice)}
                    className={`flex items-center gap-2 px-4 py-3 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                      darkMode
                        ? "bg-blue-600/90 text-white hover:bg-blue-600"
                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                    }`}
                  >
                    <Edit2 size={16} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadPDF(selectedInvoice)}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-3 sm:px-6 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50"
                  >
                    <Download size={16} /> Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(null)}
                    className="p-3 text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <X size={28} />
                  </button>
                </div>
              </div>
              <div
                className={`flex-1 overflow-y-auto p-8 sm:p-12 custom-scrollbar ${
                  darkMode
                    ? "bg-[#14171c] text-gray-100"
                    : "bg-white text-gray-900"
                }`}
              >
                <div
                  className={`flex justify-between items-start mb-10 border-b-4 pb-8 ${
                    darkMode ? "border-gray-600" : "border-black"
                  }`}
                >
                  <div
                    className={`flex items-start gap-6 ${
                      darkMode ? "text-gray-100" : "text-black"
                    }`}
                  >
                    <div className="flex gap-2">
                      {bizSettings?.logos?.map((lg, i) => (
                        <div key={i} className="w-20 h-20 shrink-0">
                          <img
                            src={lg}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ))},
                      {!bizSettings?.logos?.length && bizSettings?.logo && (
                        <div className="w-20 h-20 shrink-0">
                          <img
                            src={bizSettings.logo}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <h1
                        className={`text-4xl font-black tracking-tighter leading-none mb-1 uppercase ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {bizSettings?.companyName}
                      </h1>
                      <p
                        className={`text-[10px] font-black uppercase tracking-widest ${
                          darkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {bizSettings?.address}
                      </p>
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                        Hotline: {bizSettings?.phone}
                      </p>
                      {bizSettings?.representativeName && (
                        <p
                          className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 mt-2 ${
                            darkMode ? "text-gray-500" : "text-gray-400"
                          }`}
                        >
                          <User size={12} className="inline mr-1" /> Authorized:{" "},
                          {bizSettings.representativeName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className={`text-right ${
                      darkMode ? "text-gray-100" : "text-black"
                    }`}
                  >
                    <h2 className="text-2xl font-black uppercase tracking-tighter">
                      {selectedInvoice.type}
                    </h2>
                    <p className="text-red-500 font-black text-sm">
                      #DOC-{selectedInvoice.id}
                    </p>
                    <p
                      className={`text-[10px] font-bold uppercase ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {new Date(selectedInvoice.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="mb-8">
                  <p
                    className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                      darkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    Target Account
                  </p>
                  <p
                    className={`text-xl font-black uppercase ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {selectedInvoice.customerName ||
                      selectedInvoice.companyName ||
                      "Walking Customer"}
                  </p>
                </div>
                <table className="w-full mb-10 border-collapse">
                  <thead>
                    <tr
                      className={`border-b-2 text-[9px] font-black uppercase ${
                        darkMode
                          ? "border-gray-600 text-gray-400"
                          : "border-black text-black"
                      }`}
                    >
                      <th className="py-3 text-left">SKU Description</th>
                      <th className="py-3 text-center">Qty</th>
                      <th className="py-3 text-right">Unit Rate</th>
                      <th className="py-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody
                    className={
                      darkMode ? "divide-y divide-gray-800" : "divide-y divide-gray-100"
                    }
                  >
                    {(selectedInvoice.items ?? []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className={`py-6 text-center text-sm font-bold ${
                            darkMode ? "text-gray-500" : "text-gray-500"
                          }`}
                        >
                          No product lines on this document.
                        </td>
                      </tr>
                    ) : (
                      (selectedInvoice.items ?? []).map((item, i) => (
                        <tr key={i} className="text-[11px] font-bold">
                          <td
                            className={`py-4 uppercase ${
                              darkMode ? "text-gray-200" : "text-gray-900"
                            }`}
                          >
                            {item.productName}
                          </td>
                          <td className="py-4 text-center">{item.quantity}</td>
                          <td
                            className={`py-4 text-right ${
                              darkMode ? "text-gray-300" : "text-gray-800"
                            }`}
                          >
                            AFN {item.unitPrice.toLocaleString()}
                          </td>
                          <td className="py-4 text-right font-black">
                            AFN {item.total.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div
                  className={`flex justify-end pt-8 border-t-2 ${
                    darkMode ? "border-gray-600" : "border-black"
                  }`}
                >
                  <div className="w-80 max-w-full space-y-3">
                    <div
                      className={`flex justify-between items-center text-sm font-bold uppercase ${
                        darkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      <span>Prev Balance:</span>
                      <span className={darkMode ? "text-gray-100" : "text-black"}>
                        AFN {(selectedInvoice.oldBalance || 0).toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={`flex justify-between items-center text-sm font-bold uppercase border-b pb-2 ${
                        darkMode
                          ? "text-gray-500 border-gray-700"
                          : "text-gray-400 border-gray-100"
                      }`}
                    >
                      <span>Current Bill:</span>
                      <span
                        className={`font-black ${
                          darkMode ? "text-white" : "text-black"
                        }`}
                      >
                        AFN {selectedInvoice.totalAmount.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={`flex justify-between items-center text-md font-black pt-1 ${
                        darkMode ? "text-white" : "text-black"
                      }`}
                    >
                      <span>Sum Total Due:</span>
                      <span>
                        AFN{" "},
                        {(
                          (selectedInvoice.oldBalance || 0) +
                          selectedInvoice.totalAmount
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold text-green-500">
                      <span>Cash Received:</span>
                      <span>
                        - AFN {selectedInvoice.paidAmount.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={`flex justify-between items-center text-2xl font-black text-red-500 border-t-2 pt-4 ${
                        darkMode ? "border-gray-600" : "border-black"
                      }`}
                    >
                      <span>Net Balance:</span>
                      <span>
                        AFN {(selectedInvoice.newBalance || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditing && editData && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsEditing(false);
                setEditData(null);
                setProductSearch("");
                setShowProductDropdown(false);
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className={`relative w-full max-w-4xl max-h-[92vh] rounded-[48px] overflow-hidden flex flex-col shadow-2xl ${
                darkMode
                  ? "bg-[#1a1d23] border border-gray-800"
                  : "bg-white border border-gray-100"
              }`}
            >
              <div
                className={`p-6 border-b flex justify-between items-center shrink-0 ${
                  darkMode ? "border-gray-700/50 bg-gray-500/5" : "border-gray-200 bg-gray-500/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Edit2 className="text-blue-500 shrink-0" size={22} />
                  <div className="min-w-0">
                    <h3
                      className={`font-black text-xs uppercase tracking-widest truncate ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Edit voucher
                    </h3>
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      #{editData.id} · {editData.type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditData(null);
                      setProductSearch("");
                      setShowProductDropdown(false);
                    }}
                    className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest ${
                      darkMode
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-ctrl-s-save
                    onClick={() => saveInvoiceEdits()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                  >
                    <Save size={16} /> Save
                  </button>
                </div>
              </div>

              <div
                className={`flex-1 overflow-y-auto p-6 sm:p-10 space-y-8 custom-scrollbar ${
                  darkMode ? "bg-[#14171c]" : "bg-gray-50"
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      Date
                    </label>
                    <input
                      type="date"
                      style={inputStyle}
                      value={toDateInputValue(editData.date)}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          date: new Date(e.target.value + "T12:00:00")
                        })
                      }
                      className={`w-full px-4 py-3 rounded-2xl text-sm font-bold border-none ring-1 outline-none ${
                        darkMode
                          ? "bg-[#1a1d23] text-white ring-gray-700"
                          : "bg-white text-gray-900 ring-gray-200"
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      Party
                    </label>
                    <p
                      className={`px-4 py-3 rounded-2xl text-sm font-black uppercase ${
                        darkMode
                          ? "bg-[#1a1d23] text-gray-200 ring-1 ring-gray-700"
                          : "bg-white text-gray-900 ring-1 ring-gray-200"
                      }`}
                    >
                      {editData.customerName ||
                        editData.companyName ||
                        editData.employeeName ||
                        "—"}
                    </p>
                  </div>
                </div>

                {editData.type !== "PAYMENT" && (
                  <div className="relative">
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2 ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      <Search size={12} /> Add line (product)
                    </label>
                    <div className="relative">
                      <Search
                        size={16}
                        className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                          darkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setShowProductDropdown(true);
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        placeholder="Search products…"
                        className={`w-full px-4 py-3 pl-10 rounded-2xl text-sm font-bold border-none ring-1 outline-none ${
                          darkMode
                            ? "bg-[#1a1d23] text-white ring-gray-700 placeholder:text-gray-600"
                            : "bg-white text-gray-900 ring-gray-200"
                        }`}
                      />
                    </div>
                    {showProductDropdown && editProductOptions.length > 0 && (
                      <div
                        className={`absolute z-10 mt-2 w-full max-h-48 overflow-y-auto rounded-2xl border shadow-xl ${
                          darkMode
                            ? "bg-[#1a1d23] border-gray-700"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        {editProductOptions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addItemToEdit(p)}
                            className={`w-full text-left px-4 py-3 text-xs font-bold uppercase border-b last:border-0 transition-colors ${
                              darkMode
                                ? "border-gray-800 hover:bg-gray-800 text-gray-200"
                                : "border-gray-100 hover:bg-gray-50 text-gray-800"
                            }`}
                          >
                            <Package
                              size={14}
                              className="inline mr-2 opacity-50"
                            />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )},

                {editData.type !== "PAYMENT" && (
                  <div
                    className={`rounded-3xl overflow-hidden ring-1 ${
                      darkMode ? "ring-gray-700" : "ring-gray-200"
                    }`}
                  >
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr
                          className={
                            darkMode
                              ? "bg-[#1a1d23] text-gray-500"
                              : "bg-white text-gray-500"
                          }
                        >
                          <th className="py-3 px-3 font-black uppercase">
                            Item
                          </th>
                          <th className="py-3 px-2 font-black uppercase text-center w-24">
                            Qty
                          </th>
                          <th className="py-3 px-2 font-black uppercase text-right w-28">
                            Rate
                          </th>
                          <th className="py-3 px-2 font-black uppercase text-right w-28">
                            Line
                          </th>
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody
                        className={
                          darkMode
                            ? "divide-y divide-gray-800 bg-[#14171c]"
                            : "divide-y divide-gray-100 bg-white"
                        }
                      >
                        {(editData.items ?? []).map((item, idx) => (
                          <tr key={idx}>
                            <td
                              className={`py-2 px-3 font-bold uppercase ${
                                darkMode ? "text-gray-200" : "text-gray-800"
                              }`}
                            >
                              {item.productName}
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min={1}
                                style={inputStyle}
                                value={item.quantity}
                                onChange={(e) =>
                                  updateEditItem(idx, {
                                    quantity: Number(e.target.value) || 0,
                                  })
                                }
                                className={`w-full px-2 py-1.5 rounded-lg text-center font-black text-xs ring-1 ${
                                  darkMode
                                    ? "bg-[#1a1d23] text-white ring-gray-700"
                                    : "bg-gray-50 ring-gray-200"
                                }`}
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min={0}
                                style={inputStyle}
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateEditItem(idx, {
                                    unitPrice: Number(e.target.value) || 0,
                                  })
                                }
                                className={`w-full px-2 py-1.5 rounded-lg text-right font-black text-xs ring-1 ${
                                  darkMode
                                    ? "bg-[#1a1d23] text-white ring-gray-700"
                                    : "bg-gray-50 ring-gray-200"
                                }`}
                              />
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-black ${
                                darkMode ? "text-gray-100" : "text-gray-900"
                              }`}
                            >
                              {item.total.toLocaleString()}
                            </td>
                            <td className="py-2 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => removeItemFromEdit(idx)}
                                className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(editData.items ?? []).length === 0 && (
                      <p
                        className={`text-center py-8 text-xs font-bold uppercase ${
                          darkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        No lines — add a product above
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {editData.type === "PAYMENT"
                        ? "Amount (paid)"
                        : "Paid amount"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      style={inputStyle}
                      value={editData.paidAmount}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          paidAmount: Number(e.target.value) || 0,
                        })
                      }
                      className={`w-full px-4 py-3 rounded-2xl text-sm font-black border-none ring-1 ${
                        darkMode
                          ? "bg-[#1a1d23] text-white ring-gray-700"
                          : "bg-white text-gray-900 ring-gray-200"
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${
                        darkMode ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      Discount
                    </label>
                    <input
                      type="number"
                      min={0}
                      style={inputStyle}
                      value={editData.discount}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          discount: Number(e.target.value) || 0,
                        })
                      }
                      className={`w-full px-4 py-3 rounded-2xl text-sm font-black border-none ring-1 ${
                        darkMode
                          ? "bg-[#1a1d23] text-white ring-gray-700"
                          : "bg-white text-gray-900 ring-gray-200"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${
                      darkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    Notes
                  </label>
                  <textarea
                    value={editData.notes ?? ""}
                    onChange={(e) =>
                      setEditData({ ...editData, notes: e.target.value })
                    }
                    rows={3}
                    className={`w-full px-4 py-3 rounded-2xl text-sm font-bold border-none ring-1 resize-none ${
                      darkMode
                        ? "bg-[#1a1d23] text-white ring-gray-700 placeholder:text-gray-600"
                        : "bg-white text-gray-900 ring-gray-200"
                    }`}
                    placeholder="Optional notes…"
                  />
                </div>

                {editData.type !== "PAYMENT" && (
                  <div
                    className={`flex justify-end text-sm font-black ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    <span className="text-gray-500 uppercase text-[10px] mr-3 mt-1">
                      Document total
                    </span>
                    <span className="text-xl">
                      AFN {editData.totalAmount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* A4 voucher: PDF export + print via #print-mount (see index.html @media print) */}
      <PrintMountPortal>
        <SimpleBookReportPage
          ref={simplePdfRef}
          printable={true}
          companyName={bizSettings?.companyName || "Spectrum Pro"}
          logoSrc={
            bizSettings?.logos?.[bizSettings?.selectedLogoIndex ?? 0] ||
            bizSettings?.logo
          }
          reportTitle={
            selectedInvoice
              ? `Voucher #${selectedInvoice.id} · ${selectedInvoice.type}`
              : "Voucher"
          }
          periodLine={
            selectedInvoice
              ? `${new Date(selectedInvoice.date).toLocaleDateString()} · ${
                  selectedInvoice.customerName ||
                  selectedInvoice.companyName ||
                  "—"
                }`
              : ""
          }
        >
          {bizSettings?.address || bizSettings?.phone ? (
            <p style={{ ...book.tag, marginBottom: "10px", fontSize: "8px" }}>
              {[bizSettings?.address, bizSettings?.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <div style={book.sectionLabel}>Line items</div>
          <table style={book.table}>
            <thead>
              <tr>
                <th style={book.th}>Description</th>
                <th style={{ ...book.th, ...book.thCenter }}>Qty</th>
                <th style={{ ...book.th, ...book.thRight }}>Unit (AFN)</th>
                <th style={{ ...book.th, ...book.thRight }}>Line (AFN)</th>
              </tr>
            </thead>
            <tbody>
              {(selectedInvoice?.items ?? []).map((item, i) => (
                <tr key={i}>
                  <td style={book.td}>{item.productName}</td>
                  <td style={{ ...book.td, ...book.tdCenter }}>{item.quantity}</td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {item.unitPrice.toLocaleString()}
                  </td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {item.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={book.sectionLabel}>Totals (AFN)</div>
          <table style={{ ...book.table, maxWidth: "280px", marginLeft: "auto" }}>
            <tbody>
              <tr>
                <td style={book.td}>Previous balance</td>
                <td style={{ ...book.td, ...book.tdRight }}>
                  {(selectedInvoice?.oldBalance || 0).toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={book.td}>Document amount</td>
                <td style={{ ...book.td, ...book.tdRight }}>
                  {(selectedInvoice?.totalAmount ?? 0).toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={{ ...book.td, backgroundColor: "#f3f4f6", fontWeight: 700 }}>
                  Subtotal
                </td>
                <td
                  style={{
                    ...book.td,
                    ...book.tdRight,
                    backgroundColor: "#f3f4f6",
                    fontWeight: 700,
                  }}
                >
                  {(
                    (selectedInvoice?.oldBalance || 0) +
                    (selectedInvoice?.totalAmount || 0)
                  ).toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={book.td}>Paid</td>
                <td style={{ ...book.td, ...book.tdRight }}>
                  ({(selectedInvoice?.paidAmount ?? 0).toLocaleString()})
                </td>
              </tr>
              <tr>
                <td style={{ ...book.td, fontWeight: 700 }}>Balance due</td>
                <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                  {(selectedInvoice?.newBalance ?? 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </SimpleBookReportPage>
      </PrintMountPortal>
    </div>
  );
}
