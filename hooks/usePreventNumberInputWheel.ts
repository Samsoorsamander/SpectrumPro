import { useEffect } from "react";

/** Prevent mouse wheel from incrementing/decrementing focused number inputs. */
export function usePreventNumberInputWheel() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number") {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);
}
