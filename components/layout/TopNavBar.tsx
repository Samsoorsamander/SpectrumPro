import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Settings,
  Sun,
  Moon,
  ChevronDown,
  Keyboard,
  Bell,
  Shield,
  LogOut,
} from 'lucide-react';
import { TOP_NAV_ITEMS, SETTINGS_MENU_ITEMS, QUICK_ACTIONS } from '../../constants';
import { SCREEN_PREFETCH } from '../AppScreenRoutes';
import { User, UserRole } from '../../types';
import { canReadModule } from '../../utils/permissions';
import { countNotifications } from '../../utils/notifications';

interface TopNavBarProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  currentUser: User | null;
  onLogout: () => void;
}

function filterNavItems<T extends { id: string; role: string }>(
  items: T[],
  currentUser: User | null
): T[] {
  return items.filter((item) => {
    if (currentUser?.role === UserRole.ADMIN) return true;
    if (!currentUser?.permissions || currentUser.permissions.length === 0) {
      if (item.role === 'ALL') return true;
      return currentUser?.role === item.role;
    }
    return canReadModule(currentUser, item.id);
  });
}

/** Exact path or child path only — avoids `/sales` matching `/sales-history`. */
function isPathActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function prefetchScreen(path: string) {
  SCREEN_PREFETCH[path]?.();
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  darkMode,
  toggleDarkMode,
  currentUser,
  onLogout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [notifCount, setNotifCount] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const tabs = filterNavItems(TOP_NAV_ITEMS, currentUser);
  const settingsItems = filterNavItems(SETTINGS_MENU_ITEMS, currentUser);

  const settingsActive =
    settingsItems.some((item) => isPathActive(location.pathname, item.path)) ||
    location.pathname === '/notifications';

  const updateMenuPos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
    });
  };

  useLayoutEffect(() => {
    if (!settingsOpen) return;
    updateMenuPos();
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const n = await countNotifications();
        if (!cancelled) setNotifCount(n);
      } catch {
        if (!cancelled) setNotifCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (location.pathname !== '/notifications') return;
    let cancelled = false;
    (async () => {
      try {
        const n = await countNotifications();
        if (!cancelled) setNotifCount(n);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    const onScroll = () => updateMenuPos();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    setSettingsOpen(false);
  }, [location.pathname]);

  const tabClass = (active: boolean, fill = false) =>
    `${fill ? 'flex-1 min-w-0 justify-center' : 'shrink-0'} inline-flex items-center gap-1 px-1.5 py-1.5 rounded-lg whitespace-nowrap text-[11px] font-semibold transition-all ${
      active
        ? 'bg-red-500 text-white shadow-sm shadow-red-500/25'
        : darkMode
          ? 'text-gray-400 hover:bg-white/5 hover:text-white'
          : 'text-gray-600 hover:bg-black/5 hover:text-gray-900'
    }`;

  const menuItemClass = (active = false) =>
    `w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-left transition-colors ${
      active
        ? 'bg-red-500/15 text-red-500'
        : darkMode
          ? 'text-gray-300 hover:bg-gray-800'
          : 'text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <div
      className={`flex-shrink-0 border-b ${
        darkMode
          ? 'bg-gradient-to-b from-[#161922] to-[#12141a] border-gray-800/70'
          : 'bg-gradient-to-b from-[#e2e5eb] to-[#cfd3db] border-gray-300/80'
      }`}
    >
      <div className="flex items-stretch gap-1 px-1 h-10 w-full">
        <nav className="flex-1 min-w-0 flex items-center gap-0.5 w-full py-1 overflow-x-auto custom-scrollbar">
          {tabs.map((item) => {
            const isActive = isPathActive(location.pathname, item.path);
            return (
              <Link
                key={item.id}
                to={item.path}
                title={item.label}
                className={tabClass(isActive, true)}
                onMouseEnter={() => prefetchScreen(item.path)}
                onFocus={() => prefetchScreen(item.path)}
              >
                {item.icon}
                <span className="hidden sm:inline truncate max-w-[5rem] lg:max-w-none">
                  {item.shortLabel}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Settings stays outside so the menu is never clipped */}
        <div className="flex items-center shrink-0 pl-1 border-l border-gray-800/20">
          <button
            ref={btnRef}
            type="button"
            onClick={() => {
              setSettingsOpen((o) => !o);
            }}
            className={tabClass(settingsActive || settingsOpen, false)}
            aria-expanded={settingsOpen}
            aria-haspopup="menu"
          >
            <Settings size={14} />
            <span>Settings</span>
            <ChevronDown
              size={12}
              className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {settingsOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className={`fixed z-[300] w-[240px] max-h-[min(70vh,520px)] overflow-y-auto custom-scrollbar rounded-xl border shadow-2xl py-1.5 ${
              darkMode
                ? 'bg-[#1a1d23] border-gray-700'
                : 'bg-white border-gray-200'
            }`}
          >
            <div
              className={`px-3 py-2.5 mb-1 border-b flex items-center gap-2.5 ${
                darkMode ? 'border-gray-800' : 'border-gray-100'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-red-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                {currentUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-black truncate ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {currentUser?.fullName || 'User'}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Shield size={10} className="text-red-500" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                    {currentUser?.role || 'Staff'}
                  </p>
                </div>
              </div>
            </div>

            {settingsItems.map((item) => {
              const isActive = isPathActive(location.pathname, item.path);
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  role="menuitem"
                  onClick={() => setSettingsOpen(false)}
                  onMouseEnter={() => prefetchScreen(item.path)}
                  onFocus={() => prefetchScreen(item.path)}
                  className={menuItemClass(isActive)}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleDarkMode();
                setSettingsOpen(false);
              }}
              className={`${menuItemClass()} border-t ${
                darkMode ? 'border-gray-800' : 'border-gray-100'
              }`}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSettingsOpen(false);
                navigate('/notifications');
              }}
              className={menuItemClass(location.pathname === '/notifications')}
            >
              <Bell size={14} />
              Notifications
              {notifCount > 0 ? (
                <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSettingsOpen(false);
                onLogout();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-left text-red-500 hover:bg-red-500/10 border-t ${
                darkMode ? 'border-gray-800' : 'border-gray-100'
              }`}
            >
              <LogOut size={14} />
              Sign Out
            </button>

            <div
              className={`border-t px-3 py-2 mt-0.5 ${
                darkMode ? 'border-gray-800' : 'border-gray-100'
              }`}
            >
              <div
                className={`flex items-center gap-1.5 mb-1.5 text-[9px] font-black uppercase tracking-widest ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                <Keyboard size={12} /> Shortcuts
              </div>
              <ul className="space-y-1">
                <li
                  className={`flex items-center justify-between gap-3 text-[10px] font-bold ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  <span>Global search</span>
                  <kbd
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black ${
                      darkMode
                        ? 'bg-gray-800 text-gray-300'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Ctrl+F
                  </kbd>
                </li>
                {QUICK_ACTIONS.map((action) => (
                  <li
                    key={action.id}
                    className={`flex items-center justify-between gap-3 text-[10px] font-bold ${
                      darkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    <span className="truncate">{action.label}</span>
                    <kbd
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black ${
                        darkMode
                          ? 'bg-gray-800 text-gray-300'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {action.shortcut}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
