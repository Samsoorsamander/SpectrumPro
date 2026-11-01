import type { Employee, Transaction } from "../types";

/** Supplier ledger: opening + purchases − payments − purchase returns. Does NOT subtract salaries. */
export function computeCompanyBalance(
  openingBalance: number | undefined,
  txs: Transaction[]
): number {
  const opening = Number(openingBalance) || 0;
  return txs
    .filter((tx) => !tx.isDeleted)
    .reduce((acc, tx) => {
      const amount = Number(tx.totalAmount) || 0;
      const paid = Number(tx.paidAmount) || 0;
      if (tx.type === "PURCHASE") return acc + amount;
      if (tx.type === "PAYMENT") return acc - paid;
      if (tx.type === "PURCHASE_RETURN") return acc - amount;
      return acc;
    }, opening);
}

/** Accrued salary months from joining through today, minus SALARY payments. */
export function computeEmployeeDue(
  emp: Employee,
  salaryPayments: Transaction[]
): number {
  const monthly = Number(emp.salary) || 0;
  if (!emp.joiningDate || monthly <= 0) return 0;

  const join = new Date(emp.joiningDate);
  const now = new Date();
  if (Number.isNaN(join.getTime())) return 0;

  let months = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  if (now.getDate() < join.getDate()) months -= 1;
  months = Math.max(0, months + 1);

  const accrued = months * monthly;
  const paid = salaryPayments
    .filter((t) => !t.isDeleted && t.type === "SALARY" && t.employeeId === emp.id)
    .reduce((s, t) => s + (Number(t.paidAmount) || 0), 0);

  return Math.max(0, accrued - paid);
}
