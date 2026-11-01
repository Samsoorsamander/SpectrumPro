import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Plus, X, Trash2, Edit2, Filter, Calendar, RefreshCw, DollarSign, Search } from 'lucide-react';
import { db } from '../db';
import { Expense } from '../types';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { LandscapeModal } from '../components/ui/LandscapeModal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { useOpenNewFromQuery } from '../hooks/useOpenNewFromQuery';
import { useDbPagination, DbWhere } from '../hooks/useDbPagination';
import { notifyLedgerChanged, useLazyScreenDataSync } from '../utils/dataSync';
import { clearFormDraft, readFormDraft, writeFormDraft } from '../utils/formDraft';
import { SaveDraftButton } from '../components/ui/SaveDraftButton';

export default function Expenses({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showError, showSuccess } = useFeedback();
    const [listVersion, setListVersion] = useState(0);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [expenseToDelete, setExpenseToDelete] = useState<number | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [listSearch, setListSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [formData, setFormData] = useState<Partial<Expense>>({ description: '', amount: 0, category: 'General', date: new Date(), paidTo: '' });
    const expenseCategories = ['All', 'General', 'Utilities', 'Maintenance', 'Supplies'];

    const buildExpenseFilters = useCallback(() => {
      const where: DbWhere = [];
      if (filterCategory !== 'All') {
        where.push({ col: 'category', op: '=', val: filterCategory });
      }
      if (startDate) {
        where.push({ col: 'date', op: '>=', val: startDate });
      }
      if (endDate) {
        where.push({ col: 'date', op: '<=', val: `${endDate}T23:59:59.999Z` });
      }
      const term = (listSearch || searchQuery).trim();
      const orWhere: DbWhere = term
        ? [
            { col: 'description', op: 'LIKE', val: `%${term}%` },
            { col: 'paidTo', op: 'LIKE', val: `%${term}%` },
            { col: 'category', op: 'LIKE', val: `%${term}%` },
          ]
        : [];
      return { where, orWhere };
    }, [filterCategory, startDate, endDate, listSearch, searchQuery]);
    useEffect(() => {
    const state = location.state as { editId?: number; deleteId?: number } | null;
    if (!state?.editId && !state?.deleteId) return;
    navigate(location.pathname, { replace: true, state: null });
    (async () => {
    if (state.editId) {
    const exp = await db.expenses.get(state.editId);
    if (exp) {
    setEditingId(exp.id!);
    setFormData({ ...exp, date: new Date(exp.date) });
    setShowModal(true);
    } else {
    showError("Not found", "Expense record was not found.");
    }
    }
    if (state.deleteId) {
    setExpenseToDelete(state.deleteId);
    setShowDeleteConfirm(true);
    }
    })();
    }, [location.state]);
    const loadData = useCallback(() => setListVersion((v) => v + 1), []);
    useLazyScreenDataSync(loadData);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        const { where, orWhere } = buildExpenseFilters();
        const rows = await db.expenses.query({
          where,
          orWhere,
          columns: ['amount'],
        });
        if (cancelled) return;
        const sum = (rows as Pick<Expense, 'amount'>[]).reduce(
          (acc, e) => acc + (Number(e.amount) || 0),
          0
        );
        setFilteredTotal(sum);
      })();
      return () => {
        cancelled = true;
      };
    }, [buildExpenseFilters, listVersion]);
    const handleOpenEdit = (exp: Expense) => {
    setEditingId(exp.id!);
    setFormData({ ...exp, date: new Date(exp.date) });
    setShowModal(true);
    };
    const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
    const payload = {
    description: formData.description ?? "",
    amount: Number(formData.amount) || 0,
    category: formData.category ?? "General",
    date: formData.date ? new Date(formData.date) : new Date(),
    paidTo: formData.paidTo ?? "",
    companyId: formData.companyId ?? null,
    companyName: formData.companyName ?? "",
    };
    if (editingId) {
    await db.expenses.update(editingId, payload);
    } else {
    await db.expenses.add(payload as Expense);
    }
    setShowModal(false); setEditingId(null); loadData();
    clearFormDraft('expense');
    notifyLedgerChanged();
    } catch (err: any) {
    console.error("Expense save error:", err);
    showError("Could not save expense", err?.message || String(err));
    }
    };
    const handleDelete = async () => {
    if (expenseToDelete !== null) {
    await db.expenses.delete(expenseToDelete);
    setShowDeleteConfirm(false); setExpenseToDelete(null); loadData();
    notifyLedgerChanged();
    }
    };
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
  } = useDbPagination<Expense>(
    async ({ pageSize: size, offset }) => {
      const { where, orWhere } = buildExpenseFilters();
      const [rows, count] = await Promise.all([
        db.expenses.query({
          where,
          orWhere,
          orderBy: 'date',
          orderDir: 'DESC',
          limit: size,
          offset,
          columns: [
            'id',
            'description',
            'amount',
            'category',
            'date',
            'paidTo',
            'companyId',
            'companyName',
          ],
        }),
        db.expenses.countWhere(where, orWhere),
      ]);
      return { rows: rows as Expense[], total: count };
    },
    [filterCategory, startDate, endDate, listSearch, searchQuery, listVersion],
    undefined,
    `expenses:${filterCategory}:${startDate}:${endDate}:${listSearch}:${searchQuery}:${listVersion}`
  );

  const inputStyle = { colorScheme: darkMode ? 'dark' : 'light' };

  const openAdd = () => {
    setEditingId(null);
    const draft = readFormDraft<Partial<Expense> & { date?: string }>('expense');
    const { date: draftDate, ...rest } = draft ?? {};
    setFormData({
      description: '',
      amount: 0,
      category: 'General',
      paidTo: '',
      ...rest,
      date: draftDate ? new Date(draftDate) : new Date(),
    });
    setShowModal(true);
  };

  useOpenNewFromQuery(openAdd);

  const inputCls = `w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50 ring-gray-200'}`;

  return (
    <div className="space-y-3 pb-6 w-full h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-end gap-3 px-1 shrink-0">
        <div className="relative flex-1 min-w-[180px] max-w-sm mr-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search description or recipient…"
            className={`w-full pl-8 pr-3 py-2 rounded-lg text-xs font-bold outline-none border-none ring-1 ${
              darkMode
                ? 'bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600'
                : 'bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400'
            }`}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={`border-none rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none ${darkMode ? 'bg-gray-900 text-white ring-1 ring-gray-800' : 'bg-gray-50 text-gray-900 ring-1 ring-gray-200'}`}
          >
            {expenseCategories.map((cat) => (
              <option key={cat} value={cat}>{cat === 'All' ? 'All Groups' : cat}</option>
            ))}
          </select>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} className={`px-2 py-2 rounded-lg text-[10px] font-bold outline-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50 ring-gray-200'}`} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} className={`px-2 py-2 rounded-lg text-[10px] font-bold outline-none ring-1 ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50 ring-gray-200'}`} />
          <button onClick={() => { setListSearch(''); setSearchQuery(''); setFilterCategory('All'); setStartDate(''); setEndDate(''); loadData(); }} className={`p-2 rounded-lg ${darkMode ? 'bg-gray-800 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-400 hover:text-red-500'}`}><RefreshCw size={14} /></button>
          <div className={`px-3 py-1.5 rounded-lg text-xs font-black ${darkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`} title="Sum of all rows matching current filters">AFN {filteredTotal.toLocaleString()}</div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"><Plus size={14} /> New Spending</button>
        </div>
      </div>

      <div className={`rounded-2xl border overflow-hidden flex-1 min-h-0 flex flex-col ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white shadow-sm border-gray-100'}`}>
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'bg-[#1a1d23] text-gray-500' : 'bg-white text-gray-400'} border-b border-gray-800/10`}>
                <th className="py-2 px-3">Details</th>
                <th className="py-2 px-3">Recipient</th>
                <th className="py-2 px-3">Group</th>
                <th className="py-2 px-3 text-right">Value</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-gray-800/40' : 'divide-gray-50'}`}>
              {pageItems.map(exp => (
                <tr key={exp.id} className="group hover:bg-gray-500/5 transition-all">
                  <td className="py-2 px-3">
                    <p className={`text-xs font-black uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>{exp.description}</p>
                    <p className="text-[9px] font-bold text-gray-500">{new Date(exp.date).toLocaleDateString()}</p>
                  </td>
                  <td className="py-2 px-3"><p className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{exp.paidTo || '-'}</p></td>
                  <td className="py-2 px-3"><span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-gray-500/10 text-gray-500">{exp.category}</span></td>
                  <td className="py-2 px-3 text-right"><p className="text-xs font-black text-red-500">AFN {exp.amount.toLocaleString()}</p></td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleOpenEdit(exp)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg"><Edit2 size={14} /></button>
                      <button onClick={() => exp.id && (setExpenseToDelete(exp.id), setShowDeleteConfirm(true))} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))},
              {total === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center opacity-30 italic font-black uppercase tracking-widest text-xs">
                    <div className="flex flex-col items-center gap-3"><Filter size={32} /><p>No expenditure records found</p></div>
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
            title={editingId ? 'Edit Protocol' : 'New Spending'}
            icon={<Wallet size={16} />}
            footer={
              <>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-[10px] font-black uppercase text-gray-500">Cancel</button>
                {!editingId && (
                  <SaveDraftButton
                    darkMode={darkMode}
                    onClick={() => {
                      writeFormDraft('expense', formData);
                      showSuccess('Draft saved', 'This expense form will reopen with these values.');
                    }}
                  />
                )}
                <button type="submit" form="expense-form" className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">{editingId ? 'Update Record' : 'Commit Registry'}</button>
              </>
            }
          >
            <form id="expense-form" onSubmit={handleSave} className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2 space-y-1"><label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Description / Purpose</label><input required type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className={inputCls} /></div>
              <div className="col-span-2 space-y-1"><label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Recipient</label><input type="text" value={formData.paidTo} onChange={e => setFormData({...formData, paidTo: e.target.value})} className={inputCls} placeholder="Who performed this expense?" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Amount (AFN)</label><input required type="number" value={formData.amount ?? ''} onChange={e => setFormData({...formData, amount: e.target.value === '' ? 0 : Number(e.target.value)})} className={inputCls} /></div>
              <div className="space-y-1"><label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Date</label><input required type="date" value={formData.date ? new Date(formData.date).toISOString().split('T')[0] : ''} onChange={e => setFormData({...formData, date: new Date(e.target.value)})} className={inputCls} /></div>
              <div className="col-span-2 space-y-1"><label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Spending Group</label><select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className={inputCls}><option value="General">General</option><option value="Utilities">Utilities / Rent</option><option value="Maintenance">Maintenance</option><option value="Supplies">Supplies</option></select></div>
            </form>
          </LandscapeModal>
        )},

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={`relative w-full max-w-sm p-6 rounded-2xl text-center ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white shadow-2xl'}`}><h3 className={`text-base font-black mb-5 uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>Purge Entry?</h3><div className="flex gap-3"><button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-gray-500 bg-gray-100">Cancel</button><button onClick={handleDelete} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">Delete</button></div></motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
