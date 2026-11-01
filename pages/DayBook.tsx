
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, Check, X, 
  TrendingUp, TrendingDown, ShoppingCart, ShoppingBag, 
  Wallet, CreditCard,
  History, Download, Printer, RefreshCw, Edit2, Trash2
} from 'lucide-react';
import { db } from '../db';
import { Transaction, Expense, Company, Product, SystemSettings } from '../types';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { useScreenOverlay } from '../contexts/ScreenOverlayContext';
import { SimpleBookReportPage, book } from '../components/SimpleBookReport';
import PrintMountPortal from '../components/PrintMountPortal';
import { computePeriodPnL } from '../utils/periodPnL';
import { usePagination } from '../hooks/usePagination';
import { PaginationBar } from '../components/ui/PaginationBar';
import { useOpenScreenInPlace } from '../hooks/useOpenScreenInPlace';
import { TX_LIST_COLUMNS } from '../utils/txListColumns';
import { useLazyScreenDataSync } from '../utils/dataSync';

/** Route each day-book row to the screen that owns edit/delete for that type. */
function ownerPathForEvent(event: {
  eventType?: string;
  type?: string;
}): string | null {
  if (event.eventType === "EXPENSE" || event.type === "EXPENSE") return "/expenses";
  switch (event.type) {
    case "SALE":
    case "RETURN":
    case "PURCHASE_RETURN":
      return "/invoices";
    case "PURCHASE":
      return "/purchases";
    case "PAYMENT":
    case "SALARY":
      return "/payments";
    case "CAPITAL_INJECTION":
      return "/capital";
    default:
      return null;
  }
}

