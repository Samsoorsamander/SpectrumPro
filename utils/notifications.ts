import { db } from "../db";
import type { Company, Customer, Employee, Product, ProductBatch, Transaction } from "../types";
import { computeCompanyBalance, computeEmployeeDue } from "./ledgerBalances";
import { readSqliteBackupMeta } from "./dailySqliteBackup";
import { TX_LIST_COLUMNS } from "./txListColumns";

export type NotificationSeverity = "critical" | "warning" | "info";

export type NotificationKind =
  | "low_stock"
  | "expiry"
  | "customer_ar"
  | "supplier_due"
  | "salary_due"
  | "backup";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  deepLink: string;
};

const EXPIRY_WINDOW_DAYS = 30;
const PER_KIND_CAP = 25;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseExpiry(raw?: string | null): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(date: Date, from: Date): number {
  return Math.ceil((date.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

async function lowStockAlerts(): Promise<AppNotification[]> {
  const products = (await db.products.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    orderBy: "name",
    orderDir: "ASC",
    columns: ["id", "name", "skuCode", "stock", "minStockLevel", "isDeleted"],
  })) as Product[];

  const out: AppNotification[] = [];
  for (const p of products) {
    const stock = Number(p.stock) || 0;
    const min = Number(p.minStockLevel) || 0;
    if (stock > min) continue;
    out.push({
      id: `low_stock-${p.id}`,
      kind: "low_stock",
      severity: stock <= 2 ? "critical" : "warning",
      title: `Low stock: ${p.name}`,
      body: `On hand ${stock}${p.skuCode ? ` · SKU ${p.skuCode}` : ""} (min ${min}).`,
      deepLink: "/inventory",
    });
    if (out.length >= PER_KIND_CAP) break;
  }
  return out;
}

async function expiryAlerts(): Promise<AppNotification[]> {
  const today = startOfToday();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + EXPIRY_WINDOW_DAYS);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const batches = (await db.productBatches.query({
    orderBy: "id",
    orderDir: "ASC",
    columns: [
      "id",
      "productId",
      "batchNumber",
      "quantity",
      "expiryDate",
    ],
  })) as ProductBatch[];

  const needNames = new Set<number>();
  const candidates: { b: ProductBatch; exp: Date; days: number }[] = [];
  for (const b of batches) {
    const qty = Number(b.quantity) || 0;
    if (qty <= 0.00001) continue;
    const expRaw = (b.expiryDate || "").trim();
    if (!expRaw) continue;
    // Cheap prefilter before Date parse
    if (expRaw.length >= 10 && expRaw.slice(0, 10) > horizonIso) continue;
    const exp = parseExpiry(expRaw);
    if (!exp || exp > horizon) continue;
    needNames.add(b.productId);
    candidates.push({ b, exp, days: daysUntil(exp, today) });
    if (candidates.length >= PER_KIND_CAP * 2) break;
  }

  const productIds = [...needNames];
  const productById = new Map<number, Product>();
  if (productIds.length) {
    const prods = (await db.products.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "id", op: "IN", val: productIds },
      ],
      columns: ["id", "name", "skuCode", "isDeleted"],
    })) as Product[];
    for (const p of prods) {
      if (p.id != null) productById.set(p.id, p);
    }
  }

  const out: AppNotification[] = [];
  for (const { b, days } of candidates) {
    const product = productById.get(b.productId);
    if (!product) continue;
    out.push({
      id: `expiry-batch-${b.id}`,
      kind: "expiry",
      severity: days < 0 ? "critical" : "warning",
      title:
        days < 0
          ? `Expired batch: ${product.name}`
          : `Expiring soon: ${product.name}`,
      body: `Batch ${b.batchNumber || b.id} · qty ${Number(b.quantity) || 0} · ${
        days < 0 ? `expired ${Math.abs(days)}d ago` : `in ${days}d`
      }.`,
      deepLink: "/inventory",
    });
    if (out.length >= PER_KIND_CAP) break;
  }
  return out;
}

async function customerArAlerts(): Promise<AppNotification[]> {
  const customers = (await db.customers.query({
    where: [
      { col: "isDeleted", op: "=", val: 0 },
      { col: "balance", op: ">", val: 0 },
    ],
    orderBy: "name",
    orderDir: "ASC",
    limit: PER_KIND_CAP,
    columns: ["id", "name", "balance", "isDeleted"],
  })) as Customer[];

  return customers.map((c) => ({
    id: `customer_ar-${c.id}`,
    kind: "customer_ar" as const,
    severity: (Number(c.balance) || 0) > 50000 ? ("critical" as const) : ("warning" as const),
    title: `Receivable: ${c.name}`,
    body: `Outstanding balance AFN ${(Number(c.balance) || 0).toLocaleString()}.`,
    deepLink: c.id != null ? `/ledger/customer/${c.id}` : "/customers",
  }));
}

