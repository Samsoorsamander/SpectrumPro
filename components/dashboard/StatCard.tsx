
import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ReactNode;
  darkMode: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, change, isPositive, icon, darkMode }) => (
  <div
    className={`p-6 rounded-3xl transition-all ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}
  >
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
        {icon}
      </div>
      <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {change}
      </div>
    </div>
    <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{title}</p>
    <h3 className={`text-2xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{value}</h3>
    <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-wider">From Jun 01, 2024 to Jun 29, 2024</p>
  </div>
);
