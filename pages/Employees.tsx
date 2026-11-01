
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Briefcase, Plus, Phone, X, DollarSign, Edit2, Trash2, 
  AlertTriangle, FileText, Calendar, UserPlus, RefreshCw, ChevronRight,
  Wallet, UserCheck, Clock, Hash
} from 'lucide-react';
import { db } from '../db';
import { Employee, Transaction } from '../types';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { LandscapeModal } from '../components/ui/LandscapeModal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { usePagination } from '../hooks/usePagination';
import { useLazyScreenDataSync, notifyDirectoryChanged } from '../utils/dataSync';

export default function Employees({ darkMode }: { darkMode: boolean }) {
  const { showSuccess, showError } = useFeedback();
    const navigate = useNavigate();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    // Internal state for cumulative balances to avoid constant DB hits in render
    const [balances, setBalances] = useState<Record<number, number>>({});
    const initialFormState: Partial<Employee> = {
    name: '',
    role: 'Staff',
    phone: '',
    salary: 0,
    joiningDate: new Date()
    };
    const [formData, setFormData] = useState<Partial<Employee>>(initialFormState);
    const calculateEmpDue = (emp: Employee, paidByEmployeeId: Record<number, number>) => {
    const joinDate = new Date(emp.joiningDate);
    const now = new Date();
    const months = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth()) + 1;
    const totalEarned = months * emp.salary;
    const totalPaid = paidByEmployeeId[emp.id!] || 0;
    return totalEarned - totalPaid;
    };
    useEffect(() => { loadData(); }, []);
    const loadData = useCallback(async () => {
    const [active, salaryLogs] = await Promise.all([
    db.employees.query({
    where: [{ col: 'isDeleted', op: '=', val: 0 }],
    orderBy: 'name',
    orderDir: 'ASC',
    }),
    db.transactionLogs.query({
    where: [
    { col: 'isDeleted', op: '=', val: 0 },
    { col: 'type', op: '=', val: 'SALARY' },
    ],
    columns: ['employeeId', 'paidAmount'],
    }),
    ]);
    setEmployees(active);
    const paidByEmployeeId: Record<number, number> = {};
    for (const log of salaryLogs) {
    if (log.employeeId == null) continue;
    paidByEmployeeId[log.employeeId] =
    (paidByEmployeeId[log.employeeId] || 0) + (Number(log.paidAmount) || 0);
    }
    const balanceMap: Record<number, number> = {};
    for (const emp of active) {
    balanceMap[emp.id!] = calculateEmpDue(emp, paidByEmployeeId);
    }
    setBalances(balanceMap);
    }, []);
    useLazyScreenDataSync(() => {
      void loadData();
    });
    const confirmDelete = (emp: Employee) => {
    const due = balances[emp.id!] || 0;
    if (due > 0) {
    showError(
    "Cannot delete employee",
    `${emp.name} has unpaid salary dues of AFN ${due.toLocaleString()}. Clear the payment ledger first.`,
    );
    return;
    }
    setEmployeeToDelete(emp);
    setShowDeleteConfirm(true);
    };
    const handleDelete = async () => {
    if (employeeToDelete?.id) {
    await db.employees.update(employeeToDelete.id, { isDeleted: true });
    notifyDirectoryChanged();
    setShowDeleteConfirm(false);
    setEmployeeToDelete(null);
    loadData();
    }
    };
    const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
    showError("Required", "Employee name is required.");
    return;
    }
    try {
    const data = {
    name: formData.name ?? "",
    role: formData.role ?? "",
    phone: formData.phone ?? "",
    salary: Number(formData.salary) || 0,
    joiningDate: formData.joiningDate ? new Date(formData.joiningDate) : new Date(),
    isDeleted: false,
    };
    if (editingId) {
    await db.employees.update(editingId, data);
    } else {
    await db.employees.add(data as Employee);
    }
    setShowModal(false);
    notifyDirectoryChanged();
    loadData();
    showSuccess("Saved", "Employee directory updated.");
    } catch (err: any) {
    console.error("Employee save error:", err);
    showError("Could not save employee", err?.message || String(err));
    }
    };
    // Robust Search
    const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
    const term = searchQuery.toLowerCase();
    return (
    e.name.toLowerCase().includes(term) ||
    e.role.toLowerCase().includes(term) ||
    (e.phone || '').includes(term)
    );
    });
    }, [employees, searchQuery]);
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    from,
    hasMore,
    loadMore,
  } = usePagination(filteredEmployees);

  return (
    <div className="space-y-3 w-full h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-end gap-3 px-1 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { setSearchQuery(''); loadData(); }} className={`p-2 rounded-lg ${darkMode ? 'bg-gray-800 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-400 hover:text-red-500'}`} title="Refresh"><RefreshCw size={14} /></button>
          <button onClick={() => { setEditingId(null); setFormData(initialFormState); setShowModal(true); }} className="px-4 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2">
            <UserPlus size={14} /> Add Staff
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border overflow-hidden flex-1 min-h-0 relative flex flex-col ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className={`${darkMode ? 'bg-[#1a1d23]' : 'bg-white'} border-b border-gray-800/10 text-[10px] font-black uppercase text-gray-500`}>
                <th className="px-3 py-2 w-12">S/N</th>
                <th className="px-3 py-2">Employee Info</th>
                <th className="px-3 py-2">Monthly Salary</th>
                <th className="px-3 py-2">Joining Date</th>
                <th className="px-3 py-2 text-right">Salary Debt</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/5">
              {pageItems.map((emp, index) => {
                const due = balances[emp.id!] || 0;
                return (
                  <tr key={emp.id} className="group hover:bg-red-500/5 transition-all text-xs">
                    <td className="px-6 py-5 font-bold text-gray-400">{from + index}</td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${darkMode ? 'bg-gray-900 text-indigo-500 border border-gray-800' : 'bg-indigo-50 text-indigo-500 border border-indigo-100'}`}>
                          {emp.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className={`text-sm font-black uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>{emp.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-black uppercase text-indigo-500 tracking-tighter">{emp.role}</span>
                            {emp.phone && <span className="text-[9px] font-bold text-gray-500 tracking-tighter flex items-center gap-1"><Phone size={8} /> {emp.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-5 font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      AFN {emp.salary.toLocaleString()}
                    </td>
                    <td className="px-4 py-5 font-medium text-gray-500">
                      {new Date(emp.joiningDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-5 text-right">
                      <div className="flex flex-col items-end">
                        <p className={`text-sm font-black ${due > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          AFN {due.toLocaleString()}
                        </p>
                        <p className="text-[8px] font-black uppercase text-gray-400 tracking-tighter">Total Unpaid Balance</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => navigate(`/ledger/employee/${emp.id}`)} 
                          title="Payroll History"
                          className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                        >
                          <FileText size={16} />
                        </button>
                        <button 
                          onClick={() => { setEditingId(emp.id!); setFormData(emp); setShowModal(true); }} 
                          title="Edit Info"
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => confirmDelete(emp)} 
                          title="Archive Staff"
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })},
              {total === 0 && (
                <tr>
                  <td colSpan={6} className="py-40 text-center">
                    <div className="flex flex-col items-center justify-center opacity-20 gap-4">
                      <Briefcase size={64} className="text-gray-500" />
                      <p className="font-black text-sm uppercase tracking-[0.4em]">No matching personnel found</p>
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
            title={editingId ? 'Update Profile' : 'Staff Onboarding'}
            subtitle="Personnel registry"
            icon={<Briefcase size={16} />}
            footer={
              <>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-500">Cancel</button>
                <button type="submit" form="employee-form" className="flex-[2] py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Confirm Registry</button>
              </>
            }
          >
            <form id="employee-form" onSubmit={handleRegister} className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Staff Full Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800 focus:ring-red-500' : 'bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500'}`} placeholder="Ahmad Walid" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Monthly Salary (AFN)</label>
                <input required type="number" value={formData.salary ?? ''} onChange={e => setFormData({...formData, salary: e.target.value === '' ? 0 : Number(e.target.value)})} className={`w-full px-3 py-2 rounded-lg text-xs font-black border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50 ring-gray-200'}`} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Joining Date</label>
                <input required type="date" value={formData.joiningDate ? new Date(formData.joiningDate).toISOString().split('T')[0] : ''} onChange={e => setFormData({...formData, joiningDate: new Date(e.target.value)})} className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50'}`} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Job Role</label>
                <input type="text" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50'}`} placeholder="e.g. Sales Manager" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Phone #</label>
                <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className={`w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${darkMode ? 'bg-gray-900 text-white ring-gray-800' : 'bg-gray-50'}`} placeholder="07X XXX XXXX" />
              </div>
            </form>
          </LandscapeModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && employeeToDelete && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={`relative w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white'}`}>
               <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center mx-auto mb-4"><AlertTriangle size={24} /></div>
               <h3 className={`text-base font-black mb-1 uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>Remove Staff?</h3>
               <p className="text-gray-500 font-bold uppercase text-[9px] tracking-widest mb-5 leading-relaxed">This will archive {employeeToDelete.name}. Historical logs remain preserved.</p>
               <div className="flex gap-3">
                 <button onClick={() => setShowDeleteConfirm(false)} className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-gray-500 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>Cancel</button>
                 <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">Archive Now</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
