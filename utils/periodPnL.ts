import type { Expense, Product, Transaction, TransactionItem } from "../types";
import { cogsFromAllocations } from "../batchFifo";
import { netCustomerSaleInvoiceAmount } from "./saleAmounts";

type ProductLookup = Map<number, Product> | Product[];

type CogsLineItem = Pick<
  TransactionItem,
  "productId" | "quantity" | "fifoAvgUnitCost" | "batchAllocations"
> & {
  unitCost?: number;
};

function productById(products: ProductLookup, id: number | undefined): Product | undefined {
  if (id == null) return undefined;
  if (Array.isArray(products)) return products.find((p) => p.id === id);
  return products.get(id);
}

/**
 * Line COGS in AFN using full FIFO layers when present.
 * Order: Σ(batchAllocations) → fifoAvgUnitCost × qty (allows 0) → product.purchasePrice × qty.
 */
export function lineCogsAmount(
  item: CogsLineItem,
  products: ProductLookup
): number {
  const lineQty = Number(item.quantity) || 0;
  if (lineQty <= 0) return 0;

  const allocs = item.batchAllocations;
  if (allocs && allocs.length > 0) {
    return cogsFromAllocations(allocs);
  }

  if (item.fifoAvgUnitCost !== undefined && item.fifoAvgUnitCost !== null) {
    const fifo = Number(item.fifoAvgUnitCost);
    if (Number.isFinite(fifo)) return fifo * lineQty;
  }

  const embedded = Number(item.unitCost);
  if (Number.isFinite(embedded)) return embedded * lineQty;

  const p = productById(products, item.productId);
  return (Number(p?.purchasePrice) || 0) * lineQty;
}

/** Unit COGS for a line (line amount / qty). Prefer calling lineCogsAmount for totals. */
export function lineCogsUnitCost(
  item: CogsLineItem,
  products: ProductLookup
): number {
  const qty = Number(item.quantity) || 0;
  if (qty <= 0) return 0;
  return lineCogsAmount(item, products) / qty;
}

export function transactionCogs(tx: Transaction, products: ProductLookup): number {
  return (tx.items ?? []).reduce(
    (sum, item) => sum + lineCogsAmount(item, products),
    0
  );
}

/** On-hand inventory value using product AVCO synced from batches. */
export function inventoryValueFromProduct(p: {
  stock?: number;
  purchasePrice?: number;
}): number {
  return (Number(p.stock) || 0) * (Number(p.purchasePrice) || 0);
}

export interface PeriodPnL {
  grossSales: number;
  customerReturns: number;
  netRevenue: number;
  cogs: number;
  tradingProfit: number;
  expenses: number;
  salaries: number;
  pureProfit: number;
  collected: number;
  purchases: number;
  purchaseReturns: number;
  capitalIn: number;
  moneyIn: number;
  moneyOut: number;
  saleCount: number;
}

/**
 * Single source of truth for Day Book / Reports / Analysis period totals.
 * Sales revenue uses net-after-discount; COGS uses FIFO batch layers when stored.
 */
export function computePeriodPnL(
  transactions: Transaction[],
  expenses: Expense[],
  products: ProductLookup
): PeriodPnL {
  const active = transactions.filter((t) => !t.isDeleted);
  const sales = active.filter((t) => t.type === "SALE");
  const custReturns = active.filter((t) => t.type === "RETURN");
  const purchases = active.filter((t) => t.type === "PURCHASE");
  const purchaseReturns = active.filter((t) => t.type === "PURCHASE_RETURN");
  const salaries = active.filter((t) => t.type === "SALARY");
  const capital = active.filter((t) => t.type === "CAPITAL_INJECTION");
  const custPay = active.filter((t) => t.type === "PAYMENT" && t.customerId);
  const companyPay = active.filter((t) => t.type === "PAYMENT" && t.companyId);

  const grossSales = sales.reduce((s, t) => s + netCustomerSaleInvoiceAmount(t), 0);
  const customerReturns = custReturns.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
  const netRevenue = grossSales - customerReturns;

  let cogs = 0;
  for (const t of sales) cogs += transactionCogs(t, products);
  for (const t of custReturns) cogs -= transactionCogs(t, products);

  const expenseTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const salaryTotal = salaries.reduce((s, t) => s + (Number(t.paidAmount) || 0), 0);
  const tradingProfit = netRevenue - cogs;
  const pureProfit = tradingProfit - expenseTotal - salaryTotal;

  const cashFromSales = sales.reduce((s, t) => s + (Number(t.paidAmount) || 0), 0);
  const cashFromPayments = custPay.reduce((s, t) => s + (Number(t.paidAmount) || 0), 0);
  const collected = cashFromSales + cashFromPayments;
  const capitalIn = capital.reduce((s, t) => s + (Number(t.paidAmount) || 0), 0);
  const purchaseTotal = purchases.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
  const purchaseReturnTotal = purchaseReturns.reduce(
    (s, t) => s + (Number(t.totalAmount) || 0),
    0
  );

  const moneyIn = collected + capitalIn;
  const moneyOut =
    purchases.reduce((s, t) => s + (Number(t.paidAmount) || 0), 0) +
    companyPay.reduce((s, t) => s + (Number(t.paidAmount) || 0), 0) +
    expenseTotal +
    salaryTotal;

  return {
    grossSales,
    customerReturns,
    netRevenue,
    cogs,
    tradingProfit,
    expenses: expenseTotal,
    salaries: salaryTotal,
    pureProfit,
    collected,
    purchases: purchaseTotal,
    purchaseReturns: purchaseReturnTotal,
    capitalIn,
    moneyIn,
    moneyOut,
    saleCount: sales.length,
  };
}
