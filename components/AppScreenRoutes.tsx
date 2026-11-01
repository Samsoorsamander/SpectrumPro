import React, { Suspense } from "react";
import { Route, Navigate } from "react-router-dom";
import { User } from "../types";
import { canReadModule, isAdmin } from "../utils/permissions";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const Inventory = React.lazy(() => import("../pages/Inventory"));
const Customers = React.lazy(() => import("../pages/Customers"));
const Companies = React.lazy(() => import("../pages/Companies"));
const Employees = React.lazy(() => import("../pages/Employees"));
const Sales = React.lazy(() => import("../pages/Sales"));
const Purchases = React.lazy(() => import("../pages/Purchases"));
const Payments = React.lazy(() => import("../pages/Payments"));
const Returns = React.lazy(() => import("../pages/Returns"));
const Catalog = React.lazy(() => import("../pages/Catalog"));
const Analysis = React.lazy(() => import("../pages/Analysis"));
const Invoices = React.lazy(() => import("../pages/Invoices"));
const Ledger = React.lazy(() => import("../pages/Ledger"));
const Expenses = React.lazy(() => import("../pages/Expenses"));
const Capital = React.lazy(() => import("../pages/Capital"));
const DayBook = React.lazy(() => import("../pages/DayBook"));
const SalesHistory = React.lazy(() => import("../pages/SalesHistory"));
const ReportsHub = React.lazy(() => import("../pages/ReportsHub"));
const Reports = React.lazy(() => import("../pages/Reports"));
const Settings = React.lazy(() => import("../pages/Settings"));
const BackupRestore = React.lazy(() => import("../pages/BackupRestore"));
const AccessControl = React.lazy(() => import("../pages/AccessControl"));
const Help = React.lazy(() => import("../pages/Help"));
const Notifications = React.lazy(() => import("../pages/Notifications"));

/** Prefetch map for TopNav hover — path → dynamic import. */
export const SCREEN_PREFETCH: Record<string, () => Promise<unknown>> = {
  "/": () => import("../pages/Dashboard"),
  "/sales": () => import("../pages/Sales"),
  "/invoices": () => import("../pages/Invoices"),
  "/daybook": () => import("../pages/DayBook"),
  "/customers": () => import("../pages/Customers"),
  "/inventory": () => import("../pages/Inventory"),
  "/purchases": () => import("../pages/Purchases"),
  "/companies": () => import("../pages/Companies"),
  "/returns": () => import("../pages/Returns"),
  "/payments": () => import("../pages/Payments"),
  "/expenses": () => import("../pages/Expenses"),
  "/capital": () => import("../pages/Capital"),
  "/sales-history": () => import("../pages/SalesHistory"),
  "/reports": () => import("../pages/ReportsHub"),
  "/settings": () => import("../pages/Settings"),
  "/access-control": () => import("../pages/AccessControl"),
  "/backup": () => import("../pages/BackupRestore"),
  "/employees": () => import("../pages/Employees"),
  "/catalog": () => import("../pages/Catalog"),
  "/analysis": () => import("../pages/Analysis"),
  "/help": () => import("../pages/Help"),
  "/notifications": () => import("../pages/Notifications"),
};

export function ScreenRouteFallback({ darkMode }: { darkMode: boolean }) {
  return (
    <div
      className={`w-full animate-pulse space-y-3 py-2 ${
        darkMode ? "text-gray-600" : "text-gray-300"
      }`}
      aria-busy="true"
      aria-label="Loading screen"
    >
      <div
        className={`h-8 w-48 rounded-lg ${
          darkMode ? "bg-gray-800" : "bg-gray-200"
        }`}
      />
      <div
        className={`h-32 w-full rounded-2xl ${
          darkMode ? "bg-gray-800/80" : "bg-gray-200/80"
        }`}
      />
      <div
        className={`h-48 w-full rounded-2xl ${
          darkMode ? "bg-gray-800/60" : "bg-gray-100"
        }`}
      />
    </div>
  );
}

