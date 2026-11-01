export type ReportType =
  | "PROFIT_LOSS"
  | "INVOICE_PROFIT"
  | "PRODUCT_AUDIT"
  | "CUSTOMER_AUDIT"
  | "EMPLOYEE_PAYROLL"
  | "EMPLOYEE_SALES"
  | "SUPPLIER_DUES"
  | "PAYMENT_JOURNAL"
  | "ENTERPRISE_OVERVIEW"
  | "EXPENSE_REGISTRY"
  | "MONTHLY_OPERATIONS"
  | "CAPITAL_POSITION"
  | "ZAKAT";

export const REPORT_TYPES: ReportType[] = [
  "PROFIT_LOSS",
  "MONTHLY_OPERATIONS",
  "CAPITAL_POSITION",
  "ZAKAT",
  "INVOICE_PROFIT",
  "ENTERPRISE_OVERVIEW",
  "PRODUCT_AUDIT",
  "CUSTOMER_AUDIT",
  "SUPPLIER_DUES",
  "PAYMENT_JOURNAL",
  "EXPENSE_REGISTRY",
  "EMPLOYEE_PAYROLL",
  "EMPLOYEE_SALES",
];

export const REPORT_NAMES: Record<ReportType, string> = {
  PROFIT_LOSS: "Profit & Loss",
  INVOICE_PROFIT: "Invoice Profitability",
  PRODUCT_AUDIT: "Inventory Asset Audit",
  CUSTOMER_AUDIT: "Customer Ledger Audit",
  EMPLOYEE_PAYROLL: "Staff Payroll Obligations",
  EMPLOYEE_SALES: "Staff Sales Performance",
  SUPPLIER_DUES: "Supplier Dues (AP)",
  PAYMENT_JOURNAL: "Payment Journal",
  ENTERPRISE_OVERVIEW: "Liquidity Overview",
  EXPENSE_REGISTRY: "Expense Registry",
  MONTHLY_OPERATIONS: "Monthly Operations",
  CAPITAL_POSITION: "Capital & Wealth Position",
  ZAKAT: "Zakat Assessment",
};

export const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  PROFIT_LOSS: "Income statement: revenue, COGS, expenses, and pure profit for the period.",
  MONTHLY_OPERATIONS: "Month-by-month sales, profit, cash, purchases, returns, and expiry.",
  INVOICE_PROFIT: "Per-sale revenue vs FIFO cost and line profit.",
  ENTERPRISE_OVERVIEW: "Stock value, receivables, and cash-type inflows.",
  PRODUCT_AUDIT: "Stock on hand, units sold in period, and inventory value.",
  CUSTOMER_AUDIT: "Period trade volume and current customer balances.",
  SUPPLIER_DUES: "Accounts payable by supplier as of the end date.",
  PAYMENT_JOURNAL: "Customer payments, salaries, and capital injections.",
  EXPENSE_REGISTRY: "Operating expenses in the selected period.",
  EMPLOYEE_PAYROLL: "Salary obligations vs payments in the period.",
  EMPLOYEE_SALES: "Sales volume and totals by staff member.",
  CAPITAL_POSITION:
    "Stock, receivables, payables, cash on hand, others' capital, and your net capital.",
  ZAKAT:
    "Islamic trade zakat (2.5%): cash, stock at market, receivables, minus debts — with nisab check.",
};

export function isReportType(value: string | undefined): value is ReportType {
  return !!value && (REPORT_TYPES as string[]).includes(value);
}
