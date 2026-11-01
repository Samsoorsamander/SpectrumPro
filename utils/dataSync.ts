import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { clearPageCache } from "../hooks/useDbPagination";
import { useScreenActive } from "../contexts/ScreenActiveContext";

/** Stock / batch mutations that Inventory + Orders must refetch. */
export const INVENTORY_CHANGED_EVENT = "spectrum:inventory-changed";

/** Invoice / purchase / payment list mutations. */
export const LEDGER_CHANGED_EVENT = "spectrum:ledger-changed";

/** Suppliers, customers, employees — dropdowns on other screens. */
export const DIRECTORY_CHANGED_EVENT = "spectrum:directory-changed";

let inventoryEpoch = 0;
const inventoryListeners = new Set<() => void>();

let directoryEpoch = 0;
const directoryListeners = new Set<() => void>();

export function getInventoryEpoch() {
  return inventoryEpoch;
}

function subscribeInventoryEpoch(onStoreChange: () => void) {
  inventoryListeners.add(onStoreChange);
  return () => {
    inventoryListeners.delete(onStoreChange);
  };
}

/**
 * After any stock-affecting write, wipe pagination caches and bump a global
 * epoch so Product / Orders screens always refetch fresh stock.
 */
export function notifyInventoryChanged() {
  inventoryEpoch += 1;
  clearPageCache();
  inventoryListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(INVENTORY_CHANGED_EVENT, { detail: inventoryEpoch })
    );
  }
}

export function notifyLedgerChanged() {
  clearPageCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LEDGER_CHANGED_EVENT));
  }
}

function subscribeDirectoryEpoch(onStoreChange: () => void) {
  directoryListeners.add(onStoreChange);
  return () => {
    directoryListeners.delete(onStoreChange);
  };
}

export function getDirectoryEpoch() {
  return directoryEpoch;
}

/** After a supplier, customer, or employee write, refresh related screens. */
export function notifyDirectoryChanged() {
  directoryEpoch += 1;
  clearPageCache();
  directoryListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DIRECTORY_CHANGED_EVENT, { detail: directoryEpoch })
    );
  }
}

export function useDirectoryEpoch() {
  return useSyncExternalStore(
    subscribeDirectoryEpoch,
    getDirectoryEpoch,
    getDirectoryEpoch
  );
}

/** Live epoch for cache keys — changes on every inventory mutation. */
export function useInventoryEpoch() {
  return useSyncExternalStore(
    subscribeInventoryEpoch,
    getInventoryEpoch,
    getInventoryEpoch
  );
}

/** Subscribe a screen's listVersion bump to inventory mutations. */
export function useInventorySync(onChange: () => void) {
  useEffect(() => {
    const handler = () => onChange();
    window.addEventListener(INVENTORY_CHANGED_EVENT, handler);
    return () => window.removeEventListener(INVENTORY_CHANGED_EVENT, handler);
  }, [onChange]);
}

export function useLedgerSync(onChange: () => void) {
  useEffect(() => {
    const handler = () => onChange();
    window.addEventListener(LEDGER_CHANGED_EVENT, handler);
    return () => window.removeEventListener(LEDGER_CHANGED_EVENT, handler);
  }, [onChange]);
}

export function useDirectorySync(onChange: () => void) {
  useEffect(() => {
    const handler = () => onChange();
    window.addEventListener(DIRECTORY_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DIRECTORY_CHANGED_EVENT, handler);
  }, [onChange]);
}

/** Debounced refresh on inventory + ledger mutations (single reload when both fire). */
export function useDebouncedDataSync(onRefresh: () => void, debounceMs = 300) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const timerRef = useRef<number | undefined>(undefined);

  const debounced = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onRefreshRef.current();
    }, debounceMs);
  }, [debounceMs]);

  useInventorySync(debounced);
  useLedgerSync(debounced);
  useDirectorySync(debounced);

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);
}

/**
 * Like useDebouncedDataSync but skips DB work while the screen tab is hidden;
 * marks dirty and refreshes once when the user switches back.
 */
export function useLazyScreenDataSync(onRefresh: () => void, debounceMs = 300) {
  const active = useScreenActive();
  const dirtyRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const timerRef = useRef<number | undefined>(undefined);

  const debouncedRefresh = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onRefreshRef.current();
    }, debounceMs);
  }, [debounceMs]);

  const scheduleRefresh = useCallback(() => {
    if (active) {
      debouncedRefresh();
    } else {
      dirtyRef.current = true;
    }
  }, [active, debouncedRefresh]);

  useInventorySync(scheduleRefresh);
  useLedgerSync(scheduleRefresh);
  useDirectorySync(scheduleRefresh);

  useEffect(() => {
    if (active && dirtyRef.current) {
      dirtyRef.current = false;
      debouncedRefresh();
    }
  }, [active, debouncedRefresh]);

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);
}
