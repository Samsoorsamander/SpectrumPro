import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  parseOverlayTo,
  useScreenOverlay,
} from "../contexts/ScreenOverlayContext";

/**
 * Open a create/edit screen without leaving the current page.
 *
 * - Different route → keep-in-place overlay (main HashRouter stays put).
 * - Same route → in-place navigate (e.g. already on Customers → `?new=1`).
 */
export function useOpenScreenInPlace() {
  const navigate = useNavigate();
  const location = useLocation();
  const { openOverlay } = useScreenOverlay();

  return useCallback(
    (to: string, state?: unknown) => {
      const { pathname, search } = parseOverlayTo(to);
      const samePlace = location.pathname === pathname;
      if (samePlace) {
        navigate(
          { pathname, search },
          { state: state ?? null, replace: Boolean(search) }
        );
        return;
      }
      // Never navigate the main router for cross-screen quick actions / Day Book
      // deep links — that would remount the current page and lose scroll.
      openOverlay(to, state);
    },
    [location.pathname, navigate, openOverlay]
  );
}
