
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw, FileText, Printer } from 'lucide-react';
import { db } from '../db';
import { Transaction, Customer, Company, Employee, SystemSettings } from '../types';
import { netCustomerSaleInvoiceAmount } from '../utils/saleAmounts';
import { exportElementToPdf } from '../utils/pdfExport';
import { useFeedback } from '../contexts/FeedbackContext';
import { SimpleBookReportPage, book } from '../components/SimpleBookReport';
import PrintMountPortal from '../components/PrintMountPortal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { usePagination } from '../hooks/usePagination';
import { useLazyScreenDataSync } from '../utils/dataSync';

interface LedgerEntry {
  id: string | number;
  date: Date;
  type: string;
  notes: string;
  debit: number;  
  credit: number; 
  runningBalance: number;
}

export default function Ledger({ darkMode }: { darkMode: boolean }) {
  const { showError } = useFeedback();
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const [entity, setEntity] = useState<Customer | Company | Employee | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const simplePdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => { 
    loadLedgerData();
    loadSettings();
  }, [type, id]);

  const loadSettings = async () => {
    const s = await db.settings.toArray();
    if (s.length > 0) setBizSettings(s[0]);
  };

  const loadLedgerData = async () => {
    if (!id || !type) return;
    setLoading(true);
    try {
      let txs: Transaction[] = [];
      if (type === 'customer') {
        const c = await db.customers.get(Number(id));
        setEntity(c || null);
        txs = await db.transactionLogs.where('customerId').equals(Number(id)).toArray();
      } else if (type === 'company') {
        const comp = await db.companies.get(Number(id));
        setEntity(comp || null);
        txs = await db.transactionLogs.where('companyId').equals(Number(id)).toArray();
      } else if (type === 'employee') {
        const emp = await db.employees.get(Number(id));
        setEntity(emp || null);
        txs = await db.transactionLogs.where('employeeId').equals(Number(id)).toArray();
      }
      setHistory(txs.filter(t => !t.isDeleted));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useLazyScreenDataSync(() => {
    void loadLedgerData();
  });

  const handleDownloadPDF = async () => {
    if (!simplePdfRef.current || !entity) return;
    setIsExporting(true);
    try {
      await exportElementToPdf(
        simplePdfRef.current,
        `${entity.name}_Statement_${startDate || "full"}`,
        { scale: 1.5, backgroundColor: "#ffffff" }
      );
    } catch (err) {
      console.error(err);
      showError("PDF export failed", "Could not generate the ledger PDF. Try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const ledgerTimeline = useMemo(() => {
    if (!entity) return [];
    let entries: LedgerEntry[] = [];
    const openingBal = (entity as any).openingBalance || 0;
    
    // Initial Entry
    entries.push({ 
      id: 'opening', 
      date: new Date(2000, 0, 1), 
      type: 'OPENING', 
      notes: 'Initial Registry Balance', 
      debit: type === 'customer' ? openingBal : 0, 
      credit: type === 'customer' ? 0 : openingBal, 
      runningBalance: 0 
    });

    if (type === 'customer') {
      history.forEach(tx => {
        if (tx.type === 'SALE') {
          const netInv = netCustomerSaleInvoiceAmount(tx);
          const disc = Number(tx.discount) || 0;
          const note =
            disc > 0
              ? `Sale #DOC-${tx.id} (net after ${disc.toLocaleString()} AFN discount)`
              : `Sale #DOC-${tx.id}`;
          entries.push({ id: `${tx.id}-sl`, date: new Date(tx.date), type: 'INVOICE', notes: note, debit: netInv, credit: 0, runningBalance: 0 });
          if (tx.paidAmount > 0) entries.push({ id: `${tx.id}-py`, date: new Date(new Date(tx.date).getTime() + 1000), type: 'PAYMENT', notes: `Cash Collected`, debit: 0, credit: tx.paidAmount, runningBalance: 0 });
        } else if (tx.type === 'PAYMENT') {
          entries.push({ id: tx.id!, date: new Date(tx.date), type: 'RECEIPT', notes: tx.notes || 'Ledger Credit', debit: 0, credit: tx.paidAmount, runningBalance: 0 });
        } else if (tx.type === 'RETURN') {
          entries.push({ id: `${tx.id}-ret`, date: new Date(tx.date), type: 'RETURN', notes: `Stock Return #DOC-${tx.id}`, debit: 0, credit: tx.totalAmount, runningBalance: 0 });
        }
      });
    } else if (type === 'company') {
      history.forEach(tx => {
        if (tx.type === 'PURCHASE') {
          entries.push({ id: `${tx.id}-pr`, date: new Date(tx.date), type: 'BILL', notes: `Purchase #PUR-${tx.id}`, debit: 0, credit: tx.totalAmount, runningBalance: 0 });
          if (tx.paidAmount > 0) entries.push({ id: `${tx.id}-py`, date: new Date(new Date(tx.date).getTime() + 1000), type: 'PAYMENT', notes: `Cash Paid Out`, debit: tx.paidAmount, credit: 0, runningBalance: 0 });
        } else if (tx.type === 'PAYMENT') {
          entries.push({ id: tx.id!, date: new Date(tx.date), type: 'DEBIT', notes: tx.notes || 'Settlement', debit: tx.paidAmount, credit: 0, runningBalance: 0 });
        } else if (tx.type === 'PURCHASE_RETURN') {
          entries.push({ id: `${tx.id}-pret`, date: new Date(tx.date), type: 'RETURN', notes: `Purchase Reject #PUR-${tx.id}`, debit: tx.totalAmount, credit: 0, runningBalance: 0 });
        }
      });
    } else if (type === 'employee') {
      const emp = entity as Employee;
      const joinDate = new Date(emp.joiningDate);
      const now = new Date();
      let currentAccrualDate = new Date(joinDate.getFullYear(), joinDate.getMonth(), 1, 0, 0, 0);
      const todayFirst = new Date(now.getFullYear(), now.getMonth(), 1, 23, 59, 59);
      
      while (currentAccrualDate <= todayFirst) {
        entries.push({
          id: `accrual-${currentAccrualDate.getTime()}`,
          date: new Date(currentAccrualDate),
          type: 'EARNED',
          notes: `Monthly Salary: ${currentAccrualDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          debit: 0,
          credit: emp.salary,
          runningBalance: 0
        });
        currentAccrualDate.setMonth(currentAccrualDate.getMonth() + 1);
      }
      
      history.forEach(tx => {
        if (tx.type === 'SALARY') {
          entries.push({
            id: tx.id!,
            date: new Date(tx.date),
            type: 'PAYMENT',
            notes: tx.notes || 'Salary Disbursement',
            debit: tx.paidAmount,
            credit: 0,
            runningBalance: 0
          });
        }
      });
    }

    // Chronological Calculation
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    let running = 0;
    const allComputed = entries.map(e => {
      if (type === 'customer') {
        running += (e.debit - e.credit);
      } else {
        // Companies and Employees are creditors
        running += (e.credit - e.debit);
      }
      return { ...e, runningBalance: running };
    });

    // Temporal Filtering
    let finalEntries = allComputed;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    if (start) {
      start.setHours(0, 0, 0, 0);
      const beforeStart = allComputed.filter(e => e.date < start);
      const bfBalance = beforeStart.length > 0 ? beforeStart[beforeStart.length - 1].runningBalance : 0;
      
      finalEntries = allComputed.filter(e => e.date >= start);
      finalEntries.unshift({
        id: 'bf',
        date: start,
        type: 'BAL B/F',
        notes: 'Balance Brought Forward',
        debit: 0,
        credit: 0,
        runningBalance: bfBalance
      });
    }

    if (end) {
      end.setHours(23, 59, 59, 999);
      finalEntries = finalEntries.filter(e => e.date <= end);
    }

    return finalEntries.reverse();
  }, [entity, history, type, startDate, endDate]);

  const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
  } = usePagination(ledgerTimeline);

  if (loading || !entity) return (
    <div className="h-full flex items-center justify-center opacity-40 py-40">
       <RefreshCw size={48} className="animate-spin" />
    </div>
  );

  const inputStyle = { colorScheme: darkMode ? 'dark' : 'light' };

  return (
    <div className="space-y-6 w-full pb-6 h-full min-h-0 flex flex-col">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 no-print">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate(-1)} className={`p-4 rounded-2xl border transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900 shadow-sm'}`}><ArrowLeft /></button>
          <div>
            <h2 className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-gray-900'} uppercase tracking-tight`}>{entity.name}</h2>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Transaction Ledger Registry</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
             <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2">Temporal Frame</span>
             <div className={`flex items-center gap-2 p-1.5 rounded-2xl border ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-200 shadow-sm'}`}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} className={`bg-transparent outline-none text-[10px] font-black uppercase px-2 py-1 ${darkMode ? 'text-white' : 'text-gray-900'}`} />
                <div className="w-4 h-0.5 bg-gray-500/20" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} className={`bg-transparent outline-none text-[10px] font-black uppercase px-2 py-1 ${darkMode ? 'text-white' : 'text-gray-900'}`} />
             </div>
          </div>
          
          <div className="flex items-center gap-2 mt-auto">
             <button onClick={() => { setStartDate(''); setEndDate(''); }} className={`p-4 rounded-2xl border transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-gray-200 text-gray-500 hover:text-red-500 shadow-sm'}`}><RefreshCw size={18} /></button>
             <button onClick={handleDownloadPDF} disabled={isExporting} className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-red-700 transition-all flex items-center gap-2">
                {isExporting ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                {isExporting ? 'Generating...' : 'Audit Export'}
             </button>
             <button type="button" onClick={() => { requestAnimationFrame(() => { requestAnimationFrame(() => window.print()); }); }} className={`p-4 rounded-2xl border transition-all ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900 shadow-sm'}`} title="Print">
                <Printer size={18} />
             </button>
          </div>
        </div>
      </div>

      <div className={`print:hidden rounded-[48px] border overflow-hidden flex-1 relative flex flex-col ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-100 shadow-2xl'}`}>
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`${darkMode ? 'bg-[#1a1d23]' : 'bg-white'} border-b border-gray-800/10 text-[10px] font-black uppercase text-gray-500 sticky top-0 bg-inherit z-10`}>
                <th className="py-6 px-10">Timestamp</th>
                <th className="py-6 px-4">Action</th>
                <th className="py-6 px-4">Registry Notes</th>
                <th className="py-6 px-4 text-right">Debit (+)</th>
                <th className="py-6 px-4 text-right">Credit (-)</th>
                <th className="py-6 px-10 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-gray-800/30' : 'divide-gray-50'}`}>
              {pageItems.map(e => (
                <tr key={e.id} className={`group hover:bg-gray-500/5 transition-all text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                  <td className="py-6 px-10">
                    <p className="font-black uppercase">{e.type === 'OPENING' || e.type === 'BAL B/F' ? '-' : e.date.toLocaleDateString()}</p>
                    <p className="text-[9px] font-bold text-gray-500 uppercase">{e.type === 'OPENING' || e.type === 'BAL B/F' ? '' : e.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                  <td className="py-6 px-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${e.type === 'INVOICE' || e.type === 'BILL' || e.type === 'EARNED' ? 'bg-indigo-500/10 text-indigo-500' : e.type === 'PAYMENT' || e.type === 'RECEIPT' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>{e.type}</span>
                  </td>
                  <td className="py-6 px-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tight truncate max-w-xs">{e.notes}</p>
                  </td>
                  <td className="py-6 px-4 text-right text-red-500 font-black">
                    {e.debit > 0 ? `AFN ${e.debit.toLocaleString()}` : '-'}
                  </td>
                  <td className="py-6 px-4 text-right text-green-500 font-black">
                    {e.credit > 0 ? `AFN ${e.credit.toLocaleString()}` : '-'}
                  </td>
                  <td className={`py-6 px-10 text-right font-black ${darkMode ? 'bg-transparent' : 'bg-transparent'}`}>
                    <p className={`text-sm ${e.runningBalance > 0 ? 'text-red-500' : e.runningBalance < 0 ? 'text-green-500' : 'text-gray-500'}`}>AFN {e.runningBalance.toLocaleString()}</p>
                  </td>
                </tr>
              ))}
              {ledgerTimeline.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-40 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <FileText size={64} />
                      <p className="font-black uppercase tracking-[0.4em] text-xs">No matching entries</p>
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

      <PrintMountPortal>
        <SimpleBookReportPage
          ref={simplePdfRef}
          companyName={bizSettings?.companyName || "Business"}
          logoSrc={bizSettings?.logo}
          reportTitle="Account ledger statement"
          periodLine={`Account: ${entity.name} · Ref #${id} · Period ${startDate || "—"} to ${endDate || "—"}`}
        >
          <p style={{ ...book.tag, marginBottom: "8px", fontSize: "8px", color: "#4b5563" }}>
            Rows in chronological order (oldest first). Amounts in AFN.
          </p>
          <table style={book.table}>
            <thead>
              <tr>
                <th style={book.th}>Date</th>
                <th style={book.th}>Type</th>
                <th style={book.th}>Details</th>
                <th style={{ ...book.th, ...book.thRight }}>Debit</th>
                <th style={{ ...book.th, ...book.thRight }}>Credit</th>
                <th style={{ ...book.th, ...book.thRight }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerTimeline
                .slice()
                .reverse()
                .map((e, i) => (
                  <tr key={i}>
                    <td style={book.td}>
                      {e.type === "OPENING" || e.type === "BAL B/F"
                        ? "—"
                        : e.date.toLocaleDateString()}
                    </td>
                    <td style={book.td}>{e.type}</td>
                    <td style={book.td}>{e.notes}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {e.debit > 0 ? e.debit.toLocaleString() : "—"}
                    </td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {e.credit > 0 ? e.credit.toLocaleString() : "—"}
                    </td>
                    <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                      {e.runningBalance.toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div style={book.sectionLabel}>Closing balance</div>
          <table style={{ ...book.table, marginBottom: 0 }}>
            <tbody>
              <tr>
                <td style={{ ...book.td, fontWeight: 700 }}>Balance carried forward</td>
                <td style={{ ...book.td, ...book.tdRight, fontWeight: 700, width: "28%" }}>
                  AFN {ledgerTimeline[0]?.runningBalance.toLocaleString() || "0"}
                </td>
              </tr>
            </tbody>
          </table>
        </SimpleBookReportPage>
      </PrintMountPortal>
    </div>
  );
}
