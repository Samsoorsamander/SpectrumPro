
import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronRight, PackageSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../../types';

interface LowStockAlertsProps {
  products: Product[];
  darkMode: boolean;
  /** When set, only show alerts whose name/SKU matches (header search on Dashboard). */
  searchFilter?: string;
}

export const LowStockAlerts: React.FC<LowStockAlertsProps> = ({ products, darkMode, searchFilter = "" }) => {
  const term = searchFilter.trim().toLowerCase();
  const lowStockItems = products
    .filter(p => p.stock <= p.minStockLevel)
    .filter(p => {
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.skuCode || "").toLowerCase().includes(term) ||
        (p.company || "").toLowerCase().includes(term)
      );
    });

  if (lowStockItems.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-6 rounded-3xl ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
            <AlertTriangle size={20} />
          </div>
          <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Restock Alerts</h3>
        </div>
        <span className="px-2.5 py-1 bg-red-500 text-white text-[10px] font-black rounded-full animate-pulse">
          {lowStockItems.length} URGENT
        </span>
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {lowStockItems.map((item) => (
          <div 
            key={item.id} 
            className={`p-3 rounded-2xl flex items-center justify-between transition-colors ${darkMode ? 'bg-[#0f1115] hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-gray-800' : 'bg-white shadow-sm'}`}>
                <PackageSearch size={18} className="text-amber-500" />
              </div>
              <div>
                <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'} truncate max-w-[120px]`}>
                  {item.name}
                </p>
                <p className="text-[10px] text-gray-500">
                  {item.stock} / {item.minStockLevel} {item.unit} left
                </p>
              </div>
            </div>
            
            <Link 
              to="/inventory" 
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-white text-gray-500'}`}
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        ))}
      </div>

      <Link 
        to="/inventory" 
        className="mt-6 w-full py-3 rounded-xl border border-dashed border-gray-700 text-xs font-bold text-gray-500 flex items-center justify-center hover:text-red-500 hover:border-red-500/50 transition-all"
      >
        Manage Inventory
      </Link>
    </motion.div>
  );
};
