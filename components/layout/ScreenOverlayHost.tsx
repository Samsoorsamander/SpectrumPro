import React, { useEffect, useRef } from "react";
import {
  MemoryRouter,
  Routes,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
} from "react-router-dom";
import { X } from "lucide-react";
import {
  parseOverlayTo,
  useScreenOverlay,
  OverlayMountProvider,
} from "../../contexts/ScreenOverlayContext";
import { renderAppScreenRoutes } from "../AppScreenRoutes";
import { ErrorBoundary } from "../ErrorBoundary";
import { User } from "../../types";

/** Full-page workflows that need the screen UI, not only a `.fixed` dialog. */
function needsFullSheet(pathname: string): boolean {
  return (
    pathname === "/sales" ||
    pathname === "/payments" ||
    pathname === "/returns"
  );
}

/**
 * Keep-in-place host: never changes the main HashRouter location.
 *
 * - Modal-only targets (customers, products, …): mount the page hidden and
 *   only show `.fixed` dialogs over the current screen.
 * - Workflow targets (sales / payments / returns): show a sheet so the page
 *   UI remains usable after the first picker dialog.
 */
export function ScreenOverlayHost({
  darkMode,
  currentUser,
}: {
  darkMode: boolean;
  currentUser: User;
}) {
  const { overlay, closeOverlay } = useScreenOverlay();
  const pageRef = useRef<HTMLDivElement>(null);
  const seenFixed = useRef(false);
  const mainScrollRef = useRef(0);

  useEffect(() => {
    if (!overlay) return;
    const scroller = document.querySelector<HTMLElement>("[data-main-scroll]");
    if (scroller) mainScrollRef.current = scroller.scrollTop;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const el = document.querySelector<HTMLElement>("[data-main-scroll]");
      if (el) el.scrollTop = mainScrollRef.current;
    };
  }, [overlay, closeOverlay]);

  // Modal-only: close when the last `.fixed` dialog unmounts.
  useEffect(() => {
    if (!overlay) return;
    const { pathname } = parseOverlayTo(overlay.to);
    if (needsFullSheet(pathname)) return;

    seenFixed.current = false;
    const root = pageRef.current;
    if (!root) return;

    const check = () => {
      const hasFixed = Boolean(root.querySelector(".fixed"));
      if (hasFixed) {
        seenFixed.current = true;
        return;
      }
      if (seenFixed.current) closeOverlay();
    };

    const mo = new MutationObserver(check);
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    const kick = window.setTimeout(check, 50);
    const failSafe = window.setTimeout(() => {
      // If nothing opened (page error), don't leave a blank trap.
      if (!seenFixed.current) closeOverlay();
    }, 4000);

    return () => {
      mo.disconnect();
      window.clearTimeout(kick);
      window.clearTimeout(failSafe);
    };
  }, [overlay, closeOverlay]);

  if (!overlay) return null;

  const { pathname, search } = parseOverlayTo(overlay.to);
  const entryKey = `${pathname}${search}:${JSON.stringify(overlay.state ?? null)}`;
  const sheet = needsFullSheet(pathname);

  const routerTree = (
    <OverlayMountProvider>
    <ErrorBoundary key={entryKey} darkMode={darkMode}>
      {/* Clear parent router contexts so nested MemoryRouter is allowed and
          navigate/setSearchParams never touch the main HashRouter. */}
      <UNSAFE_LocationContext.Provider value={null!}>
        <UNSAFE_NavigationContext.Provider value={null!}>
          <MemoryRouter
            initialEntries={[
              {
                pathname,
                search,
                state: overlay.state,
              },
            ]}
          >
            <Routes>{renderAppScreenRoutes(darkMode, currentUser)}</Routes>
          </MemoryRouter>
        </UNSAFE_NavigationContext.Provider>
      </UNSAFE_LocationContext.Provider>
    </ErrorBoundary>
    </OverlayMountProvider>
  );

  if (!sheet) {
    return (
      <div className="fixed inset-0 z-[180] pointer-events-none">
        {/* Hide page chrome; `.fixed` dialogs restore visibility (CSS allows this). */}
        <style>{`
          [data-spectrum-overlay-page] {
            position: fixed;
            inset: 0;
            overflow: hidden;
            pointer-events: none;
          }
          [data-spectrum-overlay-page] * {
            visibility: hidden !important;
          }
          [data-spectrum-overlay-page] .fixed,
          [data-spectrum-overlay-page] .fixed * {
            visibility: visible !important;
          }
          [data-spectrum-overlay-page] .fixed {
            pointer-events: auto !important;
          }
        `}</style>
        <div ref={pageRef} data-spectrum-overlay-page="">
          {routerTree}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[180] flex flex-col">
      <button
        type="button"
        aria-label="Close overlay backdrop"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={closeOverlay}
      />
      <div
        className={`relative z-[1] m-1.5 sm:m-2.5 flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden shadow-2xl border ${
          darkMode
            ? "bg-[#0f1115] border-gray-800"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div
          className={`flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b ${
            darkMode ? "border-gray-800 bg-[#14161c]" : "border-gray-200 bg-white"
          }`}
        >
          <p
            className={`text-[10px] font-black uppercase tracking-widest ${
              darkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Stay on current screen — close when done
          </p>
          <button
            type="button"
            onClick={closeOverlay}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
              darkMode
                ? "bg-gray-800 text-white hover:bg-gray-700"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
          >
            <X size={14} />
            Close
          </button>
        </div>
        <div ref={pageRef} className="flex-1 min-h-0 overflow-auto px-1.5 py-2 sm:px-2">
          {routerTree}
        </div>
      </div>
    </div>
  );
}
