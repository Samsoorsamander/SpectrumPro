import { useEffect } from "react";

function zIndexOf(el: Element): number {
  const raw = window.getComputedStyle(el).zIndex;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function isVisibleOverlay(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Find the topmost open modal overlay and submit its form / primary save control.
 * Works with LandscapeModal (`data-modal-shell`) and other fixed overlays that contain a form.
 */
function trySubmitActiveModal(): boolean {
  const marked = Array.from(document.querySelectorAll("[data-modal-shell]")).filter(
    isVisibleOverlay
  );
  const overlays = Array.from(document.querySelectorAll(".fixed.inset-0")).filter(
    isVisibleOverlay
  );
  const candidates = [...new Set([...marked, ...overlays])].sort(
    (a, b) => zIndexOf(b) - zIndexOf(a)
  );

  for (const root of candidates) {
    // Explicit save control (non-form modals like Payments edit).
    const explicit = root.querySelector<HTMLElement>("[data-ctrl-s-save]");
    if (explicit && !explicit.hasAttribute("disabled")) {
      explicit.click();
      return true;
    }

    const form = root.querySelector("form");
    if (form instanceof HTMLFormElement) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return true;
    }

    const submitBtn = root.querySelector<HTMLButtonElement>(
      'button[type="submit"]:not([disabled])'
    );
    if (submitBtn) {
      submitBtn.click();
      return true;
    }
  }
  return false;
}

/**
 * Ctrl+S / Cmd+S saves the topmost open modal (works even while typing in inputs).
 * Prevents the browser "Save page" dialog.
 */
export function useCtrlSSaveShortcut(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "s") return;

      e.preventDefault();
      e.stopPropagation();
      trySubmitActiveModal();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
