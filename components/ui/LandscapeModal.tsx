import React from 'react';
import { X } from 'lucide-react';

interface LandscapeModalProps {
  darkMode: boolean;
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Wider panel for dense forms / pickers */
  wide?: boolean;
  /** Allow list area scroll; chrome stays fixed height */
  bodyScroll?: boolean;
  /** Wide landscape panel sized to its fields (no inner scroll). */
  fit?: boolean;
  zIndexClass?: string;
}

/**
 * Wide, short modal shell for low-vertical-space screens (Win7 / old PCs).
 */
export const LandscapeModal: React.FC<LandscapeModalProps> = ({
  darkMode,
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  wide = false,
  bodyScroll = false,
  fit = false,
  zIndexClass = 'z-[200]',
}) => {
  if (!open) return null;

  return (
    <div
      data-modal-shell
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-2 sm:p-3`}
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80"
      />
      <div
        className={`relative flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
          fit ? 'max-h-[calc(100vh-1rem)]' : 'max-h-[min(72vh,520px)]'
        } ${
          darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white border border-gray-200'
        }`}
        style={{ width: `min(98vw, ${fit ? 1180 : wide ? 920 : 760}px)` }}
      >
        <div
          className={`flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b ${
            darkMode ? 'border-gray-800/80 bg-gray-500/5' : 'border-gray-100 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3
                className={`text-sm font-black uppercase tracking-wide truncate ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}
              >
                {title}
              </h3>
              {subtitle && (
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-500 shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className={`flex-1 min-h-0 px-4 py-3 ${
            bodyScroll ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'
          }`}
        >
          {children}
        </div>

        {footer && (
          <div
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-t ${
              darkMode ? 'border-gray-800/80' : 'border-gray-100'
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
