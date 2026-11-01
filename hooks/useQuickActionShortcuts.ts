import { useEffect } from "react";
import { QUICK_ACTIONS } from "../constants";
import { useOpenScreenInPlace } from "./useOpenScreenInPlace";
import { useAuth } from "../contexts/AuthContext";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable='true']"));
}

/**
 * Ctrl+1 … Ctrl+7 open quick-create actions (same as Quick Actions bar).
 * Uses keep-in-place overlay when the target is a different screen.
 * Ignored while typing in inputs. Ctrl+F remains global search.
 */
export function useQuickActionShortcuts(enabled = true) {
  const openInPlace = useOpenScreenInPlace();
  const { canWritePath } = useAuth();

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;

      const digit = e.code.match(/^Digit([1-7])$/)?.[1];
      if (!digit) return;
      const index = Number(digit) - 1;
      const action = QUICK_ACTIONS[index];
      if (!action || !canWritePath(action.path)) return;

      e.preventDefault();
      openInPlace(action.path);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, openInPlace, canWritePath]);
}
