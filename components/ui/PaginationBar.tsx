import React from "react";
import { Loader2 } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "../../utils/format";

interface PaginationBarProps {
  darkMode: boolean;
  total: number;
  /** How many rows are currently visible (after load-more appends). */
  shown?: number;
  /** @deprecated use `shown` — kept so older call sites still work */
  to?: number;
  from?: number;
  page?: number;
  totalPages?: number;
  pageSize?: number;
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
  onPageSizeChange?: (size: number) => void;
  /** @deprecated ignored — load-more replaces page navigation */
  onPageChange?: (page: number) => void;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  darkMode,
  total,
  shown,
  to,
  pageSize,
  hasMore: hasMoreProp,
  loading = false,
  onLoadMore,
  onPageSizeChange,
}) => {
  if (total === 0) return null;

  const visible = shown ?? to ?? total;
  const hasMore =
    hasMoreProp !== undefined ? hasMoreProp : visible < total;

  return (
    <div
      className={`flex-shrink-0 flex flex-col items-center gap-2 px-2 py-2 text-[10px] font-bold border-t ${
        darkMode ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-500"
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span>
          Showing {visible} of {total}
        </span>
        {pageSize != null && onPageSizeChange && (
          <label className="flex items-center gap-1">
            <span className="uppercase tracking-widest text-[9px]">Batch</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className={`rounded-md px-1.5 py-0.5 outline-none ring-1 ${
                darkMode
                  ? "bg-gray-900 ring-gray-700 text-white"
                  : "bg-white ring-gray-200"
              }`}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {hasMore && onLoadMore && (
        <button
          type="button"
          disabled={loading}
          onClick={onLoadMore}
          className={`inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 ${
            darkMode
              ? "bg-gray-800 text-white hover:bg-gray-700"
              : "bg-gray-100 text-gray-800 hover:bg-gray-200"
          }`}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Load more
        </button>
      )}
    </div>
  );
};
