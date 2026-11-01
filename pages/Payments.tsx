import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  User,
  Building2,
  Plus,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  History,
  Briefcase,
  RefreshCw,
  Filter,
  Calendar,
  X,
  Edit2,
  Trash2,
  Save,
  Trash,
  ArrowUpDown,
  ChevronDown,
  AlertTriangle,
  Search,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../db";
import { Customer, Company, Employee, Transaction } from "../types";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { useFeedback } from "../contexts/FeedbackContext";
import { useOpenNewFromQuery } from "../hooks/useOpenNewFromQuery";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { computeCompanyBalance, computeEmployeeDue } from "../utils/ledgerBalances";
import { TX_LIST_COLUMNS } from "../utils/txListColumns";
import { notifyLedgerChanged, useLazyScreenDataSync } from "../utils/dataSync";
import { clearFormDraft, readFormDraft, writeFormDraft } from "../utils/formDraft";
import { SaveDraftButton } from "../components/ui/SaveDraftButton";

type PaymentMode = "RECEIVE" | "PAY" | "SALARY";
type PartyRow = Customer | Company | Employee;

const PARTY_PAGE_SIZE = 10;

export default function Payments({ darkMode }: { darkMode: boolean }) {
  const { showSuccess, showError } = useFeedback();
    const navigate = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState<PaymentMode>("RECEIVE");
    const [listVersion, setListVersion] = useState(0);
    const [partyListActive, setPartyListActive] = useState(true);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
    );
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
    );
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [partySearch, setPartySearch] = useState("");
    const [debouncedPartySearch, setDebouncedPartySearch] = useState("");
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [paymentDate, setPaymentDate] = useState(
      () => new Date().toISOString().split("T")[0]
    );
    const [notes, setNotes] = useState("");

    useOpenNewFromQuery(() => {
      const draft = readFormDraft<{
        mode?: PaymentMode;
        customerId?: number;
        companyId?: number;
        employeeId?: number;
        amount?: number;
        date?: string;
        notes?: string;
      }>("payment");
      setMode(draft?.mode || "RECEIVE");
      setPaymentAmount(Number(draft?.amount) || 0);
      setPaymentDate(draft?.date || new Date().toISOString().split("T")[0]);
      setNotes(draft?.notes || "");
      if (draft?.customerId) {
        void db.customers.get(draft.customerId).then((row) => {
          if (row) setSelectedCustomer(row as Customer);
        });
      }
      if (draft?.companyId) {
        void db.companies.get(draft.companyId).then((row) => {
          if (row) setSelectedCompany(row as Company);
        });
      }
      if (draft?.employeeId) {
        void db.employees.get(draft.employeeId).then((row) => {
          if (row) setSelectedEmployee(row as Employee);
        });
      }
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [calculatedBalance, setCalculatedBalance] = useState<number>(0);
    // History & Edit States
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editFormData, setEditFormData] = useState({
    paidAmount: 0,
    notes: "",
    date: new Date().toISOString().split("T")[0],
    });

    useEffect(() => {
      const t = window.setTimeout(() => setDebouncedPartySearch(partySearch), 150);
      return () => window.clearTimeout(t);
    }, [partySearch]);

    useEffect(() => {
    const initFromNavigation = async () => {
    const state = location.state as {
    initialMode?: PaymentMode;
    selectedId?: number;
    editId?: number;
    deleteId?: number;
    } | null;
    if (state?.initialMode) {
    setMode(state.initialMode);
    if (state.selectedId) {
    setPartyListActive(true);
    if (state.initialMode === "SALARY") {
    const emp = await db.employees.get(state.selectedId);
    if (emp) setSelectedEmployee(emp);
    } else if (state.initialMode === "RECEIVE") {
    const cust = await db.customers.get(state.selectedId);
    if (cust) setSelectedCustomer(cust);
    } else if (state.initialMode === "PAY") {
    const comp = await db.companies.get(state.selectedId);
    if (comp) setSelectedCompany(comp);
    }
    }
    }
    setListVersion((v) => v + 1);
    };
    initFromNavigation();
    }, [location.state]);
    useEffect(() => {
    setListVersion((v) => v + 1);
    }, [mode]);
    useEffect(() => {
    const refreshBalance = async () => {
    if (mode === "SALARY" && selectedEmployee)
    await calculateEmpBalance(selectedEmployee);
    else if (mode === "PAY" && selectedCompany)
    await calculateCompBalance(selectedCompany);
    else if (mode === "RECEIVE" && selectedCustomer)
    setCalculatedBalance(Number(selectedCustomer.balance) || 0);
    };
    refreshBalance();
    }, [selectedEmployee, selectedCompany, selectedCustomer, mode]);
    const refreshLists = useCallback(() => setListVersion((v) => v + 1), []);
    useLazyScreenDataSync(refreshLists);
    const calculateEmpBalance = async (emp: Employee) => {
    const history = await db.transactionLogs
    .where("employeeId")
    .equals(emp.id!)
    .toArray();
    setCalculatedBalance(computeEmployeeDue(emp, history));
    };
    const calculateCompBalance = async (comp: Company) => {
    const history = await db.transactionLogs
    .where("companyId")
    .equals(comp.id!)
    .toArray();
    setCalculatedBalance(computeCompanyBalance(comp.openingBalance, history));
    };
    const handleRecordPayment = async () => {
    if (paymentAmount <= 0) {
    showError("Invalid amount", "Please enter a valid amount.");
    return;
    }
    const party =
    mode === "RECEIVE"
    ? selectedCustomer
    : mode === "PAY"
    ? selectedCompany
    : selectedEmployee;
    if (!party) {
    showError("Select a party", "Please select a valid party from the registry.");
    return;
    }
    setIsProcessing(true);
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
    setIsProcessing(false);
    showError("Invalid amount", "Please enter a valid amount.");
    return;
    }
    const prevBalance = Number(calculatedBalance) || 0;
    const nextBalance =
    mode === "RECEIVE" ? prevBalance - amount : prevBalance + amount;
    const notesText =
    notes ||
    `${
    mode === "RECEIVE"
    ? "Customer Receipt"
    : mode === "PAY"
    ? "Supplier Payment"
    : "Salary Disbursal"
    } for ${party.name}`;
    const transaction = {
    date: paymentDate ? new Date(paymentDate) : new Date(),
    type: mode === "SALARY" ? "SALARY" : "PAYMENT",
    totalAmount: 0,
    paidAmount: amount,
    discount: 0,
    items: [] as any[],
    notes: notesText,
    customerId: mode === "RECEIVE" ? selectedCustomer?.id ?? null : null,
    customerName: mode === "RECEIVE" ? selectedCustomer?.name ?? "" : "",
    companyId: mode === "PAY" ? selectedCompany?.id ?? null : null,
    companyName: mode === "PAY" ? selectedCompany?.name ?? "" : "",
    employeeId: mode === "SALARY" ? selectedEmployee?.id ?? null : null,
    employeeName: mode === "SALARY" ? selectedEmployee?.name ?? "" : "",
    oldBalance: prevBalance,
    newBalance: nextBalance,
    isDeleted: false,
    };
    try {
    // Run without db.transaction() to avoid Tauri plugin "cannot rollback - no transaction" when a statement fails
    const paymentId = (await db.transactionLogs.add(transaction)) as number;
    try {
    if (mode === "RECEIVE" && selectedCustomer?.id) {
    const cust = await db.customers.get(selectedCustomer.id);
    if (cust) {
    await db.customers.update(selectedCustomer.id, {
    balance: (Number(cust.balance) || 0) - amount,
    totalDebit: (Number(cust.totalDebit) || 0) + amount,
    });
    }
    }
    } catch (balanceErr) {
    // Compensate orphan payment row if ledger party update fails.
    try {
      if (paymentId) await db.transactionLogs.delete(paymentId);
    } catch {
      /* ignore */
    }
    throw balanceErr;
    }
    showSuccess("Payment recorded", "Ledger synchronized.");
    clearFormDraft("payment");
    notifyLedgerChanged();
    setPaymentAmount(0);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setSelectedCustomer(null);
    setSelectedCompany(null);
    setSelectedEmployee(null);
    refreshLists();
    } catch (err: any) {
    console.error("Payment record error:", err);
    const msg = err?.message || String(err);
    showError("Payment failed", msg || "Check console for details.");
    } finally {
    setIsProcessing(false);
    }
    };
    const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditFormData({
      paidAmount: tx.paidAmount,
      notes: tx.notes || "",
      date: new Date(tx.date).toISOString().split("T")[0],
    });
    setIsEditing(true);
    };
    const handleSaveEdit = async () => {
    if (!editingTx || !editingTx.id) return;
    setIsProcessing(true);
    try {
    await db.transaction("rw", ["customers", "transactionLogs"], async () => {
    const diff = Number(editFormData.paidAmount) - editingTx.paidAmount;
    // Synchronize Customer Ledger if applicable
    if (editingTx.type === "PAYMENT" && editingTx.customerId) {
    const cust = await db.customers.get(editingTx.customerId);
    if (cust) {
    await db.customers.update(editingTx.customerId, {
    balance: (Number(cust.balance) || 0) - diff,
    totalDebit: (Number(cust.totalDebit) || 0) + diff,
    });
    }
    }
    const newBal =
    (Number(editingTx.newBalance) || 0) + (editingTx.customerId ? -diff : diff);
    const amt = Number(editFormData.paidAmount) || 0;
    await db.transactionLogs.update(editingTx.id!, {
    paidAmount: amt,
    date: editFormData.date ? new Date(editFormData.date) : editingTx.date,
    ...(editingTx.type === "CAPITAL_INJECTION"
    ? { totalAmount: amt }
    : {}),
    notes: editFormData.notes ?? "",
    newBalance: newBal,
    });
    });
    showSuccess("Adjustment saved", "All records synchronized.");
    setIsEditing(false);
    setEditingTx(null);
    refreshLists();
    notifyLedgerChanged();
    } catch (err: any) {
    console.error("Payment edit error:", err);
    showError("Could not save edit", err?.message || String(err));
    } finally {
    setIsProcessing(false);
    }
    };
    const hardDeletePayment = async (tx: Transaction) => {
    if (
    !window.confirm(
    "CRITICAL SECURITY ACTION: Permanent deletion will reverse the cash effect and remove the record from history forever. Continue?",
    )
    )
    return;
    try {
    await db.transaction("rw", ["customers", "transactionLogs"], async () => {
    if (tx.type === "PAYMENT" && tx.customerId) {
    const cust = await db.customers.get(tx.customerId);
    if (cust) {
    await db.customers.update(tx.customerId, {
    balance: (Number(cust.balance) || 0) + tx.paidAmount,
    totalDebit: Math.max(
    0,
    (Number(cust.totalDebit) || 0) - tx.paidAmount,
    )
    });
    }
    }
    // Hard delete always — never soft-delete payment/capital rows from this screen.
    await db.transactionLogs.delete(tx.id!);
    });
    refreshLists();
    notifyLedgerChanged();
    showSuccess("Deleted", "Entry hard-deleted from registry.");
    } catch (err: any) {
    console.error("Payment delete error:", err);
    showError("Could not delete payment", err?.message || String(err));
    }
    };
    useEffect(() => {
    const state = location.state as { editId?: number; deleteId?: number } | null;
    if (!state?.editId && !state?.deleteId) return;
    navigate(location.pathname, { replace: true, state: null });
    (async () => {
    const id = state.editId ?? state.deleteId;
    if (id == null) return;
    const tx = await db.transactionLogs.get(id);
    if (
    !tx ||
    tx.isDeleted ||
    (tx.type !== "PAYMENT" &&
    tx.type !== "SALARY" &&
    tx.type !== "CAPITAL_INJECTION")
    ) {
    showError("Not found", "Payment record was not found.");
    return;
    }
    if (state.editId) {
    setEditingTx(tx);
    setEditFormData({
    paidAmount: tx.paidAmount,
    notes: tx.notes || "",
    date: new Date(tx.date).toISOString().split("T")[0],
    });
    setIsEditing(true);
    }
    if (state.deleteId) await hardDeletePayment(tx);
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
        { col: "isDeleted", op: "=", val: 0 },
        {
          col: "type",
          op: "IN",
          val: ["PAYMENT", "SALARY", "CAPITAL_INJECTION"],
        },
      ];
      if (startDate) where.push({ col: "date", op: ">=", val: startDate });
      if (endDate) {
        where.push({ col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` });
      }
      const term = searchQuery.trim();
      const orWhere: DbWhere = term
        ? [
            { col: "customerName", op: "LIKE", val: `%${term}%` },
            { col: "companyName", op: "LIKE", val: `%${term}%` },
            { col: "employeeName", op: "LIKE", val: `%${term}%` },
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
    [searchQuery, startDate, endDate, listVersion],
    undefined,
    `payments:${searchQuery}:${startDate}:${endDate}:${listVersion}`
  );

  const {
    pageItems: partyPageItems,
    pageSize: partyPageSize,
    setPageSize: setPartyPageSize,
    total: partyTotal,
    shown: partyShown,
    hasMore: partyHasMore,
    loadMore: partyLoadMore,
  } = useDbPagination<PartyRow>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [{ col: "isDeleted", op: "=", val: 0 }];
      const term = debouncedPartySearch.trim();
      if (mode === "RECEIVE") {
        const orWhere: DbWhere = term
          ? [
              { col: "name", op: "LIKE", val: `%${term}%` },
              { col: "phone", op: "LIKE", val: `%${term}%` },
            ]
          : [];
        const [rows, count] = await Promise.all([
          db.customers.query({
            where,
            orWhere,
            orderBy: "name",
            orderDir: "ASC",
            limit: size,
            offset,
            columns: ["id", "name", "phone", "balance", "isDeleted"],
          }),
          db.customers.countWhere(where, orWhere),
        ]);
        return { rows: rows as Customer[], total: count };
      }
      if (mode === "PAY") {
        const orWhere: DbWhere = term
          ? [
              { col: "name", op: "LIKE", val: `%${term}%` },
              { col: "phone", op: "LIKE", val: `%${term}%` },
              { col: "contactPerson", op: "LIKE", val: `%${term}%` },
            ]
          : [];
        const [rows, count] = await Promise.all([
          db.companies.query({
            where,
            orWhere,
            orderBy: "name",
            orderDir: "ASC",
            limit: size,
            offset,
          }),
          db.companies.countWhere(where, orWhere),
        ]);
        return { rows: rows as Company[], total: count };
      }
      const orWhere: DbWhere = term
        ? [
            { col: "name", op: "LIKE", val: `%${term}%` },
            { col: "phone", op: "LIKE", val: `%${term}%` },
          ]
        : [];
      const [rows, count] = await Promise.all([
        db.employees.query({
          where,
          orWhere,
          orderBy: "name",
          orderDir: "ASC",
          limit: size,
          offset,
        }),
        db.employees.countWhere(where, orWhere),
      ]);
      return { rows: rows as Employee[], total: count };
    },
    [mode, debouncedPartySearch, listVersion],
    PARTY_PAGE_SIZE,
    `payments-party:${mode}:${debouncedPartySearch}`
  );

  const activeParty = selectedCustomer || selectedCompany || selectedEmployee;

  return (
    <div className="space-y-3 w-full pb-6 h-full min-h-0">
      <div className="flex gap-1 p-1 rounded-3xl w-fit bg-gray-500/10 backdrop-blur-md overflow-x-auto no-scrollbar max-w-full">
        {(["RECEIVE", "PAY", "SALARY"] as PaymentMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setSelectedCustomer(null);
              setSelectedCompany(null);
              setSelectedEmployee(null);
              setPaymentAmount(0);
              setPartySearch("");
            }}
            className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              mode === m
                ? (m === "RECEIVE"
                    ? "bg-red-500"
                    : m === "PAY"
                    ? "bg-blue-600"
                    : "bg-indigo-600") + " text-white shadow-lg"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {m === "RECEIVE"
              ? "Party Receipt"
              : m === "PAY"
              ? "Vendor Pay"
              : "Staff Salary"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Entity Lookup */}
        <div
          className={`lg:col-span-1 flex flex-col h-[500px] rounded-[48px] overflow-hidden border transition-all ${
            darkMode
              ? "bg-[#1a1d23] border-gray-800 shadow-2xl"
              : "bg-white border-gray-100 shadow-xl"
          }`}
          onMouseEnter={() => setPartyListActive(true)}
        >
          <div className="p-4 border-b border-gray-800/10 shrink-0">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              />
              <input
                type="search"
                value={partySearch}
                onFocus={() => setPartyListActive(true)}
                onChange={(e) => setPartySearch(e.target.value)}
                placeholder={
                  mode === "RECEIVE"
                    ? "Search customer…"
                    : mode === "PAY"
                    ? "Search vendor…"
                    : "Search staff…"
                }
                className={`w-full pl-9 pr-3 py-2.5 rounded-2xl text-xs font-bold outline-none border-none ring-1 ${
                  darkMode
                    ? "bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600"
                    : "bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400"
                }`}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {partyPageItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (mode === "RECEIVE") setSelectedCustomer(item as Customer);
                  else if (mode === "PAY") setSelectedCompany(item as Company);
                  else setSelectedEmployee(item as Employee);
                }}
                className={`w-full p-4 rounded-3xl border text-left flex items-center justify-between transition-all duration-300 ${
                  (mode === "RECEIVE"
                    ? selectedCustomer?.id
                    : mode === "PAY"
                    ? selectedCompany?.id
                    : selectedEmployee?.id) === item.id
                    ? "bg-red-500/10 border-red-500/50"
                    : `${
                        darkMode
                          ? "bg-gray-900/40 border-gray-800 hover:bg-gray-800"
                          : "bg-gray-50 border-gray-100"
                      }`
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                      darkMode
                        ? "bg-gray-800 text-gray-500"
                        : "bg-white shadow-sm text-gray-400"
                    }`}
                  >
                    {mode === "RECEIVE" ? (
                      <User size={18} />
                    ) : mode === "PAY" ? (
                      <Building2 size={18} />
                    ) : (
                      <Briefcase size={18} />
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-xs font-black ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.name}
                    </p>
                    <p className="text-[9px] text-gray-500 font-bold uppercase mt-1">
                      Registry Ref: #ID-{item.id}
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {partyTotal === 0 && (
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-500 py-10">
                No parties found
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-gray-800/10">
            <PaginationBar
              darkMode={darkMode}
              total={partyTotal}
              shown={partyShown}
              hasMore={partyHasMore}
              onLoadMore={partyLoadMore}
              pageSize={partyPageSize}
              onPageSizeChange={setPartyPageSize}
            />
          </div>
        </div>

        {/* Action Panel */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {activeParty ? (
              <motion.div
                key={activeParty.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`p-12 rounded-[56px] border ${
                  darkMode
                    ? "bg-[#1a1d23] border-gray-800"
                    : "bg-white shadow-2xl border-gray-100"
                }`}
              >
                <div className="flex justify-between items-start mb-12">
                  <div className="flex items-center gap-6">
                    <div
                      className={`w-20 h-20 rounded-[32px] flex items-center justify-center shadow-xl ${
                        mode === "RECEIVE"
                          ? "bg-red-500 text-white shadow-red-500/30"
                          : mode === "PAY"
                          ? "bg-blue-600 text-white shadow-blue-500/30"
                          : "bg-indigo-600 text-white shadow-indigo-500/30"
                      }`}
                    >
                      <DollarSign size={32} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
                        {mode} Protocol
                      </p>
                      <h3
                        className={`text-3xl font-black ${
                          darkMode ? "text-white" : "text-gray-900"
                        } tracking-tighter uppercase`}
                      >
                        {activeParty.name}
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
                      Ledger Balance
                    </p>
                    <p
                      className={`text-3xl font-black ${
                        calculatedBalance > 0
                          ? "text-red-500"
                          : "text-green-500"
                      }`}
                    >
                      AFN {calculatedBalance.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">
                      Payment Magnitude (AFN)
                    </label>
                    <input
                      type="number"
                      value={paymentAmount ?? ""}
                      onChange={(e) => setPaymentAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                      placeholder="0.00"
                      className={`w-full px-8 py-6 rounded-[32px] text-4xl font-black ${
                        darkMode
                          ? "bg-gray-900 text-white border-gray-800"
                          : "bg-gray-50 border-gray-200 shadow-inner"
                      } border outline-none focus:ring-2 focus:ring-red-500 transition-all`}
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{ colorScheme: darkMode ? "dark" : "light" }}
                      className={`w-full px-8 py-6 rounded-[32px] text-xl font-black ${
                        darkMode
                          ? "bg-gray-900 text-white border-gray-800"
                          : "bg-gray-50 border-gray-200 shadow-inner"
                      } border outline-none focus:ring-2 focus:ring-red-500 transition-all`}
                    />
                  </div>
                  <div className="space-y-4 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">
                      Registry Notes / Description
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Partial clearing of March dues..."
                      className={`w-full px-8 py-4 rounded-[32px] text-sm font-bold ${
                        darkMode
                          ? "bg-gray-900 text-white border-gray-800"
                          : "bg-gray-50 border-gray-200 shadow-inner"
                      } border outline-none resize-none h-32`}
                    />
                  </div>
                </div>

                <SaveDraftButton
                  darkMode={darkMode}
                  className="w-full mt-4 !flex-none py-4 rounded-[24px]"
                  onClick={() => {
                    writeFormDraft("payment", {
                      mode,
                      customerId: selectedCustomer?.id,
                      companyId: selectedCompany?.id,
                      employeeId: selectedEmployee?.id,
                      amount: paymentAmount,
                      date: paymentDate,
                      notes,
                    });
                    showSuccess("Draft saved", "This payment will reopen with these values.");
                  }}
                />
                <button
                  onClick={handleRecordPayment}
                  disabled={isProcessing || paymentAmount <= 0}
                  className={`w-full py-6 rounded-[32px] mt-10 font-black text-xs uppercase tracking-widest text-white transition-all shadow-xl shadow-red-500/10 ${
                    paymentAmount <= 0 || isProcessing
                      ? "bg-gray-600 grayscale"
                      : (mode === "RECEIVE"
                          ? "bg-red-500"
                          : mode === "PAY"
                          ? "bg-blue-600"
                          : "bg-indigo-600") +
                        " hover:scale-[1.02] active:scale-95"
                  }`}
                >
                  {isProcessing
                    ? "SYNCHRONIZING REGISTRY..."
                    : "AUTHORIZE DISBURSEMENT"}
                </button>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] opacity-10 grayscale">
                <CreditCard size={120} />
                <p className="mt-8 font-black uppercase tracking-[0.4em] text-sm">
                  Select target account to initiate payment
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* History Log - Enhanced Card */}
      <div
        className={`p-3 rounded-2xl border overflow-hidden ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800 shadow-2xl"
            : "bg-white shadow-xl border-gray-100"
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500 text-white rounded-2xl shadow-lg">
              <History size={20} />
            </div>
            <h3
              className={`text-lg font-black uppercase tracking-widest ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Cashflow Audit Log
            </h3>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">
                Date Filter
              </label>
              <div
                className={`flex items-center gap-2 p-1.5 rounded-2xl border ${
                  darkMode
                    ? "bg-gray-900 border-gray-800"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase outline-none text-gray-500"
                />
                <div className="w-4 h-0.5 bg-gray-500/20" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase outline-none text-gray-500"
                />
              </div>
            </div>

            <button
              onClick={() => {
                setSearchQuery("");
                setStartDate("");
                setEndDate("");
                refreshLists();
              }}
              className="p-3 bg-gray-500/10 rounded-2xl text-gray-500 hover:text-red-500 transition-all"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-hidden border border-gray-800/10 rounded-[32px] flex flex-col">
          <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr
                  className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                    darkMode
                      ? "bg-[#1a1d23] text-gray-500"
                      : "bg-white text-gray-400"
                  } border-b border-gray-800/10`}
                >
                  <th className="py-5 px-8">Timestamp</th>
                  <th className="py-5 px-4">Registry Node</th>
                  <th className="py-5 px-4">Mode</th>
                  <th className="py-5 px-4">Notes</th>
                  <th className="py-5 px-4 text-right">Magnitude</th>
                  <th className="py-5 px-8 text-right">Operations</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  darkMode ? "divide-gray-800/20" : "divide-gray-50"
                }`}
              >
                {pageItems.map((p) => (
                  <tr
                    key={p.id}
                    className="group hover:bg-red-500/5 transition-all text-xs"
                  >
                    <td className="py-5 px-8">
                      <p
                        className={`font-black ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {new Date(p.date).toLocaleDateString()}
                      </p>
                      <p className="text-[9px] font-bold text-gray-500 uppercase mt-0.5">
                        {new Date(p.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td className="py-5 px-4">
                      <p
                        className={`font-black uppercase ${
                          darkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {p.customerName || p.companyName || p.employeeName}
                      </p>
                      <p className="text-[8px] font-bold text-gray-500">
                        Ref: #ID-{p.id}
                      </p>
                    </td>
                    <td className="py-5 px-4">
                      <span
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          p.type === "SALARY"
                            ? "bg-indigo-500/10 text-indigo-500"
                            : p.type === "CAPITAL_INJECTION"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-gray-500/10 text-gray-500"
                        }`}
                      >
                        {p.type === "CAPITAL_INJECTION"
                          ? "CAPITAL"
                          : p.type}
                      </span>
                    </td>
                    <td className="py-5 px-4">
                      <p className="text-[10px] font-bold text-gray-500 truncate max-w-[200px]">
                        {p.notes || "-"}
                      </p>
                    </td>
                    <td className="py-5 px-4 text-right">
                      <p
                        className={`text-sm font-black ${
                          p.type === "CAPITAL_INJECTION"
                            ? "text-emerald-500"
                            : "text-red-600"
                        }`}
                      >
                        AFN {p.paidAmount.toLocaleString()}
                      </p>
                    </td>
                    <td className="py-5 px-8 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => hardDeletePayment(p)}
                          className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))},
                {total === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-40 text-center opacity-30 italic text-sm font-black uppercase tracking-widest"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <Filter size={48} />
                        <p>No matching registry entries found</p>
                      </div>
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
      </div>

      {/* EDIT MODAL */}
      <AnimatePresence>
        {isEditing && editingTx && (
          <div data-modal-shell className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setIsEditing(false)}
            />
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-5 py-3 border-b border-gray-800/10 flex justify-between items-center bg-gray-500/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-xl">
                    <Edit2 size={16} />
                  </div>
                  <div>
                    <h3
                      className={`text-sm font-black uppercase tracking-widest ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Edit #ID-{editingTx.id}
                    </h3>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      Adjust historical entry
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">
                    Magnitude (AFN)
                  </label>
                  <input
                    type="number"
                    value={editFormData.paidAmount ?? ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        paidAmount: e.target.value === "" ? 0 : Number(e.target.value)
                      })
                    }
                    className={`w-full px-4 py-2.5 rounded-xl text-xl font-black outline-none border-none ring-1 ${
                      darkMode
                        ? "bg-gray-900 ring-gray-800 text-white focus:ring-blue-500 shadow-inner"
                        : "bg-gray-50 ring-gray-200 focus:ring-blue-500"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.date}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        date: e.target.value,
                      })
                    }
                    style={{ colorScheme: darkMode ? "dark" : "light" }}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm font-black outline-none border-none ring-1 ${
                      darkMode
                        ? "bg-gray-900 ring-gray-800 text-white focus:ring-blue-500 shadow-inner"
                        : "bg-gray-50 ring-gray-200 focus:ring-blue-500"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">
                    Registry Notes
                  </label>
                  <textarea
                    value={editFormData.notes}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        notes: e.target.value,
                      })
                    }
                    rows={2}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm font-bold h-16 outline-none border-none ring-1 resize-none ${
                      darkMode
                        ? "bg-gray-900 ring-gray-800 text-white"
                        : "bg-gray-50 ring-gray-200"
                    }`}
                  />
                </div>
                {editingTx.type !== "CAPITAL_INJECTION" && (
                <div className="px-3 py-2 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  <div className="flex items-center gap-2 text-blue-500 mb-1">
                    <AlertTriangle size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      Impact Analysis
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 leading-snug uppercase tracking-tight">
                    Updating this amount will automatically reconcile the target
                    party's ledger balance to reflect the new magnitude.
                  </p>
                </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-gray-800/10 flex gap-3">
                <button
                  onClick={() => setIsEditing(false)}
                  className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-500 rounded-xl hover:bg-gray-500/10`}
                >
                  Discard
                </button>
                <button
                  data-ctrl-s-save
                  onClick={handleSaveEdit}
                  className="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Save Adjustments
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
