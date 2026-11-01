import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { DEFAULT_PAGE_SIZE } from "../utils/format";
import { useScreenActive } from "../contexts/ScreenActiveContext";

export type DbWhere = Array<{
  col: string;
  op?: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN";
  val: any;
}>;

type FetchPageFn<T> = (args: {
  page: number;
  pageSize: number;
  offset: number;
}) => Promise<{ rows: T[]; total: number }>;

type CacheEntry<T> = {
  rows: T[];
  total: number;
  pageSize: number;
};

const pageCache = new Map<string, CacheEntry<unknown>>();
const MAX_PAGE_CACHE = 48;

function putCache<T>(key: string, entry: CacheEntry<T>) {
  pageCache.set(key, entry as CacheEntry<unknown>);
  if (pageCache.size <= MAX_PAGE_CACHE) return;
  const oldest = pageCache.keys().next().value;
  if (oldest != null) pageCache.delete(oldest);
}

/** Seed the in-memory first-page cache (idle prefetch / warm start). */
export function warmPageCache<T>(
  key: string,
  rows: T[],
  total: number,
  pageSize = DEFAULT_PAGE_SIZE
) {
  putCache(key, { rows: rows.slice(0, pageSize), total, pageSize });
}

export function readPageCache<T>(key: string): CacheEntry<T> | undefined {
  return pageCache.get(key) as CacheEntry<T> | undefined;
}

/** Drop cached pages whose keys start with `prefix` (e.g. "inventory:", "products:"). */
export function invalidatePageCacheByPrefix(prefix: string) {
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(prefix)) pageCache.delete(key);
  }
}

/** Clear the entire pagination cache (rare — prefer prefix invalidation). */
export function clearPageCache() {
  pageCache.clear();
}

/**
 * DB-backed "load more". First visit loads one page; switching tabs does not
 * re-hit the DB when cache is warm. Leaving a tab collapses the list back to
 * the first page so return visits always start at 10 rows.
 */
export function useDbPagination<T>(
  fetchPage: FetchPageFn<T>,
  deps: unknown[] = [],
  initialPageSize = DEFAULT_PAGE_SIZE,
  cacheKey?: string
) {
  const isActive = useScreenActive();
  const cached = cacheKey
    ? (pageCache.get(cacheKey) as CacheEntry<T> | undefined)
    : undefined;
  const [pageSize, setPageSize] = useState(
    cached?.pageSize ?? initialPageSize
  );
  const [pageItems, setPageItems] = useState<T[]>(() => {
    const rows = cached?.rows ?? [];
    const size = cached?.pageSize ?? initialPageSize;
    return rows.slice(0, size);
  });
  const [total, setTotal] = useState(() => cached?.total ?? 0);
  const [loading, setLoading] = useState(() => !cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const totalRef = useRef(total);
  totalRef.current = total;
  const wasActiveRef = useRef(isActive);

  const writeCache = useCallback(
    (rows: T[], t: number, size: number) => {
      if (!cacheKey) return;
      putCache(cacheKey, { rows, total: t, pageSize: size });
    },
    [cacheKey]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    pageRef.current = 1;
    try {
      const { rows, total: t } = await fetchRef.current({
        page: 1,
        pageSize,
        offset: 0,
      });
      setPageItems(rows);
      setTotal(t);
      writeCache(rows, t, pageSize);
    } catch (err) {
      console.error("Pagination load failed:", err);
      setPageItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pageSize, writeCache]);

  // Collapse to first page when leaving the tab (no DB call, do not re-seed cache
  // with possibly stale rows — mutations may have wiped pageCache while away).
  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setPageItems((prev) =>
        prev.length <= pageSize ? prev : prev.slice(0, pageSize)
      );
      pageRef.current = 1;
      setLoadingMore(false);
    }
    wasActiveRef.current = isActive;
  }, [isActive, pageSize]);

  // Load first page only when active and cache miss / filters change.
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    const hit = cacheKey
      ? (pageCache.get(cacheKey) as CacheEntry<T> | undefined)
      : undefined;

    if (hit && hit.pageSize === pageSize) {
      pageRef.current = 1;
      setLoading(false);
      // Always apply cached rows (never keep previous state when key matches a
      // freshly written cache — avoids sticky stock after deletes/sales).
      startTransition(() => {
        setPageItems(hit.rows.slice(0, pageSize));
        setTotal(hit.total);
      });
      return;
    }

    setLoading(true);
    pageRef.current = 1;

    (async () => {
      try {
        const { rows, total: t } = await fetchRef.current({
          page: 1,
          pageSize,
          offset: 0,
        });
        if (cancelled) return;
        startTransition(() => {
          setPageItems(rows);
          setTotal(t);
        });
        pageRef.current = 1;
        writeCache(rows, t, pageSize);
      } catch (err) {
        if (!cancelled) {
          console.error("Pagination load failed:", err);
          setPageItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, cacheKey, isActive, ...deps]);

  const loadMore = useCallback(async () => {
    if (!isActive || loading || loadingMore) return;
    if (pageItems.length >= total) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const offset = pageItems.length;
      const { rows, total: t } = await fetchRef.current({
        page: nextPage,
        pageSize,
        offset,
      });
      pageRef.current = nextPage;
      setTotal(t);
      setPageItems((prev) => {
        const next = [...prev, ...rows];
        writeCache(next, t, pageSize);
        return next;
      });
    } catch (err) {
      console.error("Load more failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [
    isActive,
    loading,
    loadingMore,
    pageItems.length,
    total,
    pageSize,
    writeCache,
  ]);

  const shown = pageItems.length;
  const hasMore = shown < total;

  const reload = useCallback(async () => {
    await loadInitial();
  }, [loadInitial]);

  return {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
    loading: loading || loadingMore,
    reload,
    /** @deprecated aliases */
    page: pageRef.current,
    setPage: (_p: number) => {},
    totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    from: total === 0 ? 0 : 1,
    to: shown,
  };
}
