import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

export type FeedbackVariant = "success" | "error" | "info";

type FeedbackState = {
  open: boolean;
  variant: FeedbackVariant;
  title: string;
  message: string;
};

const initial: FeedbackState = {
  open: false,
  variant: "success",
  title: "",
  message: "",
};

export type FeedbackContextValue = {
  showSuccess: (title: string, message?: string) => void;
  showError: (title: string, message?: string) => void;
  showInfo: (title: string, message?: string) => void;
  close: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({
  children,
  darkMode,
}: {
  children: React.ReactNode;
  darkMode: boolean;
}) {
  const [s, setS] = useState<FeedbackState>(initial);
  const okBtnRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(
    (variant: FeedbackVariant, title: string, message?: string) => {
      setS({
        open: true,
        variant,
        title,
        message: message?.trim() || "",
      });
    },
    []
  );

  const close = useCallback(() => {
    setS((p) => ({ ...p, open: false }));
  }, []);

  useEffect(() => {
    if (!s.open) return;

    const focusTimer = window.setTimeout(() => {
      okBtnRef.current?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [s.open, close]);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      showSuccess: (t, m) => open("success", t, m),
      showError: (t, m) => open("error", t, m),
      showInfo: (t, m) => open("info", t, m),
      close,
    }),
    [open, close]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {s.open && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={close}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-dialog-title"
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 14 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className={`relative w-full max-w-md overflow-hidden rounded-[40px] border shadow-2xl ${
                darkMode
                  ? "border-gray-800 bg-[#1a1d23] shadow-black/50"
                  : "border-gray-200 bg-white shadow-2xl"
              }`}
            >
              <button
                type="button"
                onClick={close}
                className={`absolute right-3 top-3 z-10 rounded-xl p-2 transition-colors ${
                  darkMode
                    ? "text-gray-500 hover:bg-gray-800 hover:text-white"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                }`}
              >
                <X size={20} />
              </button>

              <div
                className={`px-8 pb-2 pt-10 text-center ${
                  s.variant === "success"
                    ? "bg-gradient-to-b from-emerald-500/[0.12] to-transparent"
                    : s.variant === "error"
                    ? "bg-gradient-to-b from-red-500/[0.12] to-transparent"
                    : "bg-gradient-to-b from-blue-500/10 to-transparent"
                }`}
              >
                <div className="mb-5 flex justify-center">
                  <div
                    className={`flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[26px] ${
                      s.variant === "success"
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/35"
                        : s.variant === "error"
                        ? "bg-red-600 text-white shadow-lg shadow-red-500/35"
                        : "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                    }`}
                  >
                    {s.variant === "success" ? (
                      <CheckCircle2 size={38} strokeWidth={2.5} />
                    ) : s.variant === "error" ? (
                      <XCircle size={38} strokeWidth={2.5} />
                    ) : (
                      <Info size={38} strokeWidth={2.5} />
                    )}
                  </div>
                </div>
                <h3
                  id="feedback-dialog-title"
                  className={`px-2 text-base font-black uppercase tracking-tight ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {s.title}
                </h3>
                {s.message ? (
                  <p
                    className={`mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap px-1 text-sm font-medium leading-relaxed ${
                      darkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {s.message}
                  </p>
                ) : null}
              </div>

              <div
                className={`border-t px-8 py-5 ${
                  darkMode
                    ? "border-gray-800 bg-[#14171c]"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <button
                  ref={okBtnRef}
                  type="button"
                  onClick={close}
                  className="w-full rounded-2xl bg-red-600 py-3.5 text-center text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-red-600/25 transition-transform hover:scale-[1.02] active:scale-[0.98] outline-none focus:ring-2 focus:ring-red-400/60"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const c = useContext(FeedbackContext);
  if (!c) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return c;
}