/**
 * Shared route table for the main shell and the keep-in-place screen overlay.
 * Call this *inside* `<Routes>` as `{renderAppScreenRoutes(...)}` — do not
 * mount it as `<AppScreenRoutes />`, because React Router only accepts
 * `<Route>` / fragments as direct children of `<Routes>`.
 *
 * Pages are lazy-loaded so tab switches do not pay for every screen up front.
 */
export function renderAppScreenRoutes(
  darkMode: boolean,
  currentUser: User,
  opts?: { suspense?: boolean }
): React.ReactNode {
  const canOpen = (perm: string) => canReadModule(currentUser, perm);
  const useSuspense = opts?.suspense !== false;
  const fallback = <ScreenRouteFallback darkMode={darkMode} />;
  const wrap = (node: React.ReactNode) =>
    useSuspense ? <Suspense fallback={fallback}>{node}</Suspense> : node;

  return (
    <>
      <Route path="/" element={wrap(<Dashboard darkMode={darkMode} />)} />
      <Route
        path="/daybook"
        element={
          wrap(
            canOpen("daybook") ? (
              <DayBook darkMode={darkMode} />
            ) : (
              <Navigate to="/" />
            )
          )
        }
      />
      <Route
        path="/reports"
        element={
          wrap(
            canOpen("reports") ? (
              <ReportsHub darkMode={darkMode} />
            ) : (
              <Navigate to="/" />
            )
          )
        }
      />
      <Route
        path="/reports/:reportType"
        element={
          wrap(
            canOpen("reports") ? (
              <Reports darkMode={darkMode} />
            ) : (
              <Navigate to="/" />
            )
          )
        }
      />
      <Route
        path="/inventory"
        element={wrap(<Inventory darkMode={darkMode} />)}
      />
      <Route
        path="/companies"
        element={wrap(<Companies darkMode={darkMode} />)}
      />
      <Route
        path="/employees"
        element={
          wrap(
            canOpen("employees") ? (
              <Employees darkMode={darkMode} />
            ) : (
              <Navigate to="/" />
            )
          )
        }
      />
      <Route
        path="/customers"
        element={wrap(<Customers darkMode={darkMode} />)}
      />
      <Route path="/sales" element={wrap(<Sales darkMode={darkMode} />)} />
      <Route
        path="/sales-history"
        element={wrap(<SalesHistory darkMode={darkMode} />)}
      />
      <Route
        path="/purchases"
        element={wrap(<Purchases darkMode={darkMode} />)}
      />
      <Route
        path="/payments"
        element={wrap(<Payments darkMode={darkMode} />)}
      />
      <Route path="/capital" element={wrap(<Capital darkMode={darkMode} />)} />
      <Route
        path="/expenses"
        element={wrap(<Expenses darkMode={darkMode} />)}
      />
      <Route path="/returns" element={wrap(<Returns darkMode={darkMode} />)} />
      <Route path="/catalog" element={wrap(<Catalog darkMode={darkMode} />)} />
      <Route
        path="/analysis"
        element={
          wrap(
            canOpen("analysis") ? (
              <Analysis darkMode={darkMode} />
            ) : (
              <Navigate to="/" />
            )
          )
        }
      />
      <Route
        path="/invoices"
        element={wrap(<Invoices darkMode={darkMode} />)}
      />
      <Route
        path="/settings"
        element={wrap(
          <Settings darkMode={darkMode} currentUser={currentUser} />
        )}
      />
      <Route
        path="/access-control"
        element={
          wrap(
            isAdmin(currentUser) ? (
              <AccessControl darkMode={darkMode} currentUser={currentUser} />
            ) : (
              <Navigate to="/" />
            )
          )
        }
      />
      <Route
        path="/backup"
        element={wrap(<BackupRestore darkMode={darkMode} />)}
      />
      <Route
        path="/notifications"
        element={wrap(<Notifications darkMode={darkMode} />)}
      />
      <Route path="/help" element={wrap(<Help darkMode={darkMode} />)} />
      <Route
        path="/ledger/:type/:id"
        element={wrap(<Ledger darkMode={darkMode} />)}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  );
}
