import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { notifyInventoryChanged, notifyLedgerChanged } from "../utils/dataSync";

export type ScreenOverlayRequest = {
  /** Path with optional query, e.g. `/customers?new=1` or `/invoices` */
  to: string;
  /** Router location.state (editId / deleteId, etc.) */
  state?: unknown;
};

type ScreenOverlayContextValue = {
  overlay: ScreenOverlayRequest | null;
  openOverlay: (to: string, state?: unknown) => void;
  closeOverlay: () => void;
  /** Subscribe to overlay close (e.g. Day Book refresh). Returns unsubscribe. */
  onOverlayClosed: (fn: () => void) => () => void;
};

const ScreenOverlayContext = createContext<ScreenOverlayContextValue | null>(
  null
);

export function ScreenOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [overlay, setOverlay] = useState<ScreenOverlayRequest | null>(null);
  const closeListeners = useRef(new Set<() => void>());

  const closeOverlay = useCallback(() => {
    setOverlay((prev) => {
      if (prev) {
        queueMicrotask(() => {
          closeListeners.current.forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error(e);
            }
          });
          // Quick-action / overlay submits must refresh Product, Orders, ledgers.
          notifyInventoryChanged();
          notifyLedgerChanged();
        });
      }
      return null;
    });
  }, []);

  const openOverlay = useCallback((to: string, state?: unknown) => {
    setOverlay({ to, state });
  }, []);

  const onOverlayClosed = useCallback((fn: () => void) => {
    closeListeners.current.add(fn);
    return () => {
      closeListeners.current.delete(fn);
    };
  }, []);

  const value = useMemo(
    () => ({ overlay, openOverlay, closeOverlay, onOverlayClosed }),
    [overlay, openOverlay, closeOverlay, onOverlayClosed]
  );

  return (
    <ScreenOverlayContext.Provider value={value}>
      {children}
    </ScreenOverlayContext.Provider>
  );
}

/** True when the current tree is the keep-in-place overlay mount (not the main tab). */
const OverlayMountContext = createContext(false);

export function OverlayMountProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OverlayMountContext.Provider value={true}>
      {children}
    </OverlayMountContext.Provider>
  );
}

export function useIsOverlayMount() {
  return useContext(OverlayMountContext);
}

export function useScreenOverlay() {
  const ctx = useContext(ScreenOverlayContext);
  if (!ctx) {
    throw new Error("useScreenOverlay must be used within ScreenOverlayProvider");
  }
  return ctx;
}

/** Parse `/path?query` into pathname + search for MemoryRouter. */
export function parseOverlayTo(to: string): { pathname: string; search: string } {
  const q = to.indexOf("?");
  if (q === -1) return { pathname: to || "/", search: "" };
  return { pathname: to.slice(0, q) || "/", search: to.slice(q) };
}
