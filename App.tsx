import React, { useState, useEffect } from "react";
import { HashRouter, useLocation } from "react-router-dom";
import { seedInitialData, db } from "./db";
import { startDailySqliteBackupScheduler } from "./utils/dailySqliteBackup";
import { User } from "./types";

// Modular Components
import { Header } from "./components/layout/Header";
import { TopNavBar } from "./components/layout/TopNavBar";
import { QuickActionsBar } from "./components/layout/QuickActionsBar";
import { GlobalSearchPalette } from "./components/layout/GlobalSearchPalette";
import { ScreenOverlayHost } from "./components/layout/ScreenOverlayHost";
import { CachedScreenOutlet } from "./components/layout/CachedScreenOutlet";
import { SCREEN_PREFETCH } from "./components/AppScreenRoutes";
import { warmPrimaryScreenCaches } from "./utils/warmScreenCaches";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useQuickActionShortcuts } from "./hooks/useQuickActionShortcuts";
import { usePreventNumberInputWheel } from "./hooks/usePreventNumberInputWheel";
import { useCtrlSSaveShortcut } from "./hooks/useCtrlSSaveShortcut";
import Login from "./pages/Login";
import { GlobalSearchProvider } from "./contexts/GlobalSearchContext";
import { FeedbackProvider } from "./contexts/FeedbackContext";
import { AuthProvider } from "./contexts/AuthContext";
import {
  ScreenOverlayProvider,
  useScreenOverlay,
} from "./contexts/ScreenOverlayContext";

function CloseOverlayOnMainNav() {
  const location = useLocation();
  const { overlay, closeOverlay } = useScreenOverlay();
  const prev = React.useRef(`${location.pathname}${location.search}`);
  useEffect(() => {
    const key = `${location.pathname}${location.search}`;
    if (prev.current !== key) {
      prev.current = key;
      if (overlay) closeOverlay();
    }
  }, [location.pathname, location.search, overlay, closeOverlay]);
  return null;
}

function AuthenticatedShell({
  darkMode,
  toggleDarkMode,
  currentUser,
  onLogout,
}: {
  darkMode: boolean;
  toggleDarkMode: () => void;
  currentUser: User;
  onLogout: () => void;
}) {
  return (
    <ScreenOverlayProvider>
      <AuthenticatedShellInner
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        currentUser={currentUser}
        onLogout={onLogout}
      />
    </ScreenOverlayProvider>
  );
}

function AuthenticatedShellInner({
  darkMode,
  toggleDarkMode,
  currentUser,
  onLogout,
}: {
  darkMode: boolean;
  toggleDarkMode: () => void;
  currentUser: User;
  onLogout: () => void;
}) {
  return (
    <AuthProvider user={currentUser}>
      <AuthenticatedShellContent
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        currentUser={currentUser}
        onLogout={onLogout}
      />
    </AuthProvider>
  );
}

function AuthenticatedShellContent({
  darkMode,
  toggleDarkMode,
  currentUser,
  onLogout,
}: {
  darkMode: boolean;
  toggleDarkMode: () => void;
  currentUser: User;
  onLogout: () => void;
}) {
  useQuickActionShortcuts(true);
  usePreventNumberInputWheel();
  useCtrlSSaveShortcut(true);

  useEffect(() => {
    const run = () => {
      SCREEN_PREFETCH["/inventory"]?.();
      SCREEN_PREFETCH["/purchases"]?.();
      void warmPrimaryScreenCaches().catch(() => {});
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run);
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={`h-full w-full overflow-hidden flex flex-col transition-colors duration-300 ${
        darkMode ? "bg-[#0f1115]" : "bg-[#cfd3db]"
      }`}
    >
      <CloseOverlayOnMainNav />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Header darkMode={darkMode} />
        <TopNavBar
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          currentUser={currentUser}
          onLogout={onLogout}
        />
        <QuickActionsBar darkMode={darkMode} />
        <GlobalSearchPalette darkMode={darkMode} />

        <div
          data-main-scroll
          className="flex-1 overflow-auto px-1.5 py-2 sm:px-2 sm:py-2.5 min-h-0 w-full h-full"
        >
          <ErrorBoundary darkMode={darkMode}>
            <CachedScreenOutlet
              darkMode={darkMode}
              currentUser={currentUser}
            />
          </ErrorBoundary>
        </div>
      </main>
      <ScreenOverlayHost darkMode={darkMode} currentUser={currentUser} />
    </div>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        console.log("System: Initiating core registries...");
        await seedInitialData();
        startDailySqliteBackupScheduler();

        // Check for persistent session — must still exist in the live DB
        // (after restore, session is cleared; this also blocks stale sessions).
        const savedUser = localStorage.getItem("spectrum_pro_session");
        if (savedUser) {
          try {
            const parsed = JSON.parse(savedUser) as User;
            const live =
              parsed?.id != null ? await db.users.get(Number(parsed.id)) : null;
            if (live && live.username === parsed.username) {
              const { password: _pw, ...safe } = live as User & {
                password?: string;
              };
              setCurrentUser(safe as User);
              localStorage.setItem(
                "spectrum_pro_session",
                JSON.stringify(safe)
              );
            } else {
              localStorage.removeItem("spectrum_pro_session");
            }
          } catch (e) {
            localStorage.removeItem("spectrum_pro_session");
          }
        }
      } catch (e: any) {
        console.error("Registry initialization failed:", e);
        setError(
          e?.message ||
            "Registry protocol failure. Ensure local storage permissions are granted."
        );
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem("spectrum_pro_session", JSON.stringify(user));
  };

  const handleLogout = () => {
    localStorage.removeItem("spectrum_pro_session");
    setCurrentUser(null);
    window.scrollTo(0, 0);
  };

  const toggleDarkMode = () => setDarkMode(!darkMode);

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#0f1115] text-white">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 animate-pulse font-medium tracking-tight">
          Initializing Spectrum Pro Registry...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-[#0f1115] text-white p-6 text-center">
        <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-3xl flex items-center justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h2 className="text-xl font-black uppercase tracking-widest mb-2">
          Registry Failure
        </h2>
        <p className="text-gray-500 text-sm max-w-md uppercase font-bold leading-relaxed">
          {error}
        </p>
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl"
          >
            Retry Connection
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="px-8 py-3 bg-gray-800 text-white rounded-2xl font-black text-xs uppercase shadow-xl"
          >
            Reset Local Cache
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} darkMode={darkMode} />;
  }

  return (
    <HashRouter>
      <GlobalSearchProvider>
      <FeedbackProvider darkMode={darkMode}>
        <AuthenticatedShell
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </FeedbackProvider>
      </GlobalSearchProvider>
    </HashRouter>
  );
}
