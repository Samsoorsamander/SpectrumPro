import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, Edit2, Trash2, MapPin, Tag, AlertTriangle, ShieldAlert, RefreshCw, Search } from 'lucide-react';
import { db } from '../db';
import { Company } from '../types';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { PaginationBar } from '../components/ui/PaginationBar';
import { CompanyFormModal } from '../components/companies/CompanyFormModal';
import { useOpenNewFromQuery } from '../hooks/useOpenNewFromQuery';
import { useDbPagination, DbWhere } from '../hooks/useDbPagination';
import { computeCompanyBalance } from '../utils/ledgerBalances';
import { notifyDirectoryChanged } from '../utils/dataSync';

export default function Companies({ darkMode }: { darkMode: boolean }) {
  const { showSuccess, showError } = useFeedback();
    const navigate = useNavigate();
    const [listVersion, setListVersion] = useState(0);
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [listSearch, setListSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editCompany, setEditCompany] = useState<Company | null>(null);
    // Deletion States
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // UI-based Warning State for unauthorized deletes
    const [warningMessage, setWarningMessage] = useState<string | null>(null);
    const loadCompanies = () => {
    setListVersion((v) => v + 1);
    };
    const getCompanyBalance = async (compId: number, openingBal: number) => {
    const history = await db.transactionLogs.query({
      where: [
        { col: 'isDeleted', op: '=', val: 0 },
        { col: 'companyId', val: compId },
        {
          col: 'type',
          op: 'IN',
          val: ['PURCHASE', 'PAYMENT', 'PURCHASE_RETURN'],
        },
      ],
      columns: ['type', 'totalAmount', 'paidAmount', 'isDeleted'],
    });
    return computeCompanyBalance(openingBal, history as any);
    };
    const confirmDelete = (comp: Company) => {
    setCompanyToDelete(comp);
    setShowDeleteModal(true);
    };
    const handleActualDelete = async () => {
    if (!companyToDelete || !companyToDelete.id || isDeleting) return;
    setIsDeleting(true);
    try {
    const balance = await getCompanyBalance(companyToDelete.id, companyToDelete.openingBalance);
    // Requirement: Only delete when there is no money (balance is zero)
    const roundedBalance = Math.round(balance * 100) / 100;
    const isZeroBalance = Math.abs(roundedBalance) < 0.1;
    if (!isZeroBalance) {
    setShowDeleteModal(false);
    setWarningMessage(`UNAUTHORIZED ARCHIVAL: Supplier "${companyToDelete.name}" has an outstanding ledger balance of AFN ${roundedBalance.toLocaleString()}. Accounts must be settled to zero (0) before archival is permitted.`);
    setIsDeleting(false);
    return;
    }
    // Requirement: Perform soft delete
    await db.companies.update(companyToDelete.id, { isDeleted: true });
    notifyDirectoryChanged();
    // Refresh local state
    await loadCompanies();
    setShowDeleteModal(false);
    setCompanyToDelete(null);
    showSuccess("Archived", "Supplier has been archived.");
    } catch (err) {
    console.error("Archival failure:", err);
    showError("Archive failed", "Could not archive the supplier record.");
    } finally {
    setIsDeleting(false);
    }
    };
    const handleOpenEdit = (company: Company) => {
    setEditCompany(company);
    setShowModal(true);
    };
    const openAdd = () => {
    setEditCompany(null);
    setShowModal(true);
    };
    useOpenNewFromQuery(openAdd);
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
  } = useDbPagination<Company>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [{ col: 'isDeleted', op: '=', val: 0 }];
      const term = (listSearch || searchQuery).trim();
      const orWhere: DbWhere = term
        ? [
            { col: 'name', op: 'LIKE', val: `%${term}%` },
            { col: 'contactPerson', op: 'LIKE', val: `%${term}%` },
            { col: 'phone', op: 'LIKE', val: `%${term}%` },
            { col: 'originCountry', op: 'LIKE', val: `%${term}%` },
          ]
        : [];
      const [rows, count] = await Promise.all([
        db.companies.query({
          where,
          orWhere,
          orderBy: 'name',
          orderDir: 'ASC',
          limit: size,
          offset,
          columns: [
            'id',
            'name',
            'category',
            'originCountry',
            'priceCategory',
            'openingBalance',
            'contactPerson',
            'phone',
            'isDeleted',
          ],
        }),
        db.companies.countWhere(where, orWhere),
      ]);
      return { rows: rows as Company[], total: count };
    },
    [listSearch, searchQuery, listVersion],
    undefined,
    `companies:${listSearch}:${searchQuery}:${listVersion}`
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm mr-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search supplier, contact, phone…"
            className={`w-full pl-8 pr-3 py-2 rounded-lg text-xs font-bold outline-none border-none ring-1 ${
              darkMode
                ? 'bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600'
                : 'bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setListSearch('');
            setSearchQuery('');
            loadCompanies();
          }}
          className={`p-2 rounded-lg shrink-0 ${darkMode ? 'bg-gray-800 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-400 hover:text-red-500'}`}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shrink-0"
        >
          <Plus size={14} /> New Supplier
        </button>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
          {pageItems.map((company) => (
            <div key={company.id} className={`p-4 rounded-2xl border hover:-translate-y-0.5 transition-transform ${darkMode ? 'bg-[#14171c] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 text-blue-500 border border-blue-500/10"><Building2 size={20} /></div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => handleOpenEdit(company)} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"><Edit2 size={14} /></button>
                  <button type="button" onClick={() => confirmDelete(company)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
              <h3 className={`text-sm font-black uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>{company.name}</h3>
              <p className="text-[9px] font-black uppercase text-blue-500 mt-0.5 mb-2 tracking-widest">{company.category}</p>
              <div className="space-y-0.5 mb-3">
                 {company.originCountry && <p className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1.5"><MapPin size={10} /> {company.originCountry}</p>}
                 {company.priceCategory && <p className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1.5"><Tag size={10} /> Price Type: {company.priceCategory}</p>}
              </div>
              <div className="pt-3 border-t border-gray-800/10"><button onClick={() => navigate(`/ledger/company/${company.id}`)} className="w-full py-2 rounded-xl bg-red-500/10 text-red-500 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Account Statement</button></div>
            </div>
          ))}
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

      <CompanyFormModal
        darkMode={darkMode}
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditCompany(null);
        }}
        editCompany={editCompany}
        onSaved={loadCompanies}
      />

      {/* CUSTOM CONFIRMATION MODAL FOR DELETION */}
      <AnimatePresence>
        {showDeleteModal && companyToDelete && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isDeleting && setShowDeleteModal(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={`relative w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white'}`}>
               <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-inner"><AlertTriangle size={24} /></div>
               <h3 className={`text-base font-black mb-1 uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>Archive Supplier?</h3>
               <p className="text-gray-500 font-bold uppercase text-[9px] tracking-widest mb-5 leading-relaxed">Delete "{companyToDelete.name}"? Only allowed if account is settled (zero balance).</p>
               <div className="flex gap-3">
                 <button onClick={() => setShowDeleteModal(false)} disabled={isDeleting} className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-gray-500 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>Cancel</button>
                 <button onClick={handleActualDelete} disabled={isDeleting} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center justify-center gap-2">
                    {isDeleting ? <RefreshCw className="animate-spin" size={14} /> : 'Archive Now'}
                 </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SECURITY WARNING MODAL (FOR NON-ZERO BALANCE) */}
      <AnimatePresence>
        {warningMessage && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWarningMessage(null)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className={`relative w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white'}`}>
              <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-inner"><ShieldAlert size={28} /></div>
              <h3 className={`text-base font-black uppercase tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Security Alert</h3>
              <p className="text-gray-500 font-bold text-[9px] leading-relaxed uppercase tracking-widest mb-5">{warningMessage}</p>
              <button 
                onClick={() => setWarningMessage(null)} 
                className="w-full py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg"
              >
                Acknowledge & Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}