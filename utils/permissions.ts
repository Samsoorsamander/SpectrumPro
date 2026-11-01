import { User, UserRole } from "../types";

/** Base module id from a stored permission token. */
export function permissionModuleId(token: string): string {
  const t = token.trim();
  if (t.endsWith(":write") || t.endsWith(":read")) {
    return t.slice(0, t.lastIndexOf(":"));
  }
  return t;
}

export function isAdmin(user: User | null | undefined): boolean {
  return user?.role === UserRole.ADMIN;
}

/**
 * Read access to a module/screen.
 * - ADMIN: always
 * - `module:write` or `module:read` or legacy bare `module`: yes
 */
export function canReadModule(
  user: User | null | undefined,
  moduleId: string
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const perms = user.permissions || [];
  if (perms.length === 0) return false;
  return perms.some((p) => {
    const id = permissionModuleId(p);
    return id === moduleId;
  });
}

/**
 * Write (create / edit / delete) access.
 * - ADMIN: always
 * - `module:write`: yes
 * - legacy bare `module` (no :read/:write): treated as full access (compat)
 * - `module:read` only: no
 */
export function canWriteModule(
  user: User | null | undefined,
  moduleId: string
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const perms = user.permissions || [];
  if (perms.length === 0) return false;

  const hasWrite = perms.includes(`${moduleId}:write`);
  if (hasWrite) return true;

  const hasReadOnly = perms.includes(`${moduleId}:read`);
  if (hasReadOnly) return false;

  // Legacy bare module id = full access
  return perms.includes(moduleId);
}

export type ModuleAccessLevel = "none" | "read" | "write";

export function getModuleAccessLevel(
  permissions: string[],
  moduleId: string
): ModuleAccessLevel {
  if (
    permissions.includes(`${moduleId}:write`) ||
    permissions.includes(moduleId)
  ) {
    return "write";
  }
  if (permissions.includes(`${moduleId}:read`)) return "read";
  return "none";
}

/** Replace all tokens for a module with the chosen level. */
export function setModuleAccess(
  permissions: string[],
  moduleId: string,
  level: ModuleAccessLevel
): string[] {
  const without = permissions.filter((p) => permissionModuleId(p) !== moduleId);
  if (level === "none") return without;
  if (level === "read") return [...without, `${moduleId}:read`];
  return [...without, `${moduleId}:write`];
}

/** Map quick-action / path prefixes to permission module ids. */
export function moduleIdFromPath(path: string): string | null {
  const clean = path.split("?")[0].replace(/\/$/, "") || "/";
  if (clean === "/") return "dashboard";
  const seg = clean.replace(/^\//, "").split("/")[0];
  const map: Record<string, string> = {
    sales: "sales",
    invoices: "invoices",
    daybook: "daybook",
    customers: "customers",
    inventory: "inventory",
    purchases: "purchases",
    companies: "companies",
    returns: "returns",
    payments: "payments",
    expenses: "expenses",
    capital: "capital",
    "sales-history": "sales-history",
    reports: "reports",
    employees: "employees",
    catalog: "catalog",
    analysis: "analysis",
    settings: "settings",
    backup: "backup",
    help: "help",
    "access-control": "access-control",
    ledger: "customers",
  };
  return map[seg] || null;
}
