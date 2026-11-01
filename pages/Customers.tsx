import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, CreditCard, FileText,
  Edit2, Trash2, AlertTriangle, Phone, MapPin,
  ChevronDown, RefreshCw, SortAsc, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../db';
import { Customer } from '../types';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { LandscapeModal } from '../components/ui/LandscapeModal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { useOpenNewFromQuery } from '../hooks/useOpenNewFromQuery';
import { useDbPagination, DbWhere } from '../hooks/useDbPagination';
import { notifyDirectoryChanged } from '../utils/dataSync';
import { clearFormDraft, readFormDraft, writeFormDraft } from '../utils/formDraft';
import { SaveDraftButton } from '../components/ui/SaveDraftButton';

type SortOption = 'name-az' | 'name-za' | 'date-newest' | 'date-oldest';

export default function Customers({ darkMode }: { darkMode: boolean }) {
  const { showSuccess, showError } = useFeedback();
  const navigate = useNavigate();
  const [listVersion, setListVersion] = useState(0);
  const { query: globalQuery, setQuery: setGlobalQuery } = useGlobalSearch();
  const [listSearch, setListSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name-az');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    address: '',
    openingBalance: 0,
  });

  const loadCustomers = () => setListVersion((v) => v + 1);

  const handleOpenAdd = () => {
    setEditingId(null);
    const draft = readFormDraft<Partial<Customer>>('customer');
    setFormData({
      name: '',
      phone: '',
      address: '',
      openingBalance: 0,
      ...(draft ?? {}),
    });
    setShowModal(true);
  };
  useOpenNewFromQuery(handleOpenAdd);

  const handleOpenEdit = (customer: Customer) => {
    setEditingId(customer.id!);
    setFormData({ ...customer });
    setShowModal(true);
  };

  const confirmDelete = (cust: Customer) => {
    if (Math.abs(cust.balance) > 0.01) {
      showError(
        'Cannot delete customer',
        `Balance is AFN ${cust.balance.toLocaleString()}. Settle the account before deleting.`,
      );
      return;
    }
    setCustomerToDelete(cust);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (customerToDelete?.id) {
      await db.customers.update(customerToDelete.id, { isDeleted: true });
      notifyDirectoryChanged();
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
      loadCustomers();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      showError('Required', 'Customer name is required.');
      return;
    }
    try {
      const startDebt = Number(formData.openingBalance) || 0;
      if (editingId) {
        const oldCust = await db.customers.get(editingId);
        if (oldCust) {
          const oldStart = oldCust.openingBalance || 0;
          const diff = startDebt - oldStart;
          await db.customers.update(editingId, {
            ...formData,
            openingBalance: startDebt,
            balance: (Number(oldCust.balance) || 0) + diff,
          });
        }
      } else {
        await db.customers.add({
          name: formData.name ?? '',
          phone: formData.phone ?? '',
          address: formData.address ?? '',
          openingBalance: startDebt,
          totalCredit: startDebt,
          totalDebit: 0,
          balance: startDebt,
          isDeleted: false,
        } as Customer);
      }
      setShowModal(false);
      notifyDirectoryChanged();
      clearFormDraft('customer');
      loadCustomers();
      showSuccess('Saved', 'Customer record saved successfully.');
    } catch (err: any) {
      console.error('Customer save error:', err);
      showError('Could not save customer', err?.message || String(err));
    }
  };

  const sortConfig = {
    'name-az': { orderBy: 'name' as const, orderDir: 'ASC' as const },
    'name-za': { orderBy: 'name' as const, orderDir: 'DESC' as const },
    'date-newest': { orderBy: 'id' as const, orderDir: 'DESC' as const },
    'date-oldest': { orderBy: 'id' as const, orderDir: 'ASC' as const },
  }[sortBy];

  const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    from,
    hasMore,
    loadMore,
  } = useDbPagination<Customer>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [{ col: 'isDeleted', op: '=', val: 0 }];
      const term = (listSearch || globalQuery).trim();
      const orWhere: DbWhere = term
        ? [
            { col: 'name', op: 'LIKE', val: `%${term}%` },
            { col: 'phone', op: 'LIKE', val: `%${term}%` },
            { col: 'address', op: 'LIKE', val: `%${term}%` },
          ]
        : [];
      const [rows, count] = await Promise.all([
        db.customers.query({
          where,
          orWhere,
          orderBy: sortConfig.orderBy,
          orderDir: sortConfig.orderDir,
          limit: size,
          offset,
          columns: [
            'id',
            'name',
            'phone',
            'address',
            'balance',
            'openingBalance',
            'isDeleted',
          ],
        }),
        db.customers.countWhere(where, orWhere),
      ]);
      return { rows: rows as Customer[], total: count };
    },
    [listSearch, globalQuery, sortBy, listVersion],
    undefined,
    `customers:${listSearch}:${globalQuery}:${sortBy}:${listVersion}`
  );

  const inputCls = `w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800 focus:ring-red-500' : 'bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500'}`;

  return (
    <div className="space-y-3 w-full h-full min-h-0 flex flex-col">
      <div className="flex flex-wrap items-center justify-end gap-2 px-1 shrink-0">
        <div className="relative flex-1 min-w-[180px] max-w-sm mr-auto">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search name, phone, or address…"
            className={`w-full pl-8 pr-3 py-2 rounded-lg text-xs font-bold outline-none border-none ring-1 ${
              darkMode
                ? 'bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600'
                : 'bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400'
            }`}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <SortAsc className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={12} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={`pl-8 pr-7 py-2 rounded-lg text-[10px] font-black uppercase appearance-none outline-none border-none ring-1 ${darkMode ? 'bg-gray-900 ring-gray-800 text-white' : 'bg-gray-50 ring-gray-200'}`}
            >
              <option value="name-az">Name A–Z</option>
              <option value="name-za">Name Z–A</option>
              <option value="date-newest">Newest</option>
              <option value="date-oldest">Oldest</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={12} />
          </div>
          <button
            type="button"
            onClick={() => {
              setListSearch('');
              setGlobalQuery('');
              setSortBy('name-az');
              loadCustomers();
            }}
            className={`p-2 rounded-lg transition-all ${darkMode ? 'bg-gray-800 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-400 hover:text-red-500'}`}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-red-500 transition-all"
          >
            <UserPlus size={14} /> New Customer
          </button>
        </div>
      </div>

      <div
        className={`rounded-2xl border overflow-hidden flex-1 min-h-0 relative flex flex-col ${
          darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-100 shadow-sm'
        }`}
      >
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20">
              <tr
                className={`${darkMode ? 'bg-[#1a1d23]' : 'bg-white'} border-b border-gray-800/10 text-[10px] font-black uppercase text-gray-500`}
              >
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Customer Profile</th>
                <th className="px-3 py-2">Contact Details</th>
                <th className="px-3 py-2 text-right">Account Balance</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/5">
              {pageItems.map((customer, index) => (
                <tr key={customer.id} className="group hover:bg-red-500/5 transition-all">
                  <td className="px-3 py-2 font-bold text-gray-400 text-xs tabular-nums">
                    {String(from + index).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                          darkMode
                            ? 'bg-gray-900 text-red-500 border border-gray-800'
                            : 'bg-red-50 text-red-500 border border-red-100'
                        }`}
                      >
                        {customer.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-black uppercase truncate ${
                            darkMode ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {customer.name}
                        </p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">
                          ID #{customer.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      {customer.phone && (
                        <p className="text-gray-500 flex items-center gap-1.5 font-bold">
                          <Phone size={10} /> {customer.phone}
                        </p>
                      )}
                      {customer.address && (
                        <p className="text-gray-500 flex items-center gap-1.5 font-medium italic truncate">
                          <MapPin size={10} /> {customer.address}
                        </p>
                      )}
                      {!customer.phone && !customer.address && (
                        <p className="text-gray-400 opacity-40 font-black uppercase text-[9px]">
                          No Contact Data
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <p
                      className={`text-xs font-black ${
                        customer.balance > 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      AFN {customer.balance.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/ledger/customer/${customer.id}`)}
                        title="View Full Ledger"
                        className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(customer)}
                        title="Edit Details"
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(customer)}
                        title="Archive Customer"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {total === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center opacity-20 gap-3">
                      <Users size={40} className="text-gray-500" />
                      <p className="font-black text-xs uppercase tracking-[0.3em]">
                        No matching customers found
                      </p>
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

      <AnimatePresence>
        {showModal && (
          <LandscapeModal
            darkMode={darkMode}
            open={showModal}
            onClose={() => setShowModal(false)}
            title={editingId ? 'Edit Customer' : 'Add New Customer'}
            subtitle="Registry profile"
            icon={<UserPlus size={16} />}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-500"
                >
                  Cancel
                </button>
                {!editingId && (
                  <SaveDraftButton
                    darkMode={darkMode}
                    onClick={() => {
                      writeFormDraft('customer', formData);
                      showSuccess('Draft saved', 'This customer form will reopen with these values.');
                    }}
                  />
                )}
                <button
                  type="submit"
                  form="customer-form"
                  className="flex-[2] py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg"
                >
                  Commit to Registry
                </button>
              </>
            }
          >
            <form id="customer-form" onSubmit={handleSave} className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Party Name (Required)
                </label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Ahmad Khan"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Contact #
                </label>
                <div className="relative">
                  <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`${inputCls} pl-8`}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Starting Debt
                </label>
                <div className="relative">
                  <CreditCard size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="number"
                    value={formData.openingBalance ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, openingBalance: e.target.value === '' ? 0 : Number(e.target.value) })
                    }
                    className={`${inputCls} pl-8`}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Location Address
                </label>
                <div className="relative">
                  <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className={`${inputCls} pl-8`}
                    placeholder="Street, City"
                  />
                </div>
              </div>
            </form>
          </LandscapeModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && customerToDelete && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl ${
                darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white'
              }`}
            >
              <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3
                className={`text-base font-black mb-1 uppercase ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}
              >
                Remove Customer?
              </h3>
              <p className="text-gray-500 font-bold uppercase text-[9px] tracking-widest mb-5 leading-relaxed">
                This will archive {customerToDelete.name}. The record will be hidden from the active
                list.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-gray-500 ${
                    darkMode ? 'bg-gray-800' : 'bg-gray-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"
                >
                  Archive Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
