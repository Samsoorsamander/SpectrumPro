import React from "react";

/** Secondary action that stores an unfinished quick-action form locally. */
export function SaveDraftButton({
  darkMode,
  onClick,
  className = "",
}: {
  darkMode: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
        darkMode
          ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
          : "bg-amber-50 text-amber-800 hover:bg-amber-100"
      } ${className}`}
    >
      Save Draft
    </button>
  );
}