async function supplierDueAlerts(): Promise<AppNotification[]> {
  const [companies, txs] = await Promise.all([
    db.companies.query({
      where: [{ col: "isDeleted", op: "=", val: 0 }],
      orderBy: "name",
      orderDir: "ASC",
      columns: ["id", "name", "openingBalance", "isDeleted"],
    }) as Promise<Company[]>,
    db.transactionLogs.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        {
          col: "type",
          op: "IN",
          val: ["PURCHASE", "PAYMENT", "PURCHASE_RETURN"],
        },
      ],
      columns: [
        "id",
        "type",
        "companyId",
        "totalAmount",
        "paidAmount",
        "isDeleted",
      ],
    }) as Promise<Transaction[]>,
  ]);

  const byCompany = new Map<number, Transaction[]>();
  for (const t of txs) {
    if (!t.companyId) continue;
    const list = byCompany.get(t.companyId) ?? [];
    list.push(t);
    byCompany.set(t.companyId, list);
  }

  const out: AppNotification[] = [];
  for (const c of companies) {
    if (!c.id) continue;
    const bal = computeCompanyBalance(c.openingBalance, byCompany.get(c.id) ?? []);
    if (bal <= 0.05) continue;
    out.push({
      id: `supplier_due-${c.id}`,
      kind: "supplier_due",
      severity: bal > 100000 ? "critical" : "warning",
      title: `Supplier due: ${c.name}`,
      body: `Payable AFN ${Math.round(bal).toLocaleString()}.`,
      deepLink: `/ledger/company/${c.id}`,
    });
    if (out.length >= PER_KIND_CAP) break;
  }
  return out;
}

async function salaryDueAlerts(): Promise<AppNotification[]> {
  const [employees, salaryTxs] = await Promise.all([
    db.employees.query({
      where: [{ col: "isDeleted", op: "=", val: 0 }],
      orderBy: "name",
      orderDir: "ASC",
      columns: ["id", "name", "salary", "joiningDate", "isDeleted"],
    }) as Promise<Employee[]>,
    db.transactionLogs.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "type", val: "SALARY" },
      ],
      columns: ["id", "type", "employeeId", "paidAmount", "isDeleted"],
    }) as Promise<Transaction[]>,
  ]);

  const out: AppNotification[] = [];
  for (const e of employees) {
    const due = computeEmployeeDue(e, salaryTxs);
    if (due <= 0.05) continue;
    out.push({
      id: `salary_due-${e.id}`,
      kind: "salary_due",
      severity: due > (Number(e.salary) || 0) * 2 ? "critical" : "warning",
      title: `Salary due: ${e.name}`,
      body: `Unpaid AFN ${Math.round(due).toLocaleString()}.`,
      deepLink: "/payments",
    });
    if (out.length >= PER_KIND_CAP) break;
  }
  return out;
}

async function backupAlert(): Promise<AppNotification[]> {
  const settings = await db.settings.toArray();
  const row = settings[0] as
    | {
        dailyBackupEnabled?: boolean;
        lastBackupDate?: string;
      }
    | undefined;
  if (!row?.dailyBackupEnabled) return [];

  const meta = readSqliteBackupMeta();
  const lastIso = meta?.at || row.lastBackupDate;
  const lastMs = lastIso ? new Date(lastIso).getTime() : 0;
  const ageMs = lastMs > 0 ? Date.now() - lastMs : Number.POSITIVE_INFINITY;
  const overdue = ageMs > 24 * 60 * 60 * 1000;

  if (!overdue) return [];

  const hours = lastMs > 0 ? Math.floor(ageMs / (60 * 60 * 1000)) : null;

  return [
    {
      id: "backup-overdue",
      kind: "backup",
      severity: hours != null && hours > 72 ? "critical" : "warning",
      title: "Backup overdue",
      body:
        hours == null
          ? "Daily backup is enabled but no successful backup was recorded."
          : `Last backup was about ${hours}h ago (expected within 24h).`,
      deepLink: "/backup",
    },
  ];
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

let cache: { at: number; list: AppNotification[] } | null = null;
const CACHE_MS = 30_000;

/** Scan live registry data into actionable alerts (no demo/fake rows). */
export async function scanNotifications(force = false): Promise<AppNotification[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.list;
  }
  const groups = await Promise.all([
    lowStockAlerts(),
    expiryAlerts(),
    customerArAlerts(),
    supplierDueAlerts(),
    salaryDueAlerts(),
    backupAlert(),
  ]);
  const list = groups
    .flat()
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.title.localeCompare(b.title)
    );
  cache = { at: Date.now(), list };
  return list;
}

export async function countNotifications(force = false): Promise<number> {
  const list = await scanNotifications(force);
  return list.length;
}
