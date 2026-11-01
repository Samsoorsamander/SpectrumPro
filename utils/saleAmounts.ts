import type { Transaction } from "../types";

/** Net invoice amount for customer ledger (after bill discount). Handles legacy rows where totalAmount equaled line sum before discount. */
export function netCustomerSaleInvoiceAmount(tx: Transaction): number {
  if (tx.type !== "SALE") return Number(tx.totalAmount) || 0;
  const disc = Number(tx.discount) || 0;
  const stored = Number(tx.totalAmount) || 0;
  const lineSum = (tx.items ?? []).reduce(
    (s, i) => s + (Number(i.total) || 0),
    0
  );
  if (disc <= 0 || lineSum <= 0) return Math.max(0, stored);
  const netFromLines = Math.max(0, lineSum - disc);
  if (Math.abs(stored - lineSum) < 0.02) return netFromLines;
  return Math.max(0, stored);
}
