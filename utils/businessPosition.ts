import type { Customer, Employee, Expense, Product, Transaction } from "../types";
import { inventoryValueFromProduct } from "./periodPnL";
import { computeCompanyBalance, computeEmployeeDue } from "./ledgerBalances";

/** Classical trade-goods zakat rate (1/40). */
export const ZAKAT_RATE = 0.025;

/** Nisab thresholds in grams (widely cited for gold / silver). */
export const NISAB_GOLD_GRAMS = 85;
export const NISAB_SILVER_GRAMS = 595;

export type CapitalKind = "OWNER" | "EXTERNAL";

export function resolveCapitalKind(tx: Transaction): CapitalKind {
  if (tx.type !== "CAPITAL_INJECTION") return "OWNER";
  return tx.capitalKind === "EXTERNAL" ? "EXTERNAL" : "OWNER";
}

/**
 * Running cash from registry activity (same in/out rules as period P&amp;L).
 * Cash in: sale receipts, customer payments, capital injections.
 * Cash out: purchase cash paid, supplier payments, expenses, salaries.
 */
export function computeCashOnHand(
  transactions: Transaction[],
  expenses: Expense[]
): number {
  const active = transactions.filter((t) => !t.isDeleted);
  let cash = 0;

  for (const t of active) {
    const paid = Number(t.paidAmount) || 0;
    if (t.type === "SALE") cash += paid;
    else if (t.type === "PAYMENT" && t.customerId) cash += paid;
    else if (t.type === "CAPITAL_INJECTION") cash += paid;
    else if (t.type === "PURCHASE") cash -= paid;
    else if (t.type === "PAYMENT" && t.companyId) cash -= paid;
    else if (t.type === "SALARY") cash -= paid;
  }

  for (const e of expenses) {
    cash -= Number(e.amount) || 0;
  }

  return cash;
}

export function inventoryMarketValueFromProduct(p: {
  stock?: number;
  salePrice?: number;
  purchasePrice?: number;
}): number {
  const qty = Number(p.stock) || 0;
  const unit = Number(p.salePrice) || Number(p.purchasePrice) || 0;
  return qty * unit;
}

export interface CapitalPosition {
  stockValue: number;
  receivables: number;
  supplierPayables: number;
  salaryDues: number;
  cashOnHand: number;
  /** Partner / investor / lender capital recorded in the system */
  externalCapital: number;
  /** Owner's own capital injections recorded in the system */
  ownerCapitalInjected: number;
  totalAssets: number;
  totalLiabilities: number;
  /**
   * Your net capital: assets − supplier dues − salary dues − others' capital.
   * (Others' capital sits in cash/assets but is not yours to count as equity.)
   */
  ownCapital: number;
}

export function computeCapitalPosition(args: {
  products: Product[];
  customers: Customer[];
  companies: { id?: number; openingBalance?: number }[];
  employees: Employee[];
  transactions: Transaction[];
  expenses: Expense[];
  salaryPayments: Transaction[];
  companyTxsById: Map<number, Transaction[]>;
}): CapitalPosition {
  const {
    products,
    customers,
    companies,
    employees,
    transactions,
    expenses,
    salaryPayments,
    companyTxsById,
  } = args;

  const stockValue = products.reduce((s, p) => s + inventoryValueFromProduct(p), 0);
  const receivables = customers.reduce((s, c) => s + (Number(c.balance) || 0), 0);

  let supplierPayables = 0;
  for (const c of companies) {
    if (!c.id) continue;
    const txs = companyTxsById.get(c.id) ?? [];
    supplierPayables += computeCompanyBalance(c.openingBalance, txs);
  }
  supplierPayables = Math.max(0, supplierPayables);

  const salaryDues = employees.reduce(
    (s, e) => s + computeEmployeeDue(e, salaryPayments),
    0
  );

  const cashOnHand = computeCashOnHand(transactions, expenses);

  let externalCapital = 0;
  let ownerCapitalInjected = 0;
  for (const t of transactions) {
    if (t.isDeleted || t.type !== "CAPITAL_INJECTION") continue;
    const amt = Number(t.paidAmount) || 0;
    if (resolveCapitalKind(t) === "EXTERNAL") externalCapital += amt;
    else ownerCapitalInjected += amt;
  }

  const totalAssets = cashOnHand + stockValue + receivables;
  const totalLiabilities = supplierPayables + salaryDues + externalCapital;
  const ownCapital = totalAssets - supplierPayables - salaryDues - externalCapital;

  return {
    stockValue,
    receivables,
    supplierPayables,
    salaryDues,
    cashOnHand,
    externalCapital,
    ownerCapitalInjected,
    totalAssets,
    totalLiabilities,
    ownCapital,
  };
}