export default function DayBook({ darkMode }: { darkMode: boolean }) {
  const openInPlace = useOpenScreenInPlace();
  const { onOverlayClosed } = useScreenOverlay();
  const { showError } = useFeedback();
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedCompany, setSelectedCompany] = useState<string>('All');
    const [companies, setCompanies] = useState<Company[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [showCompanyModal, setShowCompanyModal] = useState(false);
    const bookRef = useRef<HTMLDivElement>(null);
    const { query: searchQuery } = useGlobalSearch();
    useEffect(() => {
    const t = window.setTimeout(() => { void loadBaseData(); }, 0);
    return () => window.clearTimeout(t);
    }, []);
    useEffect(() => {
    if (selectedCompany !== 'All') void loadProductCompanies();
    }, [selectedCompany]);
    useEffect(() => {
    loadFilteredData();
    }, [startDate, endDate, selectedCompany, products]);
    useEffect(() => {
      return onOverlayClosed(() => {
        loadFilteredData();
      });
    }, [onOverlayClosed, startDate, endDate, selectedCompany, products]);
    const loadBaseData = async () => {
    const [allCompanies, settings] = await Promise.all([
    db.companies.query({
    where: [{ col: 'isDeleted', op: '=', val: 0 }],
    orderBy: 'name',
    orderDir: 'ASC',
    columns: ['id', 'name'],
    }),
    db.settings.toArray()
    ]);
    setCompanies(allCompanies);
    if (settings.length > 0) setBizSettings(settings[0]);
    };
    const loadProductCompanies = async () => {
    if (products.length > 0) return;
    const allProducts = await db.products.query({
    where: [{ col: 'isDeleted', op: '=', val: 0 }],
    columns: ['id', 'company'],
    });
    setProducts(allProducts);
    };
    const loadFilteredData = useCallback(async () => {
    const [allTx, allExp] = await Promise.all([
    db.transactionLogs.query({
    where: [
    { col: 'isDeleted', op: '=', val: 0 },
    { col: 'date', op: '>=', val: startDate },
    { col: 'date', op: '<=', val: `${endDate}T23:59:59.999Z` }
    ],
    orderBy: 'date',
    orderDir: 'DESC',
    columns: [...TX_LIST_COLUMNS, 'items'],
    }),
    db.expenses.query({
    where: [
    { col: 'date', op: '>=', val: startDate },
    { col: 'date', op: '<=', val: `${endDate}T23:59:59.999Z` }
    ],
    orderBy: 'date',
    orderDir: 'DESC',
    })
    ]);
    let filteredTx = allTx as Transaction[];
    let filteredExp = allExp as Expense[];
    if (selectedCompany !== 'All') {
    filteredTx = filteredTx.filter(t => {
    if (t.type === 'CAPITAL_INJECTION') return true;
    if (t.companyName === selectedCompany) return true;
    return t.items?.some(item => {
    const prod = products.find(p => p.id === item.productId);
    return prod?.company === selectedCompany;
    });
    });
    filteredExp = filteredExp.filter(e => e.companyName === selectedCompany);
    }
    setTransactions(filteredTx);
    setExpenses(filteredExp);
    }, [startDate, endDate, selectedCompany, products]);
    useLazyScreenDataSync(() => {
      void loadFilteredData();
    });
    const handleDownloadPDF = async () => {
    if (!bookRef.current) return;
    setIsExporting(true);
    try {
    const { exportElementToPdf } = await import('../utils/pdfExport');
    await exportElementToPdf(
    bookRef.current,
    `DayBook_Summary_${startDate}_to_${endDate}`,
    {
    scale: 2,
    backgroundColor: "#ffffff",
    }
    );
    } catch (err) {
    console.error(err);
    showError("Export failed", "Could not generate the Day Book PDF. Try again.");
    } finally {
    setIsExporting(false);
    }
    };
    const report = useMemo(() => {
    const pnl = computePeriodPnL(transactions, expenses, products);
    return {
    totalSales: pnl.grossSales,
    totalPurchases: pnl.purchases,
    totalExpenses: pnl.expenses + pnl.salaries,
    expenseLedgerOnly: pnl.expenses,
    totalSalaries: pnl.salaries,
    netRevenue: pnl.netRevenue,
    cogs: pnl.cogs,
    tradingProfit: pnl.tradingProfit,
    pureProfit: pnl.pureProfit,
    totalCollected: pnl.collected,
    totalGrossProfit: pnl.tradingProfit,
    netProfit: pnl.pureProfit,
    moneyIn: pnl.moneyIn,
    moneyOut: pnl.moneyOut,
    ordersCount: pnl.saleCount,
    returnsValue: pnl.customerReturns,
    purchaseReturnsValue: pnl.purchaseReturns,
    };
    }, [transactions, expenses, products]);
    const combinedEvents = useMemo(() => {
    const events = [
    ...transactions.map(t => ({ ...t, eventType: 'TRANSACTION' })),
    ...expenses.map(e => ({ ...e, date: new Date(e.date), eventType: 'EXPENSE', type: 'EXPENSE' as any, totalAmount: e.amount, paidAmount: e.amount, customerName: e.description, items: [] }))
    ];
    // Newest first (date desc, then id desc so same-second rows stay latest-on-top)
    const sorted = events.sort((a: any, b: any) => {
      const tb = new Date(b.date).getTime();
      const ta = new Date(a.date).getTime();
      if (tb !== ta) return tb - ta;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((ev: any) => {
    const typeStr = String(ev.type || "").toLowerCase();
    const entity = (ev.customerName || ev.companyName || ev.employeeName || "").toLowerCase();
    const notes = String(ev.notes || "").toLowerCase();
    return typeStr.includes(q) || entity.includes(q) || notes.includes(q);
    });
    }, [transactions, expenses, searchQuery]);
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    from,
    hasMore,
    loadMore,
  } = usePagination(combinedEvents);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreLock = useRef(false);

  useEffect(() => {
    loadMoreLock.current = false;
  }, [shown, total, pageSize]);

  const tryLoadMore = () => {
    if (!hasMore || loadMoreLock.current) return;
    loadMoreLock.current = true;
    loadMore();
  };

  const onActivityScroll = () => {
    const el = listScrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      tryLoadMore();
    }
  };

  const inputStyle = { colorScheme: darkMode ? 'dark' : 'light' };

  const openOnOwnerScreen = (
    event: { id?: number; eventType?: string; type?: string },
    action: "editId" | "deleteId"
  ) => {
    if (!event.id) {
      showError("Missing record", "This row has no id to open.");
      return;
    }
    const path = ownerPathForEvent(event);
    if (!path) {
      showError("Unsupported type", `Cannot open ${event.type || "this"} record from Day Book.`);
      return;
    }
    // Keep Day Book mounted underneath; open owner screen in overlay.
    openInPlace(path, { [action]: event.id });
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-col xl:flex-row gap-3 justify-end xl:items-center no-print">
        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-1">Dates</span>
            <div className={`flex items-center gap-1.5 p-1 rounded-lg border ${darkMode ? 'bg-gray-900/50 border-gray-800' : 'bg-white border-gray-200 shadow-sm'}`}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} className={`bg-transparent outline-none text-[11px] font-bold px-1.5 py-1 ${darkMode ? 'text-white' : 'text-gray-900'}`} />
              <div className="w-3 h-0.5 bg-gray-500/20" />
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} className={`bg-transparent outline-none text-[11px] font-bold px-1.5 py-1 ${darkMode ? 'text-white' : 'text-gray-900'}`} />
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-1">Brand</span>
            <button onClick={() => setShowCompanyModal(true)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${selectedCompany !== 'All' ? 'bg-blue-600 border-blue-600 text-white' : `${darkMode ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-gray-200 text-gray-600 shadow-sm'}`}`}>
              <Building2 size={14} /> {selectedCompany}
            </button>
          </div>
          
          <div className="flex gap-1.5">
            <button onClick={handleDownloadPDF} disabled={isExporting} className={`p-2 rounded-lg bg-indigo-600 text-white ${isExporting ? 'opacity-50' : ''}`}>
              {isExporting ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
            </button>
            <button onClick={() => { requestAnimationFrame(() => { requestAnimationFrame(() => window.print()); }); }} className={`p-2 rounded-lg bg-red-600 text-white shadow-lg hover:bg-red-700 transition-all`}>
              <Printer size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="print:hidden space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-2">
        <div className={`px-3 py-2.5 rounded-2xl border transition-all ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
          <div className="flex items-center gap-2 text-red-500 mb-1">
            <ShoppingCart size={14} />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Total Invoiced</span>
          </div>
          <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tighter`}>AFN {report.totalSales.toLocaleString()}</h3>
          <p className="text-[9px] text-gray-500 font-bold mt-0.5 uppercase tracking-tighter">{report.ordersCount} invoices · returns (AFN {report.returnsValue.toLocaleString()})</p>
        </div>

        <div className={`px-3 py-2.5 rounded-2xl border transition-all ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <TrendingUp size={14} />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Trading Profit</span>
          </div>
          <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tighter`}>AFN {report.tradingProfit.toLocaleString()}</h3>
          <p className="text-[9px] text-gray-500 font-bold mt-0.5 uppercase tracking-tighter">Net revenue minus COGS (FIFO)</p>
        </div>

        <div className={`px-3 py-2.5 rounded-2xl shadow-md transition-all ${report.pureProfit >= 0 ? 'bg-green-600 shadow-green-500/20' : 'bg-red-600 shadow-red-500/20'} text-white 2xl:col-span-1`}>
          <div className="flex items-center gap-2 mb-1 opacity-90">
            {report.pureProfit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Pure Profit</span>
          </div>
          <h3 className="text-sm font-black tracking-tighter">AFN {report.pureProfit.toLocaleString()}</h3>
          <p className="text-[9px] font-black mt-0.5 uppercase tracking-widest opacity-85">After expenses &amp; salaries</p>
        </div>

        <div className={`px-3 py-2.5 rounded-2xl border transition-all ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
          <div className="flex items-center gap-2 text-emerald-500 mb-1">
            <CreditCard size={14} />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Cash Collected</span>
          </div>
          <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tighter`}>AFN {report.totalCollected.toLocaleString()}</h3>
          <p className="text-[9px] text-gray-500 font-bold mt-0.5 uppercase tracking-tighter">Sale receipts + payments</p>
        </div>

        <div className={`px-3 py-2.5 rounded-2xl border transition-all ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <ShoppingBag size={14} />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Stock Bought</span>
          </div>
          <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tighter`}>AFN {report.totalPurchases.toLocaleString()}</h3>
          <p className="text-[9px] text-gray-500 font-bold mt-0.5 uppercase tracking-tighter">Purchase invoices</p>
        </div>

        <div className={`px-3 py-2.5 rounded-2xl border transition-all ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
          <div className="flex items-center gap-2 text-indigo-500 mb-1">
            <Wallet size={14} />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">Expenses + Salaries</span>
          </div>
          <h3 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tighter`}>AFN {report.totalExpenses.toLocaleString()}</h3>
          <p className="text-[9px] text-gray-500 font-bold mt-0.5 uppercase tracking-tighter">Exp AFN {report.expenseLedgerOnly.toLocaleString()} · Sal AFN {report.totalSalaries.toLocaleString()}</p>
        </div>
      </div>

      <div className={`rounded-2xl border overflow-hidden transition-all flex flex-col ${darkMode ? 'bg-[#1a1d23] border-gray-800 shadow-xl' : 'bg-white shadow-sm border-gray-100'}`}>
          <div className="px-4 py-2.5 border-b border-gray-800/10 flex items-center justify-between bg-gray-500/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-red-500 text-white rounded-xl shadow-md"><History size={16} /></div>
              <h4 className={`text-xs font-black uppercase tracking-[0.2em] ${darkMode ? 'text-white' : 'text-gray-900'}`}>Daily Activity List</h4>
            </div>
          </div>
          <div className="overflow-hidden flex-1">
            <div
              ref={listScrollRef}
              onScroll={onActivityScroll}
              className="max-h-[min(62vh,640px)] overflow-y-auto custom-scrollbar print:max-h-none print:overflow-visible"
            >
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className={`text-[10px] font-black uppercase tracking-[0.2em] ${darkMode ? 'bg-[#1a1d23] text-gray-500' : 'bg-white text-gray-400'} border-b border-gray-800/10`}>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Entity</th>
                    <th className="py-2.5 px-3 text-right">Value / Cash Cleared</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-800/40' : 'divide-gray-50'}`}>
                  {pageItems.map((event: any, idx) => {
                    const canManage = !!ownerPathForEvent(event) && !!event.id;
                    return (
                    <tr key={`${event.eventType}-${event.id ?? from + idx}`} className={`group transition-all ${darkMode ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'}`}>
                      <td className="py-2.5 px-4"><p className={`text-xs font-black tabular-nums ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{from + idx}</p></td>
                      <td className="py-2.5 px-3">
                        <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{new Date(event.date).toLocaleDateString()}</p>
                        <p className={`text-xs font-black ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${event.type === 'SALE' ? 'bg-green-500/10 text-green-500' : event.type === 'PURCHASE' ? 'bg-blue-500/10 text-blue-500' : event.type === 'EXPENSE' ? 'bg-indigo-500/10 text-indigo-500' : event.type === 'RETURN' || event.type === 'PURCHASE_RETURN' ? 'bg-red-500/10 text-red-500' : event.type === 'CAPITAL_INJECTION' ? 'bg-emerald-500/15 text-emerald-500' : event.type === 'PAYMENT' || event.type === 'SALARY' ? 'bg-amber-500/10 text-amber-500' : 'bg-gray-500/10 text-gray-500'}`}>
                          {event.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3"><p className={`text-sm font-black ${darkMode ? 'text-gray-300' : 'text-gray-700'} truncate max-w-[150px]`}>{event.customerName || event.companyName || event.employeeName || 'General Cash'}</p></td>
                      <td className="py-2.5 px-3 text-right">
                        <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {(event.totalAmount > 0 ? event.totalAmount : event.paidAmount).toLocaleString()}</p>
                        {event.totalAmount > 0 && <p className="text-[9px] font-bold uppercase tracking-tighter text-blue-500">Cash: AFN {event.paidAmount.toLocaleString()}</p>}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canManage}
                            title="Edit on its own screen"
                            onClick={() => openOnOwnerScreen(event, "editId")}
                            className={`p-1.5 rounded-lg transition-colors ${canManage ? "text-gray-400 hover:text-blue-500 hover:bg-blue-500/10" : "opacity-20 cursor-not-allowed"}`}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={!canManage}
                            title="Delete on its own screen"
                            onClick={() => openOnOwnerScreen(event, "deleteId")}
                            className={`p-1.5 rounded-lg transition-colors ${canManage ? "text-gray-400 hover:text-red-500 hover:bg-red-500/10" : "opacity-20 cursor-not-allowed"}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );})}
                  {total === 0 && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center opacity-30 italic text-sm font-black uppercase tracking-widest">No activities for the selected period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationBar
          darkMode={darkMode}
          total={total}
          shown={shown}
          hasMore={hasMore}
          onLoadMore={tryLoadMore}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        </div>
      </div>

      <PrintMountPortal>
        <SimpleBookReportPage
          ref={bookRef}
          companyName={bizSettings?.companyName || "Spectrum Pro"}
          logoSrc={bizSettings?.logo}
          reportTitle="Day book summary"
          periodLine={`${startDate} to ${endDate}${selectedCompany !== "All" ? ` · Filter: ${selectedCompany}` : ""}`}
        >
          <div style={book.sectionLabel}>Period totals</div>
          <table style={book.table}>
            <thead>
              <tr>
                <th style={book.th}>Metric</th>
                <th style={{ ...book.th, ...book.thRight }}>AFN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={book.td}>Total invoiced (sales)</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.totalSales.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Stock purchases</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.totalPurchases.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Expenses & salaries</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.totalExpenses.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Trading profit (net revenue − COGS)</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.tradingProfit.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ ...book.td, fontWeight: 700 }}>Pure profit (after expenses &amp; salaries)</td>
                <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>{report.pureProfit.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Cash collected (sales + customer payments)</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.totalCollected.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Cash in (incl. capital)</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.moneyIn.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Cash out</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.moneyOut.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={book.td}>Sales count</td>
                <td style={{ ...book.td, ...book.tdRight }}>{report.ordersCount}</td>
              </tr>
            </tbody>
          </table>

          <div style={book.sectionLabel}>Activity register (newest first)</div>
          <table style={book.table}>
            <thead>
              <tr>
                <th style={book.th}>Date</th>
                <th style={book.th}>Time</th>
                <th style={book.th}>Type</th>
                <th style={book.th}>Party / description</th>
                <th style={{ ...book.th, ...book.thRight }}>Amount</th>
                <th style={{ ...book.th, ...book.thRight }}>Cash</th>
              </tr>
            </thead>
            <tbody>
              {combinedEvents.map((event: any, idx: number) => (
                <tr key={idx}>
                  <td style={book.td}>{new Date(event.date).toLocaleDateString()}</td>
                  <td style={book.td}>
                    {new Date(event.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={book.td}>{event.type}</td>
                  <td style={book.td}>
                    {event.customerName || event.companyName || event.employeeName || "—"}
                  </td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {(event.totalAmount > 0 ? event.totalAmount : event.paidAmount).toLocaleString()}
                  </td>
                  <td style={{ ...book.td, ...book.tdRight }}>{Number(event.paidAmount || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SimpleBookReportPage>
      </PrintMountPortal>

      <AnimatePresence>
        {showCompanyModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center px-4 no-print">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCompanyModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className={`relative w-full max-w-md h-[550px] flex flex-col rounded-[48px] overflow-hidden shadow-2xl ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white'}`}>
              <div className="p-8 border-b border-gray-800/10 flex justify-between items-center"><h3 className={`font-black text-xs uppercase tracking-[0.3em] ${darkMode ? 'text-white' : 'text-gray-900'}`}>Filter by Brand</h3><button onClick={() => setShowCompanyModal(false)} className="p-2 text-gray-500 hover:text-red-500 transition-colors"><X size={24} /></button></div>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 custom-scrollbar">
                <button onClick={() => { setSelectedCompany('All'); setShowCompanyModal(false); }} className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${selectedCompany === 'All' ? 'bg-blue-600/10 border-blue-600/50 ring-2 ring-blue-600/10' : `${darkMode ? 'bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-400' : 'bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-600'}`}`}><span className="text-sm font-black uppercase">Consolidated (All Brands)</span>{selectedCompany === 'All' && <Check size={18} className="text-blue-500" strokeWidth={3} />}</button>
                {companies.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCompany(c.name); setShowCompanyModal(false); }} className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${selectedCompany === c.name ? 'bg-blue-600/10 border-blue-600/50 ring-2 ring-blue-600/10' : `${darkMode ? 'bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-400' : 'bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-600'}`}`}><div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-black ${selectedCompany === c.name ? 'bg-blue-600 text-white' : (darkMode ? 'bg-gray-800 text-gray-500' : 'bg-white shadow-sm text-gray-400')}`}><Building2 size={20} /></div><p className="text-sm font-black uppercase tracking-tight">{c.name}</p></div>{selectedCompany === c.name && <Check size={18} className="text-blue-600" strokeWidth={3} />}</button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
