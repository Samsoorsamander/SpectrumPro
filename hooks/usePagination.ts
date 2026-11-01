import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_PAGE_SIZE } from "../utils/format";
import { useScreenActive } from "../contexts/ScreenActiveContext";

/**
 * Client-side "load more". Leaving a tab resets to the first page so
 * returning always shows `pageSize` rows without rebuilding the source array.
 */
export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const isActive = useScreenActive();
  const [size, setSize] = useState(pageSize);
  const [visible, setVisible] = useState(size);
  const wasActiveRef = useRef(isActive);

  const total = items.length;

  useEffect(() => {
    setVisible(size);
  }, [items, size]);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setVisible(size);
    }
    wasActiveRef.current = isActive;
  }, [isActive, size]);

  const pageItems = useMemo(
    () => items.slice(0, visible),
    [items, visible]
  );

  const shown = Math.min(visible, total);
  const hasMore = shown < total;

  const loadMore = useCallback(() => {
    if (!isActive) return;
    setVisible((v) => Math.min(v + size, total));
  }, [isActive, size, total]);

  return {
    pageItems,
    pageSize: size,
    setPageSize: setSize,
    total,
    shown,
    hasMore,
    loadMore,
    loading: false,
    /** @deprecated aliases kept for gradual migration */
    page: 1,
    setPage: (_p: number) => {},
    totalPages: Math.max(1, Math.ceil(total / size) || 1),
    from: total === 0 ? 0 : 1,
    to: shown,
  };
}