export type NisabBasis = "SILVER" | "GOLD";

export interface ZakatAssessment {
  cashOnHand: number;
  inventoryMarketValue: number;
  inventoryCostValue: number;
  receivables: number;
  supplierPayables: number;
  salaryDues: number;
  externalCapital: number;
  zakatableAssets: number;
  deductions: number;
  zakatBase: number;
  goldNisabValue: number;
  silverNisabValue: number;
  nisabUsed: number;
  nisabBasis: NisabBasis;
  nisabMet: boolean;
  zakatDue: number;
  rate: number;
}

/**
 * Business zakat (ʿurūḍ al-tijārah / working capital), classical net method:
 * cash + trade inventory (market/selling value) + collectible receivables
 * − immediate debts (supplier dues, unpaid salaries, others' capital claims).
 * Rate 2.5% when base ≥ nisab. Fixed assets are not in this app and are excluded.
 */
export function computeZakatAssessment(args: {
  products: Product[];
  customers: Customer[];
  companies: { id?: number; openingBalance?: number }[];
  employees: Employee[];
  transactions: Transaction[];
  expenses: Expense[];
  salaryPayments: Transaction[];
  companyTxsById: Map<number, Transaction[]>;
  goldPricePerGram: number;
  silverPricePerGram: number;
  /** Default SILVER — commonly applied for cash &amp; trade goods */
  nisabBasis?: NisabBasis;
}): ZakatAssessment {
  const position = computeCapitalPosition(args);
  const inventoryMarketValue = args.products.reduce(
    (s, p) => s + inventoryMarketValueFromProduct(p),
    0
  );
  const inventoryCostValue = position.stockValue;

  const zakatableAssets =
    position.cashOnHand + inventoryMarketValue + position.receivables;
  const deductions =
    position.supplierPayables + position.salaryDues + position.externalCapital;
  const zakatBase = Math.max(0, zakatableAssets - deductions);

  const goldNisabValue =
    (Number(args.goldPricePerGram) || 0) * NISAB_GOLD_GRAMS;
  const silverNisabValue =
    (Number(args.silverPricePerGram) || 0) * NISAB_SILVER_GRAMS;
  const nisabBasis = args.nisabBasis ?? "SILVER";
  const nisabUsed = nisabBasis === "GOLD" ? goldNisabValue : silverNisabValue;
  const nisabMet = nisabUsed > 0 && zakatBase >= nisabUsed;
  const zakatDue = nisabMet ? zakatBase * ZAKAT_RATE : 0;

  return {
    cashOnHand: position.cashOnHand,
    inventoryMarketValue,
    inventoryCostValue,
    receivables: position.receivables,
    supplierPayables: position.supplierPayables,
    salaryDues: position.salaryDues,
    externalCapital: position.externalCapital,
    zakatableAssets,
    deductions,
    zakatBase,
    goldNisabValue,
    silverNisabValue,
    nisabUsed,
    nisabBasis,
    nisabMet,
    zakatDue,
    rate: ZAKAT_RATE,
  };
}
