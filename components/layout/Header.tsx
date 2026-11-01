import React from 'react';

interface HeaderProps {
  darkMode: boolean;
}

/** Slim brand bar — search lives in GlobalSearchPalette (Ctrl+F). */
export const Header: React.FC<HeaderProps> = ({ darkMode }) => {
  return (
    <header
      className={`flex-shrink-0 h-10 flex items-center justify-between gap-3 px-2 z-40 ${
        darkMode ? 'bg-[#0c0e12] border-b border-gray-800/50' : 'bg-[#eef0f3] border-b border-gray-200/90'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 bg-red-500 rounded-md flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-sm shadow-red-500/30">
          S
        </div>
        <span
          className={`text-sm font-black tracking-tight ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}
        >
          Spectrum Pro
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event("spectrum:open-global-search"));
          }}
          className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
            darkMode
              ? 'bg-[#1a1d23] text-gray-400 hover:text-white border border-gray-800'
              : 'bg-gray-50 text-gray-500 hover:text-gray-800 border border-gray-200'
          }`}
          title="Global search (Ctrl+F)"
        >
          <span>Search</span>
          <kbd
            className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
              darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            F
          </kbd>
        </button>
        <div
          className={`text-[9px] font-black uppercase tracking-widest ${
            darkMode ? 'text-gray-500' : 'text-gray-400'
          }`}
        >
          {new Date().toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </div>
      </div>
    </header>
  );
};
