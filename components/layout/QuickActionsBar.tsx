import React from 'react';
import { Zap } from 'lucide-react';
import { QUICK_ACTIONS } from '../../constants';
import { useOpenScreenInPlace } from '../../hooks/useOpenScreenInPlace';
import { useAuth } from '../../contexts/AuthContext';
import { SCREEN_PREFETCH } from '../AppScreenRoutes';

interface QuickActionsBarProps {
  darkMode: boolean;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({ darkMode }) => {
  const openInPlace = useOpenScreenInPlace();
  const { canWritePath } = useAuth();
  const actions = QUICK_ACTIONS.filter((action) => canWritePath(action.path));

  if (actions.length === 0) return null;

  return (
    <div
      className={`flex-shrink-0 border-b px-1.5 py-1.5 ${
        darkMode
          ? 'bg-[#0e1015] border-gray-800/60'
          : 'bg-[#eef0f3]/90 border-gray-200/90'
      }`}
    >
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
        <div
          className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${
            darkMode ? 'text-amber-400/90' : 'text-amber-700'
          }`}
        >
          <Zap size={12} className="fill-current" />
          Quick
        </div>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            title={`${action.label} (${action.shortcut})`}
            onClick={() => openInPlace(action.path)}
            onMouseEnter={() => SCREEN_PREFETCH[action.path.split("?")[0]]?.()}
            onFocus={() => SCREEN_PREFETCH[action.path.split("?")[0]]?.()}
            className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 transition-all ${
              darkMode
                ? 'bg-[#1a1d23] text-gray-300 border border-gray-800/80 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
                : 'bg-white text-gray-700 border border-gray-200 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-600'
            }`}
          >
            <span
              className={`transition-colors ${
                darkMode
                  ? 'text-gray-500 group-hover:text-red-400'
                  : 'text-gray-400 group-hover:text-red-500'
              }`}
            >
              {action.icon}
            </span>
            <span>{action.label.replace(/^New /, '')}</span>
            <kbd
              className={`text-[8px] font-black opacity-50 group-hover:opacity-80 ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              {action.shortcut}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
};
