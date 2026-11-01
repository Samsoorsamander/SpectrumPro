
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { 
  Printer, Download, RefreshCw, ArrowLeft, Moon, Search, Table2
} from 'lucide-react';
import { db } from '../db';
import { Transaction, Expense, Product, Customer, SystemSettings, Employee, Company, ProductBatch } from '../types';
import { exportElementToPdf } from '../utils/pdfExport';
import { downloadCsv } from '../utils/csvExport';
import { useFeedback } from '../contexts/FeedbackContext';
import { SimpleBookReportPage, book } from '../components/SimpleBookReport';
import PrintMountPortal from '../components/PrintMountPortal';
import { computePeriodPnL, transactionCogs, inventoryValueFromProduct } from '../utils/periodPnL';
import { computeCompanyBalance, computeEmployeeDue } from '../utils/ledgerBalances';
import { netCustomerSaleInvoiceAmount } from '../utils/saleAmounts';
import {
  computeCapitalPosition,
  computeZakatAssessment,
  NISAB_GOLD_GRAMS,
  NISAB_SILVER_GRAMS,
  ZAKAT_RATE,
  type NisabBasis,
} from '../utils/businessPosition';
import {
  ReportType,
  REPORT_NAMES,
  isReportType,
} from '../utils/reportCatalog';
import { usePagination } from '../hooks/usePagination';
import { useDbPagination, DbWhere } from '../hooks/useDbPagination';
import { PaginationBar } from '../components/ui/PaginationBar';
import { TX_LIST_COLUMNS } from '../utils/txListColumns';
import { useLazyScreenDataSync } from '../utils/dataSync';

const ZAKAT_PRICE_KEY = "spectrumpro_zakat_metal_prices";

function loadZakatPrices(): { gold: number; silver: number } {
  try {
    const raw = localStorage.getItem(ZAKAT_PRICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        gold: Number(parsed.gold) || 0,
        silver: Number(parsed.silver) || 0,
      };
    }
  } catch {
    /* ignore */
  }
  return { gold: 0, silver: 0 };
}

export default function Reports({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const { reportType: reportTypeParam } = useParams<{ reportType: string }>();
    const reportType: ReportType | null = isReportType(reportTypeParam)
    ? reportTypeParam
    : null;
    const { showError, showSuccess } = useFeedback();
    const [listSearch, setListSearch] = useState('');
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [products, setProducts] = useState<Product[]>([]);
    const [productById, setProductById] = useState<Map<number, Product>>(new Map());
    const [productNetSold, setProductNetSold] = useState<Map<number, number>>(new Map());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
    const [productBatches, setProductBatches] = useState<ProductBatch[]>([]);
    const [allSalaryPayments, setAllSalaryPayments] = useState<Transaction[]>([]);
    const [positionTransactions, setPositionTransactions] = useState<Transaction[]>([]);
    const [positionExpenses, setPositionExpenses] = useState<Expense[]>([]);
    const [dataVersion, setDataVersion] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const initialMetal = loadZakatPrices();
    const [goldPricePerGram, setGoldPricePerGram] = useState(initialMetal.gold);
    const [silverPricePerGram, setSilverPricePerGram] = useState(initialMetal.silver);
    const [nisabBasis, setNisabBasis] = useState<NisabBasis>("SILVER");
    const simplePdfRef = useRef<HTMLDivElement>(null);
    useEffect(() => { loadBaseData(); }, []);
    useEffect(() => {
    if (reportType) loadFilteredData();
    }, [startDate, endDate, reportType]);
    useEffect(() => {
      setListSearch('');
    }, [reportType]);
    const loadBaseData = async () => {
    const settings = await db.settings.toArray();
    if (settings.length > 0) setBizSettings(settings[0]);
    };

    const periodWhere = (upperOnly = false): DbWhere =>
      upperOnly
        ? [
            { col: "isDeleted", op: "=", val: 0 },
            { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
          ]
        : [
            { col: "isDeleted", op: "=", val: 0 },
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
          ];

    const expensePeriodWhere = (upperOnly = false): DbWhere =>
      upperOnly
        ? [{ col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` }]
        : [
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
          ];

    const loadActiveProducts = async () => {
      const p = (await db.products.query({
        where: [{ col: "isDeleted", op: "=", val: 0 }],
        orderBy: "name",
        orderDir: "ASC",
      })) as Product[];
      setProducts(p);
      setProductById(new Map(p.filter((x) => x.id != null).map((x) => [x.id!, x])));
      return p;
    };

    const loadFilteredData = async () => {
    if (!reportType) return;
    const isPositionReport =
      reportType === "CAPITAL_POSITION" || reportType === "ZAKAT";
    const needsProducts =
      isPositionReport ||
      reportType === "PROFIT_LOSS" ||
      reportType === "ENTERPRISE_OVERVIEW" ||
      reportType === "MONTHLY_OPERATIONS" ||
      reportType === "INVOICE_PROFIT" ||
      reportType === "PRODUCT_AUDIT" ||
      reportType === "EMPLOYEE_SALES";
    const needsCustomers =
      isPositionReport ||
      reportType === "ENTERPRISE_OVERVIEW" ||
      reportType === "CUSTOMER_AUDIT" ||
      reportType === "PROFIT_LOSS";
    const needsEmployees =
      isPositionReport ||
      reportType === "EMPLOYEE_PAYROLL" ||
      reportType === "EMPLOYEE_SALES";
    const needsCompanies =
      isPositionReport || reportType === "SUPPLIER_DUES";
    const needsBatches = reportType === "MONTHLY_OPERATIONS";
    const needsPeriodTx =
      reportType === "PROFIT_LOSS" ||
      reportType === "ENTERPRISE_OVERVIEW" ||
      reportType === "MONTHLY_OPERATIONS" ||
      reportType === "CUSTOMER_AUDIT" ||
      reportType === "EMPLOYEE_PAYROLL" ||
      reportType === "EMPLOYEE_SALES" ||
      reportType === "PRODUCT_AUDIT";
    const needsPeriodExp =
      reportType === "PROFIT_LOSS" ||
      reportType === "ENTERPRISE_OVERVIEW" ||
      reportType === "MONTHLY_OPERATIONS";

    const tasks: Promise<void>[] = [];

    if (needsProducts) {
      tasks.push(loadActiveProducts().then(() => undefined));
    } else {
      setProducts([]);
      setProductById(new Map());
    }

    if (needsCustomers) {
      tasks.push(
        db.customers
          .query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            orderBy: "name",
            orderDir: "ASC",
          })
          .then((rows) => {
            setCustomers(rows as Customer[]);
          })
      );
    } else {
      setCustomers([]);
    }

    if (needsEmployees) {
      tasks.push(
        db.employees
          .query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            orderBy: "name",
            orderDir: "ASC",
          })
          .then((rows) => {
            setEmployees(rows as Employee[]);
          })
      );
    } else {
      setEmployees([]);
    }

    if (needsCompanies) {
      tasks.push(
        db.companies
          .query({
            where: [{ col: "isDeleted", op: "=", val: 0 }],
            orderBy: "name",
            orderDir: "ASC",
          })
          .then((rows) => {
            setCompanies(rows as Company[]);
          })
      );
    } else {
      setCompanies([]);
    }

    if (needsBatches) {
      tasks.push(
        db.productBatches.query({ orderBy: "id", orderDir: "ASC" }).then((rows) => {
          setProductBatches(rows as ProductBatch[]);
        })
      );
    } else {
      setProductBatches([]);
    }

    if (isPositionReport || reportType === "EMPLOYEE_PAYROLL" || reportType === "SUPPLIER_DUES") {
      tasks.push(
        db.transactionLogs
          .query({
            where: [
              { col: "isDeleted", op: "=", val: 0 },
              { col: "type", val: "SALARY" },
              ...(isPositionReport || reportType === "SUPPLIER_DUES"
                ? [{ col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` } as const]
                : []),
            ],
            columns: [...TX_LIST_COLUMNS],
          })
          .then((rows) => {
            setAllSalaryPayments(rows as Transaction[]);
          })
      );
    } else {
      setAllSalaryPayments([]);
    }

    if (isPositionReport || reportType === "SUPPLIER_DUES") {
      tasks.push(
        Promise.all([
          db.transactionLogs.query({
            where: periodWhere(true),
            orderBy: "date",
            orderDir: "DESC",
            columns: [...TX_LIST_COLUMNS],
          }),
          db.expenses.query({
            where: expensePeriodWhere(true),
            orderBy: "date",
            orderDir: "DESC",
          }),
        ]).then(([allTx, allExp]) => {
          setPositionTransactions(allTx as Transaction[]);
          setPositionExpenses(allExp as Expense[]);
          if (reportType === "SUPPLIER_DUES") {
            setTransactions(allTx as Transaction[]);
          }
        })
      );
    } else {
      setPositionTransactions([]);
      setPositionExpenses([]);
    }

    if (needsPeriodTx) {
      const typeFilter: string[] | null =
        reportType === "PRODUCT_AUDIT"
          ? ["SALE", "RETURN"]
          : reportType === "CUSTOMER_AUDIT" || reportType === "EMPLOYEE_SALES"
            ? ["SALE"]
            : reportType === "EMPLOYEE_PAYROLL"
              ? ["SALARY"]
              : null;
      const where: DbWhere = periodWhere(false);
      if (typeFilter) where.push({ col: "type", op: "IN", val: typeFilter });
      const columns =
        reportType === "EMPLOYEE_PAYROLL"
          ? [...TX_LIST_COLUMNS]
          : reportType === "CUSTOMER_AUDIT"
            ? [...TX_LIST_COLUMNS]
            : undefined;
      tasks.push(
        db.transactionLogs
          .query({
            where,
            orderBy: "date",
            orderDir: "DESC",
            columns,
          })
          .then((allTx) => {
            const txs = allTx as Transaction[];
            setTransactions(txs);
            if (reportType === "PRODUCT_AUDIT") {
              const net = new Map<number, number>();
              for (const t of txs) {
                const sign =
                  t.type === "SALE" ? 1 : t.type === "RETURN" ? -1 : 0;
                if (!sign) continue;
                for (const item of t.items ?? []) {
                  const pid = item.productId;
                  if (pid == null) continue;
                  net.set(
                    pid,
                    (net.get(pid) || 0) + sign * (Number(item.quantity) || 0)
                  );
                }
              }
              setProductNetSold(net);
            } else {
              setProductNetSold(new Map());
            }
          })
      );
    } else if (
      reportType !== "SUPPLIER_DUES" &&
      reportType !== "INVOICE_PROFIT" &&
      reportType !== "PAYMENT_JOURNAL" &&
      reportType !== "EXPENSE_REGISTRY"
    ) {
      setTransactions([]);
      setProductNetSold(new Map());
    }

    if (needsPeriodExp) {
      tasks.push(
        db.expenses
          .query({
            where: expensePeriodWhere(false),
            orderBy: "date",
            orderDir: "DESC",
          })
          .then((allExp) => {
            setExpenses(allExp as Expense[]);
          })
      );
    } else if (reportType !== "EXPENSE_REGISTRY") {
      setExpenses([]);
    }

    await Promise.all(tasks);
    setDataVersion((v) => v + 1);
    };
    useLazyScreenDataSync(() => {
      void loadFilteredData();
    });
    const handleDownloadPDF = async () => {
    if (!simplePdfRef.current || !reportType) return;
    setIsExporting(true);
    try {
    await exportElementToPdf(
    simplePdfRef.current,
    `SpectrumPro_Audit_${reportType}_${startDate}`,
    { scale: 2, backgroundColor: "#ffffff" }
    );
    } catch (err) {
    console.error(err);
    showError("PDF export failed", "Could not generate the report PDF. Try again.");
    } finally {
    setIsExporting(false);
    }
    };
    const reportNames = REPORT_NAMES;
    /** Calendar months from start month through end month (inclusive). */
    const monthBuckets = useMemo(() => {
    const s = new Date(startDate + "T12:00:00");
    const e = new Date(endDate + "T12:00:00");
    const out: { ym: string; label: string }[] = [];
    let cur = new Date(s.getFullYear(), s.getMonth(), 1);
    const endM = new Date(e.getFullYear(), e.getMonth(), 1);
    while (cur <= endM) {
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    out.push({
    ym,
    label: cur.toLocaleString("default", { month: "short", year: "numeric" })
    });
    cur.setMonth(cur.getMonth() + 1);
    }
    return out;
    }, [startDate, endDate]);
    const txYm = (d: Date) => new Date(d).toISOString().slice(0, 7);
    const monthlyRows = useMemo(() => {
    return monthBuckets.map(({ ym, label }) => {
    const txs = transactions.filter((t) => txYm(new Date(t.date)) === ym);
    const exps = expenses.filter((e) => txYm(new Date(e.date)) === ym);
    const pnl = computePeriodPnL(txs, exps, productById.size ? productById : products);
    let expiryValue = 0;
    for (const b of productBatches) {
    const raw = b.expiryDate?.trim();
    if (!raw) continue;
    const ed =
    raw.length >= 7 && raw[4] === "-"
    ? raw.slice(0, 7)
    : (() => {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 7);
    })();
    if (ed === ym) {
    expiryValue += (Number(b.quantity) || 0) * (Number(b.unitCost) || 0);
    }
    }
    return {
    ym,
    label,
    sales: pnl.grossSales,
    profit: pnl.pureProfit,
    expenses: pnl.expenses + pnl.salaries,
    collected: pnl.collected,
    purchases: pnl.purchases,
    returns: pnl.customerReturns + pnl.purchaseReturns,
    expiryValue,
    };
    });
    }, [monthBuckets, transactions, expenses, products, productById, productBatches]);
    const stats = useMemo(() => {
    const pnl = computePeriodPnL(transactions, expenses, productById.size ? productById : products);
    const totalStockValue = products.reduce((s, p) => s + inventoryValueFromProduct(p), 0);
    const moneyInMarket = customers.reduce((s, c) => s + (c.balance || 0), 0);
    return {
    grossRevenue: pnl.grossSales,
    returnValue: pnl.customerReturns,
    netRevenue: pnl.netRevenue,
    cogs: pnl.cogs,
    tradingProfit: pnl.tradingProfit,
    totalExpenses: pnl.expenses,
    totalSalaries: pnl.salaries,
    pureProfit: pnl.pureProfit,
    totalStockValue,
    moneyInMarket,
    totalCollected: pnl.collected,
    externalCapitalReceived: pnl.capitalIn,
    totalLiquidityInflows: pnl.collected + pnl.capitalIn,
    };
    }, [transactions, expenses, products, productById, customers]);
    // Unified Search & Filtering Logic (aligned with periodPnL / ledger helpers)
    // DB-paginated list reports omit heavy arrays from displayContent (empty here).
    const dbPagedReport =
      reportType === "INVOICE_PROFIT" ||
      reportType === "PAYMENT_JOURNAL" ||
      reportType === "EXPENSE_REGISTRY" ||
      reportType === "PRODUCT_AUDIT";

    const displayContent = useMemo(() => {
    if (!reportType || dbPagedReport) return [];
    const query = listSearch.trim().toLowerCase();
    if (reportType === 'CUSTOMER_AUDIT') {
    const tradedByCustomer = new Map<number, number>();
    for (const t of transactions) {
      if (t.type !== 'SALE' || t.customerId == null) continue;
      tradedByCustomer.set(
        t.customerId,
        (tradedByCustomer.get(t.customerId) || 0) + netCustomerSaleInvoiceAmount(t)
      );
    }
    return customers
    .filter(c => !query || c.name.toLowerCase().includes(query) || (c.phone || '').includes(query))
    .map(c => {
    const traded = tradedByCustomer.get(c.id!) || 0;
    return { ...c, traded, balance: Number(c.balance) || 0 };
    });
    }
    if (reportType === 'EMPLOYEE_PAYROLL') {
    return employees.filter(e => !query || e.name.toLowerCase().includes(query)).map(e => {
    const paidInPeriod = transactions
    .filter(t => t.type === 'SALARY' && t.employeeId === e.id)
    .reduce((s, t) => s + (Number(t.paidAmount) || 0), 0);
    const due = computeEmployeeDue(e, allSalaryPayments);
    return { ...e, paidInPeriod, due };
    });
    }
    if (reportType === 'EMPLOYEE_SALES') {
    return employees.filter(e => !query || e.name.toLowerCase().includes(query)).map(e => {
    const personalSales = transactions.filter(t => t.type === 'SALE' && t.employeeId === e.id);
    const total = personalSales.reduce((s, t) => s + netCustomerSaleInvoiceAmount(t), 0);
    const count = personalSales.length;
    return { ...e, total, count, avg: count > 0 ? total / count : 0 };
    });
    }
    if (reportType === 'SUPPLIER_DUES') {
    return companies.filter(c => !query || c.name.toLowerCase().includes(query) || (c.originCountry || '').toLowerCase().includes(query));
    }
    return [];
    }, [reportType, dbPagedReport, transactions, customers, employees, companies, listSearch, allSalaryPayments]);

    const filteredMonthlyRows = useMemo(() => {
      const query = listSearch.trim().toLowerCase();
      if (!query) return monthlyRows;
      return monthlyRows.filter((r) => r.label.toLowerCase().includes(query));
    }, [monthlyRows, listSearch]);

    // Supplier dues: one pass over company-scoped txs already loaded through endDate
    const [supplierBalances, setSupplierBalances] = useState<Record<number, number>>({});
    useEffect(() => {
    if (reportType !== 'SUPPLIER_DUES') {
      setSupplierBalances({});
      return;
    }
    const byCompany = new Map<number, Transaction[]>();
    for (const t of transactions) {
      if (!t.companyId) continue;
      const list = byCompany.get(t.companyId) ?? [];
      list.push(t);
      byCompany.set(t.companyId, list);
    }
    const res: Record<number, number> = {};
    for (const c of companies) {
      if (!c.id) continue;
      res[c.id] = computeCompanyBalance(
        c.openingBalance,
        byCompany.get(c.id) ?? []
      );
    }
    setSupplierBalances(res);
    }, [reportType, transactions, companies]);
    const supplierTotalDue = useMemo(() => {
    return Object.values(supplierBalances).reduce((s, v) => s + v, 0);
    }, [supplierBalances]);

    const companyTxsById = useMemo(() => {
      const map = new Map<number, Transaction[]>();
      const source =
        reportType === "CAPITAL_POSITION" || reportType === "ZAKAT"
          ? positionTransactions
          : [];
      for (const t of source) {
        if (!t.companyId) continue;
        const list = map.get(t.companyId) ?? [];
        list.push(t);
        map.set(t.companyId, list);
      }
      return map;
    }, [reportType, positionTransactions]);

    const capitalPosition = useMemo(() => {
      if (reportType !== "CAPITAL_POSITION" && reportType !== "ZAKAT") return null;
      return computeCapitalPosition({
        products,
        customers,
        companies,
        employees,
        transactions: positionTransactions,
        expenses: positionExpenses,
        salaryPayments: allSalaryPayments,
        companyTxsById,
      });
    }, [
      reportType,
      products,
      customers,
      companies,
      employees,
      positionTransactions,
      positionExpenses,
      allSalaryPayments,
      companyTxsById,
    ]);

    const zakatAssessment = useMemo(() => {
      if (reportType !== "ZAKAT") return null;
      return computeZakatAssessment({
        products,
        customers,
        companies,
        employees,
        transactions: positionTransactions,
        expenses: positionExpenses,
        salaryPayments: allSalaryPayments,
        companyTxsById,
        goldPricePerGram,
        silverPricePerGram,
        nisabBasis,
      });
    }, [
      reportType,
      products,
      customers,
      companies,
      employees,
      positionTransactions,
      positionExpenses,
      allSalaryPayments,
      companyTxsById,
      goldPricePerGram,
      silverPricePerGram,
      nisabBasis,
    ]);

    useEffect(() => {
      try {
        localStorage.setItem(
          ZAKAT_PRICE_KEY,
          JSON.stringify({ gold: goldPricePerGram, silver: silverPricePerGram })
        );
      } catch {
        /* ignore */
      }
    }, [goldPricePerGram, silverPricePerGram]);

    const {
      pageItems: dbTablePageItems,
      pageSize: dbTablePageSize,
      setPageSize: setDbTablePageSize,
      total: dbTableTotal,
      shown: dbTableShown,
      hasMore: dbTableHasMore,
      loadMore: dbTableLoadMore,
    } = useDbPagination<any>(
      async ({ pageSize: size, offset }) => {
        if (!dbPagedReport || !reportType) return { rows: [], total: 0 };
        const term = listSearch.trim();
        if (reportType === "INVOICE_PROFIT") {
          const where: DbWhere = [
            { col: "isDeleted", op: "=", val: 0 },
            { col: "type", val: "SALE" },
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
          ];
          const orWhere: DbWhere = term
            ? [
                { col: "customerName", op: "LIKE", val: `%${term}%` },
                ...( /^\d+$/.test(term) ? [{ col: "id", val: Number(term) } as const] : []),
              ]
            : [];
          const [rows, count] = await Promise.all([
            db.transactionLogs.query({
              where,
              orWhere,
              orderBy: "date",
              orderDir: "DESC",
              limit: size,
              offset,
            }),
            db.transactionLogs.countWhere(where, orWhere),
          ]);
          const mapped = (rows as Transaction[]).map((t) => {
            const revenue = netCustomerSaleInvoiceAmount(t);
            const cost = transactionCogs(t, productById.size ? productById : products);
            return { ...t, revenue, cost, profit: revenue - cost, totalAmount: revenue };
          });
          return { rows: mapped, total: count };
        }
        if (reportType === "PAYMENT_JOURNAL") {
          const where: DbWhere = [
            { col: "isDeleted", op: "=", val: 0 },
            {
              col: "type",
              op: "IN",
              val: ["PAYMENT", "SALARY", "CAPITAL_INJECTION"],
            },
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
          ];
          const orWhere: DbWhere = term
            ? [
                { col: "customerName", op: "LIKE", val: `%${term}%` },
                { col: "companyName", op: "LIKE", val: `%${term}%` },
                { col: "employeeName", op: "LIKE", val: `%${term}%` },
                { col: "notes", op: "LIKE", val: `%${term}%` },
              ]
            : [];
          const [rows, count] = await Promise.all([
            db.transactionLogs.query({
              where,
              orWhere,
              orderBy: "date",
              orderDir: "DESC",
              limit: size,
              offset,
              columns: [...TX_LIST_COLUMNS],
            }),
            db.transactionLogs.countWhere(where, orWhere),
          ]);
          return { rows, total: count };
        }
        if (reportType === "EXPENSE_REGISTRY") {
          const where: DbWhere = [
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
          ];
          const orWhere: DbWhere = term
            ? [
                { col: "description", op: "LIKE", val: `%${term}%` },
                { col: "category", op: "LIKE", val: `%${term}%` },
                { col: "paidTo", op: "LIKE", val: `%${term}%` },
              ]
            : [];
          const [rows, count] = await Promise.all([
            db.expenses.query({
              where,
              orWhere,
              orderBy: "date",
              orderDir: "DESC",
              limit: size,
              offset,
            }),
            db.expenses.countWhere(where, orWhere),
          ]);
          return { rows, total: count };
        }
        if (reportType === "PRODUCT_AUDIT") {
          const where: DbWhere = [{ col: "isDeleted", op: "=", val: 0 }];
          const orWhere: DbWhere = term
            ? [
                { col: "name", op: "LIKE", val: `%${term}%` },
                { col: "company", op: "LIKE", val: `%${term}%` },
                { col: "skuCode", op: "LIKE", val: `%${term}%` },
              ]
            : [];
          const [rows, count] = await Promise.all([
            db.products.query({
              where,
              orWhere,
              orderBy: "name",
              orderDir: "ASC",
              limit: size,
              offset,
            }),
            db.products.countWhere(where, orWhere),
          ]);
          const mapped = (rows as Product[]).map((p) => ({
            ...p,
            sold: productNetSold.get(p.id!) || 0,
            value: inventoryValueFromProduct(p),
          }));
          return { rows: mapped, total: count };
        }
        return { rows: [], total: 0 };
      },
      [
        dbPagedReport,
        reportType,
        startDate,
        endDate,
        listSearch,
        productById,
        products,
        productNetSold,
        dataVersion,
      ],
      undefined,
      dbPagedReport
        ? `reports:${reportType}:${startDate}:${endDate}:${listSearch}:${dataVersion}`
        : undefined
    );

    const [expenseRegistryTotal, setExpenseRegistryTotal] = useState(0);
    useEffect(() => {
      if (reportType !== "EXPENSE_REGISTRY") {
        setExpenseRegistryTotal(0);
        return;
      }
      let cancelled = false;
      (async () => {
        const where: DbWhere = [
          { col: "date", op: ">=", val: startDate },
          { col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` },
        ];
        const term = listSearch.trim();
        const orWhere: DbWhere = term
          ? [
              { col: "description", op: "LIKE", val: `%${term}%` },
              { col: "category", op: "LIKE", val: `%${term}%` },
              { col: "paidTo", op: "LIKE", val: `%${term}%` },
            ]
          : [];
        const rows = await db.expenses.query({ where, orWhere });
        if (!cancelled) {
          setExpenseRegistryTotal(
            (rows as Expense[]).reduce((s, e) => s + (Number(e.amount) || 0), 0)
          );
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [reportType, startDate, endDate, listSearch, dataVersion]);

    const {
    pageItems: clientTablePageItems,
    pageSize: clientTablePageSize,
    setPageSize: setClientTablePageSize,
    total: clientTableTotal,
    shown: clientTableShown,
    hasMore: clientTableHasMore,
    loadMore: clientTableLoadMore,
  } = usePagination(dbPagedReport ? [] : (displayContent as any[]));

  const tablePageItems = dbPagedReport ? dbTablePageItems : clientTablePageItems;
  const tablePageSize = dbPagedReport ? dbTablePageSize : clientTablePageSize;
  const setTablePageSize = dbPagedReport ? setDbTablePageSize : setClientTablePageSize;
  const tableTotal = dbPagedReport ? dbTableTotal : clientTableTotal;
  const tableShown = dbPagedReport ? dbTableShown : clientTableShown;
  const tableHasMore = dbPagedReport ? dbTableHasMore : clientTableHasMore;
  const tableLoadMore = dbPagedReport ? dbTableLoadMore : clientTableLoadMore;

  const {
    pageItems: monthlyPageItems,
    pageSize: monthlyPageSize,
    setPageSize: setMonthlyPageSize,
    total: monthlyTotal,
    shown: monthlyShown,
    hasMore: monthlyHasMore,
    loadMore: monthlyLoadMore,
  } = usePagination(filteredMonthlyRows);

  const handleDownloadCsv = async () => {
    if (!reportType) return;
    try {
      const stamp = `${startDate}_to_${endDate}`;
      const exportRows =
        dbPagedReport && tablePageItems.length
          ? tablePageItems
          : (displayContent as any[]);
      if (reportType === "PROFIT_LOSS") {
        downloadCsv(`P_L_${stamp}`, ["Line", "Amount_AFN"], [
          ["Gross sales", stats.grossRevenue],
          ["Customer returns", stats.returnValue],
          ["Net revenue", stats.netRevenue],
          ["COGS", stats.cogs],
          ["Trading profit", stats.tradingProfit],
          ["Operating expenses", stats.totalExpenses],
          ["Payroll", stats.totalSalaries],
          ["Pure profit", stats.pureProfit],
          ["External capital", stats.externalCapitalReceived]
        ]);
      } else if (reportType === "ENTERPRISE_OVERVIEW") {
        downloadCsv(`Liquidity_${stamp}`, ["Metric", "Amount_AFN"], [
          ["Inventory valuation", stats.totalStockValue],
          ["Accounts receivable", stats.moneyInMarket],
          ["Cash from sales & receipts", stats.totalCollected],
          ["External capital", stats.externalCapitalReceived],
          ["Total cash-type inflows", stats.totalLiquidityInflows]
        ]);
      } else if (reportType === "CAPITAL_POSITION" && capitalPosition) {
        downloadCsv(`CapitalPosition_as_of_${endDate}`, ["Metric", "Amount_AFN"], [
          ["Stock value", capitalPosition.stockValue],
          ["Money to collect (customers)", capitalPosition.receivables],
          ["Money to pay (suppliers)", capitalPosition.supplierPayables],
          ["Unpaid staff salaries", capitalPosition.salaryDues],
          ["Cash on hand", capitalPosition.cashOnHand],
          ["Someone else's capital", capitalPosition.externalCapital],
          ["Owner capital injected", capitalPosition.ownerCapitalInjected],
          ["Total assets", capitalPosition.totalAssets],
          ["Your net capital", capitalPosition.ownCapital],
        ]);
      } else if (reportType === "ZAKAT" && zakatAssessment) {
        downloadCsv(`Zakat_as_of_${endDate}`, ["Line", "Amount_AFN"], [
          ["Cash on hand", zakatAssessment.cashOnHand],
          ["Inventory (market/sale value)", zakatAssessment.inventoryMarketValue],
          ["Receivables", zakatAssessment.receivables],
          ["Zakatable assets", zakatAssessment.zakatableAssets],
          ["Supplier dues", zakatAssessment.supplierPayables],
          ["Salary dues", zakatAssessment.salaryDues],
          ["Others' capital", zakatAssessment.externalCapital],
          ["Deductions", zakatAssessment.deductions],
          ["Zakat base", zakatAssessment.zakatBase],
          ["Nisab used", zakatAssessment.nisabUsed],
          ["Nisab met", zakatAssessment.nisabMet ? "YES" : "NO"],
          ["Zakat due (2.5%)", Math.round(zakatAssessment.zakatDue * 100) / 100],
        ]);
      } else if (reportType === "MONTHLY_OPERATIONS") {
        downloadCsv(
          `Monthly_${stamp}`,
          ["Month", "Sales", "Profit", "Expenses", "Collected", "Purchases", "Returns", "Expiry_Cost"],
          monthlyRows.map((r) => [
            r.label,
            r.sales,
            r.profit,
            r.expenses,
            r.collected,
            r.purchases,
            r.returns,
            Math.round(r.expiryValue)
          ])
        );
      } else if (reportType === "INVOICE_PROFIT") {
        downloadCsv(
          `InvoiceProfit_${stamp}`,
          ["Doc", "Customer", "Date", "Revenue", "Cost", "Profit"],
          exportRows.map((item: any) => [
            item.id,
            item.customerName || "",
            new Date(item.date).toISOString().slice(0, 10),
            item.revenue ?? item.totalAmount,
            item.cost,
            item.profit,
          ])
        );
      } else if (reportType === "PRODUCT_AUDIT") {
        downloadCsv(
          `Products_${stamp}`,
          ["Name", "SKU", "Brand", "Stock", "Sold_Net", "Value_AFN"],
          exportRows.map((item: any) => [
            item.name,
            item.skuCode || "",
            item.company || "",
            item.stock,
            item.sold,
            item.value,
          ])
        );
      } else if (reportType === "CUSTOMER_AUDIT") {
        downloadCsv(
          `Customers_${stamp}`,
          ["Name", "Phone", "Traded_Period", "Balance"],
          displayContent.map((item: any) => [
            item.name,
            item.phone || "",
            item.traded,
            item.balance,
          ])
        );
      } else if (reportType === "SUPPLIER_DUES") {
        downloadCsv(
          `SupplierDues_${stamp}`,
          ["Supplier", "Balance_AFN"],
          displayContent.map((item: any) => [
            item.name,
            supplierBalances[item.id!] ?? 0,
          ])
        );
      } else if (reportType === "PAYMENT_JOURNAL") {
        downloadCsv(
          `Payments_${stamp}`,
          ["Id", "Type", "Party", "Date", "Amount"],
          exportRows.map((item: any) => [
            item.id,
            item.type,
            item.customerName || item.companyName || item.employeeName || "",
            new Date(item.date).toISOString().slice(0, 10),
            item.paidAmount,
          ])
        );
      } else if (reportType === "EXPENSE_REGISTRY") {
        downloadCsv(
          `Expenses_${stamp}`,
          ["Description", "Category", "Date", "Amount"],
          exportRows.map((item: any) => [
            item.description,
            item.category,
            new Date(item.date).toISOString().slice(0, 10),
            item.amount,
          ])
        );
      } else if (reportType === "EMPLOYEE_PAYROLL") {
        downloadCsv(
          `Payroll_${stamp}`,
          ["Employee", "Monthly_Salary", "Paid_In_Period", "Due"],
          displayContent.map((item: any) => [
            item.name,
            item.salary,
            item.paidInPeriod,
            item.due,
          ])
        );
      } else if (reportType === "EMPLOYEE_SALES") {
        downloadCsv(
          `StaffSales_${stamp}`,
          ["Employee", "Invoices", "Avg_Ticket", "Total"],
          displayContent.map((item: any) => [
            item.name,
            item.count,
            Math.round(item.avg),
            item.total,
          ])
        );
      }
      showSuccess("CSV exported", "Spreadsheet file downloaded.");
    } catch (err: any) {
      console.error(err);
      showError("CSV failed", err?.message || "Could not export CSV.");
    }
  };

  const inputStyle = { colorScheme: darkMode ? 'dark' : 'light' };

  /* P&L: whole page scrolls. Other reports: main scroll until list panel hits top, then panel scrolls. */
  const profitLossFullPageScroll = reportType === 'PROFIT_LOSS';
  const isWealthReport =
    reportType === "CAPITAL_POSITION" || reportType === "ZAKAT";
  const isTableReport = !!reportType && [
    "INVOICE_PROFIT",
    "PRODUCT_AUDIT",
    "CUSTOMER_AUDIT",
    "EXPENSE_REGISTRY",
    "PAYMENT_JOURNAL",
    "EMPLOYEE_PAYROLL",
    "EMPLOYEE_SALES",
    "SUPPLIER_DUES",
  ].includes(reportType);
  const isMonthlyReport = reportType === "MONTHLY_OPERATIONS";
  const hasListSearch = isTableReport || isMonthlyReport;

  const listSearchPlaceholder =
    reportType === "INVOICE_PROFIT"
      ? "Search invoice # or customer…"
      : reportType === "PRODUCT_AUDIT"
        ? "Search product, brand, or SKU…"
        : reportType === "CUSTOMER_AUDIT"
          ? "Search customer or phone…"
          : reportType === "EXPENSE_REGISTRY"
            ? "Search expense, category, or recipient…"
            : reportType === "PAYMENT_JOURNAL"
              ? "Search payment, party, or notes…"
              : reportType === "EMPLOYEE_PAYROLL" || reportType === "EMPLOYEE_SALES"
                ? "Search employee…"
                : reportType === "SUPPLIER_DUES"
                  ? "Search supplier…"
                  : reportType === "MONTHLY_OPERATIONS"
                    ? "Search month…"
                    : "Search…";

  const stickyListPanelClass = `p-3 sm:p-4 overflow-y-auto overscroll-contain custom-scrollbar max-h-full min-h-0 print:max-h-none print:overflow-visible ${
    darkMode ? "bg-[#0a0c10]" : "bg-white"
  }`;
  /** Extra bottom padding so Zakat / Capital footer content clears the scroll clip. */
  const wealthReportPanelClass = `p-3 sm:p-4 pb-28 sm:pb-32 overflow-y-auto overscroll-contain custom-scrollbar max-h-full min-h-0 print:max-h-none print:overflow-visible ${
    darkMode ? "bg-[#0a0c10]" : "bg-white"
  }`;
  const tableReportShellClass = `flex flex-col min-h-0 max-h-full print:max-h-none ${
    darkMode ? "bg-[#0a0c10]" : "bg-white"
  }`;
  const tableReportScrollClass = `p-3 sm:p-4 overflow-y-auto overscroll-contain custom-scrollbar flex-1 min-h-0 print:overflow-visible print:max-h-none`;

  if (!reportType) {
    return <Navigate to="/reports" replace />;
  }

  return (
    <div className="w-full flex flex-col space-y-3 sm:space-y-4 pb-4">
      {/* Page toolbar — shrink-0 */}
      <div
        className={`no-print shrink-0 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 ${
          darkMode ? "border-gray-800/80 bg-[#0a0c10]/80" : "border-gray-200 bg-white/80 shadow-sm"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-start gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/reports")}
              className={`mt-0.5 p-2 rounded-xl shrink-0 ${
                darkMode ? "bg-gray-800 text-gray-300 hover:text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900"
              }`}
              title="All reports"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <h2
                className={`text-sm sm:text-base font-bold tracking-tight uppercase truncate ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {reportNames[reportType]}
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {hasListSearch && (
              <div className="relative flex-1 min-w-[180px] sm:min-w-[220px] max-w-md">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={listSearchPlaceholder}
                  className={`w-full min-h-[2.5rem] pl-8 pr-3 rounded-xl text-xs font-bold outline-none border ${
                    darkMode
                      ? "bg-[#14171c] border-gray-700 text-white placeholder:text-gray-600"
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                  }`}
                />
              </div>
            )}

            <div
              className={`flex flex-1 sm:flex-initial items-center gap-1.5 min-h-[2.5rem] rounded-xl border px-2 ${
                darkMode ? "border-gray-700 bg-[#14171c]" : "border-gray-200 bg-gray-50"
              }`}
            >
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
                aria-label="Start date"
                className={`min-w-0 flex-1 bg-transparent px-1 py-2 outline-none text-[11px] sm:text-xs font-bold ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              />
              <span className="text-gray-400 text-[10px] font-bold px-0.5">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
                aria-label="End date"
                className={`min-w-0 flex-1 bg-transparent px-1 py-2 outline-none text-[11px] sm:text-xs font-bold ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => window.print());
                  });
                }}
                title="Print"
                className={`inline-flex items-center justify-center gap-1.5 min-h-[2.5rem] px-3 rounded-xl border text-xs font-bold transition-colors ${
                  darkMode
                    ? "border-gray-600 text-gray-200 hover:bg-gray-800"
                    : "border-gray-300 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Printer size={16} />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isExporting}
                title="Export PDF"
                className="inline-flex items-center justify-center gap-1.5 min-h-[2.5rem] px-3 rounded-xl bg-red-600 text-white text-xs font-bold shadow-md hover:bg-red-500 disabled:opacity-60 transition-colors"
              >
                {isExporting ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                title="Export CSV"
                className={`inline-flex items-center justify-center gap-1.5 min-h-[2.5rem] px-3 rounded-xl border text-xs font-bold transition-colors ${
                  darkMode
                    ? "border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10"
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                <Table2 size={16} />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`print:hidden rounded-2xl border flex flex-col overflow-hidden ${
          darkMode ? "bg-[#0a0c10] border-gray-800" : "bg-white border-gray-100 shadow-sm"
        }`}
      >
         <div className="px-4 py-3 border-b border-gray-800/10 flex justify-between items-center gap-3 flex-shrink-0">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
              {isWealthReport
                ? `As of ${new Date(endDate).toLocaleDateString()}`
                : `${new Date(startDate).toLocaleDateString()} — ${new Date(endDate).toLocaleDateString()}`}
            </p>
         </div>

            {profitLossFullPageScroll && (
            <div className="p-4 sm:p-5">
              <div className="w-full space-y-5">
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="space-y-2">
                       <h3 className={`text-[10px] font-black uppercase tracking-widest pb-2 border-b border-gray-800/10 ${darkMode ? 'text-green-500' : 'text-green-600'}`}>Income</h3>
                       <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-800/5">
                             <tr><td className="py-2.5 font-bold text-gray-500 text-xs">Gross sales</td><td className={`py-2.5 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {stats.grossRevenue.toLocaleString()}</td></tr>
                             <tr><td className="py-2.5 font-bold text-gray-500 text-xs">Customer returns</td><td className="py-2.5 text-right font-bold text-red-500">− AFN {stats.returnValue.toLocaleString()}</td></tr>
                             <tr className="bg-gray-500/5"><td className="py-2.5 px-2 font-bold text-xs text-gray-400">Net revenue</td><td className={`py-2.5 px-2 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {stats.netRevenue.toLocaleString()}</td></tr>
                          </tbody>
                       </table>
                    </div>
                    <div className="space-y-2">
                       <h3 className={`text-[10px] font-black uppercase tracking-widest pb-2 border-b border-gray-800/10 ${darkMode ? 'text-red-500' : 'text-red-600'}`}>Costs</h3>
                       <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-800/5">
                             <tr><td className="py-2.5 font-bold text-gray-500 text-xs">Cost of goods sold</td><td className={`py-2.5 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {stats.cogs.toLocaleString()}</td></tr>
                             <tr><td className="py-2.5 font-bold text-gray-500 text-xs">Operating expenses</td><td className="py-2.5 text-right font-bold text-red-500">AFN {stats.totalExpenses.toLocaleString()}</td></tr>
                             <tr><td className="py-2.5 font-bold text-gray-500 text-xs">Staff payroll</td><td className="py-2.5 text-right font-bold text-red-500">AFN {stats.totalSalaries.toLocaleString()}</td></tr>
                          </tbody>
                       </table>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-dashed border-gray-800/10">
                    <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-black/20 border-gray-800' : 'bg-gray-50 border-gray-100'} flex justify-between items-center`}>
                       <div><p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Trading profit</p><h4 className="text-xl font-black text-indigo-500">AFN {stats.tradingProfit.toLocaleString()}</h4><p className="text-[9px] text-gray-500 mt-1">Revenue after product cost</p></div>
                    </div>
                    <div className={`p-4 rounded-2xl ${stats.pureProfit >= 0 ? 'bg-green-600' : 'bg-red-600'} text-white flex justify-between items-center`}>
                       <div><p className="text-[10px] font-bold uppercase mb-1 opacity-80">Net profit</p><h4 className="text-xl font-black">AFN {stats.pureProfit.toLocaleString()}</h4><p className="text-[9px] opacity-80 mt-1">After expenses &amp; payroll</p></div>
                    </div>
                 </div>

                 <div className={`p-4 rounded-2xl border ${darkMode ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-emerald-200 bg-emerald-50/80'}`}>
                    <p className={`text-[10px] font-bold uppercase mb-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>External capital (not included in profit)</p>
                    <p className={`text-lg font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>+ AFN {stats.externalCapitalReceived.toLocaleString()}</p>
                 </div>
              </div>
            </div>
            )},

            {!profitLossFullPageScroll && isMonthlyReport && (
              <div className={stickyListPanelClass}>
                <p
                  className={`text-[10px] font-medium mb-3 px-1 ${
                    darkMode ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  Monthly totals for the selected dates. Profit is after product cost, expenses, and payroll.
                </p>
                <div className="overflow-x-auto min-h-0">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr
                        className={`text-[9px] font-black uppercase border-b border-gray-800/10 ${
                          darkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        <th className="py-2 px-3 text-left whitespace-nowrap">Month</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">Sales</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">Profit</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">Expenses</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">Collected</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">Purchases</th>
                        <th className="py-2 px-2 text-right whitespace-nowrap">Returns</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Expiry value</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? "divide-gray-800/30" : "divide-gray-50"}`}>
                      {monthlyPageItems.map((row) => (
                        <tr
                          key={row.ym}
                          className={`font-bold ${darkMode ? "text-gray-200" : "text-gray-900"}`}
                        >
                          <td className="py-3 px-3 whitespace-nowrap">{row.label}</td>
                          <td className="py-3 px-2 text-right tabular-nums">{row.sales.toLocaleString()}</td>
                          <td
                            className={`py-3 px-2 text-right tabular-nums ${
                              row.profit >= 0 ? "text-emerald-500" : "text-red-500"
                            }`}
                          >
                            {row.profit.toLocaleString()}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums text-amber-500/90">
                            {row.expenses.toLocaleString()}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums text-cyan-500/90">
                            {row.collected.toLocaleString()}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums">{row.purchases.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right tabular-nums text-orange-400/90">
                            {row.returns.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums text-violet-400/90">
                            {Math.round(row.expiryValue).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {monthlyPageItems.length === 0 && (
                    <p className="py-16 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">
                      No months in selected period
                    </p>
                  )}
                </div>
                <PaginationBar
          darkMode={darkMode}
          total={monthlyTotal}
          shown={monthlyShown}
          hasMore={monthlyHasMore}
          onLoadMore={monthlyLoadMore}
          pageSize={monthlyPageSize}
          onPageSizeChange={setMonthlyPageSize}
        />
              </div>
            )},

            {!profitLossFullPageScroll && isTableReport && (
              <div className={tableReportShellClass}>
              <div className={tableReportScrollClass}>
              {reportType === 'EXPENSE_REGISTRY' && (
                <div
                  className={`mb-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border ${
                    darkMode
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-red-50 border-red-100 text-red-600'
                  }`}
                >
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Total</span>
                  <span className="text-xs font-black">AFN {expenseRegistryTotal.toLocaleString()}</span>
                </div>
              )}
              <div className="overflow-x-auto min-h-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={`text-[10px] font-black uppercase border-b border-gray-800/10 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <th className="py-2 px-3 sm:px-4">
                        {reportType === 'INVOICE_PROFIT' ? 'Invoice' :
                         reportType === 'PRODUCT_AUDIT' ? 'Product' :
                         reportType === 'CUSTOMER_AUDIT' ? 'Customer' :
                         reportType === 'EXPENSE_REGISTRY' ? 'Expense' :
                         reportType === 'PAYMENT_JOURNAL' ? 'Payment' :
                         reportType === 'EMPLOYEE_PAYROLL' || reportType === 'EMPLOYEE_SALES' ? 'Employee' :
                         reportType === 'SUPPLIER_DUES' ? 'Supplier' : 'Details'}
                      </th>
                      <th className="py-2 px-3">
                        {reportType === 'INVOICE_PROFIT' ? 'Customer' :
                         reportType === 'PRODUCT_AUDIT' ? 'Brand' :
                         reportType === 'CUSTOMER_AUDIT' ? 'Phone' :
                         reportType === 'EXPENSE_REGISTRY' ? 'Category' :
                         reportType === 'PAYMENT_JOURNAL' ? 'Type' :
                         reportType === 'EMPLOYEE_PAYROLL' ? 'Role' :
                         reportType === 'EMPLOYEE_SALES' ? 'Role' :
                         reportType === 'SUPPLIER_DUES' ? 'Origin' : 'Group'}
                      </th>
                      <th className="py-2 px-3 text-right">
                        {reportType === 'INVOICE_PROFIT' ? 'Revenue' :
                         reportType === 'PRODUCT_AUDIT' ? 'Sold' :
                         reportType === 'CUSTOMER_AUDIT' ? 'Traded' :
                         reportType === 'EMPLOYEE_PAYROLL' ? 'Salary' :
                         reportType === 'EMPLOYEE_SALES' ? 'Invoices' :
                         reportType === 'SUPPLIER_DUES' ? '—' : '—'}
                      </th>
                      <th className="py-2 px-3 text-right">
                        {reportType === 'INVOICE_PROFIT' ? 'Cost' :
                         reportType === 'PRODUCT_AUDIT' ? 'In stock' :
                         reportType === 'CUSTOMER_AUDIT' ? '—' :
                         reportType === 'EMPLOYEE_PAYROLL' ? 'Paid' :
                         reportType === 'EMPLOYEE_SALES' ? 'Avg ticket' :
                         reportType === 'SUPPLIER_DUES' ? '—' : '—'}
                      </th>
                      <th className="py-2 px-3 sm:px-4 text-right">
                        {reportType === 'INVOICE_PROFIT' ? 'Profit' :
                         reportType === 'PRODUCT_AUDIT' ? 'Stock value' :
                         reportType === 'CUSTOMER_AUDIT' ? 'Balance' :
                         reportType === 'EXPENSE_REGISTRY' ? 'Amount' :
                         reportType === 'PAYMENT_JOURNAL' ? 'Amount' :
                         reportType === 'EMPLOYEE_PAYROLL' ? 'Still due' :
                         reportType === 'EMPLOYEE_SALES' ? 'Total sales' :
                         reportType === 'SUPPLIER_DUES' ? 'Amount owed' : 'Amount'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-gray-800/30' : 'divide-gray-50'}`}>
                    {tablePageItems.map((item: any, i: number) => (
                      <tr key={item.id ?? i} className={`text-sm font-bold hover:bg-gray-500/5 transition-all ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                        <td className="py-2 px-3 sm:px-4 align-top">
                          <p className={`font-bold text-[13px] leading-snug ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.name || item.description || item.customerName || item.employeeName || `Doc #${item.id}`}</p>
                          <p className={`text-[10px] font-medium mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.date ? new Date(item.date).toLocaleDateString() : ''}{item.skuCode ? ` · ${item.skuCode}` : ''}</p>
                        </td>
                        <td className="py-2 px-3 align-top">
                           <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-500/10 text-gray-500'}`}>{item.category || item.company || item.role || item.type || item.phone || '—'}</span>
                        </td>
                        <td className={`py-2 px-3 text-right text-xs align-top ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          {reportType === 'INVOICE_PROFIT' ? `${item.totalAmount?.toLocaleString()}` : 
                           reportType === 'PRODUCT_AUDIT' ? `${item.sold}` : 
                           reportType === 'CUSTOMER_AUDIT' ? `${item.traded?.toLocaleString()}` : 
                           reportType === 'EMPLOYEE_PAYROLL' ? `${item.salary?.toLocaleString()}` : 
                           reportType === 'EMPLOYEE_SALES' ? `${item.count}` : 
                           '—'}
                        </td>
                        <td className={`py-2 px-3 text-right text-xs align-top ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          {reportType === 'INVOICE_PROFIT' ? `${item.cost?.toLocaleString()}` : 
                           reportType === 'PRODUCT_AUDIT' ? `${item.stock}` : 
                           reportType === 'EMPLOYEE_PAYROLL' ? `${item.paidInPeriod?.toLocaleString()}` : 
                           reportType === 'EMPLOYEE_SALES' ? `${item.avg?.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 
                           '—'}
                        </td>
                        <td className={`py-2 px-3 sm:px-4 text-right font-bold text-sm align-top ${(item.profit >= 0 || reportType === 'PRODUCT_AUDIT' || reportType === 'CUSTOMER_AUDIT' || reportType === 'EMPLOYEE_SALES') ? 'text-indigo-400' : 'text-red-400'}`}>
                           {reportType === 'PRODUCT_AUDIT' ? item.value?.toLocaleString() : 
                            reportType === 'CUSTOMER_AUDIT' ? item.balance?.toLocaleString() : 
                            reportType === 'EXPENSE_REGISTRY' ? item.amount?.toLocaleString() : 
                            reportType === 'PAYMENT_JOURNAL' ? item.paidAmount?.toLocaleString() : 
                            reportType === 'EMPLOYEE_PAYROLL' ? item.due?.toLocaleString() :
                            reportType === 'EMPLOYEE_SALES' ? item.total?.toLocaleString() :
                            reportType === 'SUPPLIER_DUES' ? supplierBalances[item.id!]?.toLocaleString() :
                            item.profit?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {tableTotal === 0 && (
                       <tr><td colSpan={5} className="py-16 text-center opacity-40"><p className="font-bold text-xs uppercase tracking-widest">No matching records</p></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
                {reportType === 'SUPPLIER_DUES' && (
                  <div className="mt-4 p-4 rounded-2xl bg-red-600 text-white flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase opacity-80 mb-1">Total amount owed to suppliers</p>
                      <h3 className="text-2xl font-black">AFN {supplierTotalDue.toLocaleString()}</h3>
                    </div>
                  </div>
                )}
              </div>
                <div className={`flex-shrink-0 px-3 sm:px-4 ${darkMode ? "bg-[#0a0c10]" : "bg-white"}`}>
                  <PaginationBar
                    darkMode={darkMode}
                    total={tableTotal}
                    shown={tableShown}
                    hasMore={tableHasMore}
                    onLoadMore={tableLoadMore}
                    pageSize={tablePageSize}
                    onPageSizeChange={setTablePageSize}
                  />
                </div>
              </div>
            )},

            {!profitLossFullPageScroll && reportType === 'ENTERPRISE_OVERVIEW' && (
              <div className={stickyListPanelClass}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                 <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-black/40 border-gray-800' : 'bg-gray-50 border-gray-100'}`}>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Stock value</p>
                    <h3 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {stats.totalStockValue.toLocaleString()}</h3>
                    <p className="text-[10px] text-gray-500 mt-1">Inventory at purchase cost</p>
                 </div>
                 <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-black/40 border-gray-800' : 'bg-gray-50 border-gray-100'}`}>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Customer balances</p>
                    <h3 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {stats.moneyInMarket.toLocaleString()}</h3>
                    <p className="text-[10px] text-gray-500 mt-1">Money customers still owe</p>
                 </div>
                 <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-black/40 border-gray-800' : 'bg-gray-50 border-gray-100'} md:col-span-2`}>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Cash in this period</p>
                    <h3 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>AFN {stats.totalLiquidityInflows.toLocaleString()}</h3>
                    <div className={`mt-3 space-y-1 text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                      <p>From sales &amp; receipts: <span className={darkMode ? 'text-gray-300' : 'text-gray-900'}>AFN {stats.totalCollected.toLocaleString()}</span></p>
                      <p>External capital: <span className="text-emerald-500">AFN {stats.externalCapitalReceived.toLocaleString()}</span></p>
                    </div>
                 </div>
              </div>
              </div>
            )}

            {!profitLossFullPageScroll && reportType === "CAPITAL_POSITION" && capitalPosition && (
              <div className={wealthReportPanelClass}>
                <p className={`text-[11px] font-medium mb-4 leading-relaxed ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  Snapshot of what the business holds and owes as of the end date. Cash is calculated from all registry cash in and out through that date.
                  Mark capital entries as owner vs someone else on the Capital screen so the split stays accurate.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Stock value", value: capitalPosition.stockValue, hint: "Inventory at cost", tone: "amber" },
                    { label: "To collect", value: capitalPosition.receivables, hint: "Customer balances", tone: "blue" },
                    { label: "To pay suppliers", value: capitalPosition.supplierPayables, hint: "Supplier dues", tone: "red" },
                    { label: "Cash on hand", value: capitalPosition.cashOnHand, hint: "Net cash from registry", tone: "cyan" },
                    { label: "Someone else's capital", value: capitalPosition.externalCapital, hint: "Partner / investor / lender", tone: "violet" },
                    { label: "Your net capital", value: capitalPosition.ownCapital, hint: "Assets − dues − others' capital", tone: "emerald" },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className={`p-4 rounded-2xl border ${
                        darkMode ? "bg-black/30 border-gray-800" : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{card.label}</p>
                      <h3
                        className={`text-xl font-black tabular-nums ${
                          card.tone === "red"
                            ? "text-red-500"
                            : card.tone === "emerald"
                              ? "text-emerald-500"
                              : darkMode
                                ? "text-white"
                                : "text-gray-900"
                        }`}
                      >
                        AFN {Math.round(card.value).toLocaleString()}
                      </h3>
                      <p className="text-[10px] text-gray-500 mt-1">{card.hint}</p>
                    </div>
                  ))}
                </div>
                <div className={`rounded-2xl border overflow-hidden ${darkMode ? "border-gray-800" : "border-gray-100"}`}>
                  <table className="w-full text-sm">
                    <tbody className={`divide-y ${darkMode ? "divide-gray-800/40" : "divide-gray-100"}`}>
                      <tr>
                        <td className="py-2.5 px-4 font-bold text-gray-500 text-xs">Total assets (cash + stock + receivables)</td>
                        <td className={`py-2.5 px-4 text-right font-black ${darkMode ? "text-white" : "text-gray-900"}`}>
                          AFN {Math.round(capitalPosition.totalAssets).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-bold text-gray-500 text-xs">Unpaid staff salaries</td>
                        <td className="py-2.5 px-4 text-right font-bold text-amber-500">
                          AFN {Math.round(capitalPosition.salaryDues).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-4 font-bold text-gray-500 text-xs">Owner capital injected (your deposits)</td>
                        <td className="py-2.5 px-4 text-right font-bold text-sky-500">
                          AFN {Math.round(capitalPosition.ownerCapitalInjected).toLocaleString()}
                        </td>
                      </tr>
                      <tr className={darkMode ? "bg-emerald-500/10" : "bg-emerald-50"}>
                        <td className="py-3 px-4 font-black text-xs uppercase text-emerald-600">Your actual capital</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600 text-base">
                          AFN {Math.round(capitalPosition.ownCapital).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!profitLossFullPageScroll && reportType === "ZAKAT" && zakatAssessment && (
              <div className={wealthReportPanelClass}>
                <div className={`mb-4 p-4 rounded-2xl border ${darkMode ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50/70"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl ${darkMode ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                      <Moon size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`text-sm font-black uppercase tracking-tight ${darkMode ? "text-emerald-300" : "text-emerald-800"}`}>
                        Business zakat (ʿurūḍ al-tijārah)
                      </h3>
                      <p className={`text-[11px] mt-1 leading-relaxed ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                        Classical net working-capital method: cash + trade stock at selling value + money customers owe,
                        minus debts you owe (suppliers, unpaid salaries, and others&apos; capital). Rate is{" "}
                        <strong>2.5%</strong> (1/40) when the base reaches nisab. Enter today&apos;s gold/silver price in AFN
                        so nisab is correct. Hawl (one lunar year) is for you to confirm outside this report.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`mb-4 p-3 rounded-2xl border flex flex-col sm:flex-row flex-wrap gap-3 ${darkMode ? "border-gray-800 bg-black/20" : "border-gray-100 bg-gray-50"}`}>
                  <label className="flex flex-col gap-1 min-w-[140px]">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Gold AFN / gram</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={goldPricePerGram ?? ""}
                      onChange={(e) => setGoldPricePerGram(e.target.value === "" ? 0 : Number(e.target.value))}
                      placeholder="e.g. 7500"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none ring-1 ${darkMode ? "bg-gray-900 text-white ring-gray-700" : "bg-white ring-gray-200"}`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 min-w-[140px]">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Silver AFN / gram</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={silverPricePerGram ?? ""}
                      onChange={(e) => setSilverPricePerGram(e.target.value === "" ? 0 : Number(e.target.value))}
                      placeholder="e.g. 90"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none ring-1 ${darkMode ? "bg-gray-900 text-white ring-gray-700" : "bg-white ring-gray-200"}`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 min-w-[160px]">
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Nisab basis</span>
                    <select
                      value={nisabBasis}
                      onChange={(e) => setNisabBasis(e.target.value === "GOLD" ? "GOLD" : "SILVER")}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none ring-1 ${darkMode ? "bg-gray-900 text-white ring-gray-700" : "bg-white ring-gray-200"}`}
                    >
                      <option value="SILVER">Silver ({NISAB_SILVER_GRAMS}g) — common for trade</option>
                      <option value="GOLD">Gold ({NISAB_GOLD_GRAMS}g)</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                  <div className={`rounded-2xl border overflow-hidden ${darkMode ? "border-gray-800" : "border-gray-100"}`}>
                    <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${darkMode ? "bg-gray-900 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                      Zakatable assets (+)
                    </div>
                    <table className="w-full text-sm">
                      <tbody className={`divide-y ${darkMode ? "divide-gray-800/40" : "divide-gray-100"}`}>
                        <tr>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-500">Cash on hand</td>
                          <td className={`py-2.5 px-4 text-right font-black ${darkMode ? "text-white" : "text-gray-900"}`}>
                            {Math.round(zakatAssessment.cashOnHand).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-500">
                            Trade stock (selling price)
                            <span className="block font-medium text-[9px] opacity-70">
                              Cost value: {Math.round(zakatAssessment.inventoryCostValue).toLocaleString()}
                            </span>
                          </td>
                          <td className={`py-2.5 px-4 text-right font-black ${darkMode ? "text-white" : "text-gray-900"}`}>
                            {Math.round(zakatAssessment.inventoryMarketValue).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-500">Collectible receivables</td>
                          <td className={`py-2.5 px-4 text-right font-black ${darkMode ? "text-white" : "text-gray-900"}`}>
                            {Math.round(zakatAssessment.receivables).toLocaleString()}
                          </td>
                        </tr>
                        <tr className={darkMode ? "bg-white/5" : "bg-gray-50"}>
                          <td className="py-2.5 px-4 text-xs font-black uppercase text-gray-500">Subtotal</td>
                          <td className="py-2.5 px-4 text-right font-black text-emerald-500">
                            {Math.round(zakatAssessment.zakatableAssets).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className={`rounded-2xl border overflow-hidden ${darkMode ? "border-gray-800" : "border-gray-100"}`}>
                    <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${darkMode ? "bg-gray-900 text-red-400" : "bg-red-50 text-red-700"}`}>
                      Deductible debts (−)
                    </div>
                    <table className="w-full text-sm">
                      <tbody className={`divide-y ${darkMode ? "divide-gray-800/40" : "divide-gray-100"}`}>
                        <tr>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-500">Supplier dues</td>
                          <td className="py-2.5 px-4 text-right font-black text-red-500">
                            {Math.round(zakatAssessment.supplierPayables).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-500">Unpaid salaries</td>
                          <td className="py-2.5 px-4 text-right font-black text-red-500">
                            {Math.round(zakatAssessment.salaryDues).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 text-xs font-bold text-gray-500">Someone else&apos;s capital</td>
                          <td className="py-2.5 px-4 text-right font-black text-red-500">
                            {Math.round(zakatAssessment.externalCapital).toLocaleString()}
                          </td>
                        </tr>
                        <tr className={darkMode ? "bg-white/5" : "bg-gray-50"}>
                          <td className="py-2.5 px-4 text-xs font-black uppercase text-gray-500">Subtotal</td>
                          <td className="py-2.5 px-4 text-right font-black text-red-500">
                            {Math.round(zakatAssessment.deductions).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div className={`p-4 rounded-2xl border ${darkMode ? "border-gray-800 bg-black/30" : "border-gray-100 bg-white"}`}>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Zakat base</p>
                    <p className={`text-2xl font-black tabular-nums ${darkMode ? "text-white" : "text-gray-900"}`}>
                      AFN {Math.round(zakatAssessment.zakatBase).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">Assets − debts</p>
                  </div>
                  <div className={`p-4 rounded-2xl border ${darkMode ? "border-gray-800 bg-black/30" : "border-gray-100 bg-white"}`}>
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Nisab ({zakatAssessment.nisabBasis === "GOLD" ? "gold" : "silver"})
                    </p>
                    <p className={`text-2xl font-black tabular-nums ${darkMode ? "text-white" : "text-gray-900"}`}>
                      AFN {Math.round(zakatAssessment.nisabUsed).toLocaleString()}
                    </p>
                    <p className={`text-[10px] mt-1 font-bold ${zakatAssessment.nisabMet ? "text-emerald-500" : "text-amber-500"}`}>
                      {zakatAssessment.nisabUsed <= 0
                        ? "Enter metal prices above"
                        : zakatAssessment.nisabMet
                          ? "Threshold met — zakat due"
                          : "Below nisab — no zakat due"}
                    </p>
                  </div>
                  <div
                    className={`p-4 rounded-2xl text-white ${
                      zakatAssessment.zakatDue > 0 ? "bg-emerald-600" : darkMode ? "bg-gray-800" : "bg-gray-400"
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase mb-1 opacity-90">Zakat due ({(ZAKAT_RATE * 100).toFixed(1)}%)</p>
                    <p className="text-2xl font-black tabular-nums">
                      AFN {Math.round(zakatAssessment.zakatDue).toLocaleString()}
                    </p>
                    <p className="text-[10px] opacity-80 mt-1">Pay to eligible recipients</p>
                  </div>
                </div>

                <p className={`text-[10px] leading-relaxed pb-6 ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
                  Notes: Stock uses product sale price when set (else cost). Doubtful debts are not flagged in the registry — exclude them manually if needed.
                  Gold nisab ≈ {NISAB_GOLD_GRAMS}g ({Math.round(zakatAssessment.goldNisabValue).toLocaleString()} AFN) ·
                  Silver nisab ≈ {NISAB_SILVER_GRAMS}g ({Math.round(zakatAssessment.silverNisabValue).toLocaleString()} AFN).
                  This is a calculation aid; consult a local scholar for edge cases.
                </p>
              </div>
            )}

      </div>

      {/* Print / PDF: spreadsheet-style book (not on-screen UI) */}
      <PrintMountPortal>
        <SimpleBookReportPage
          ref={simplePdfRef}
          companyName={bizSettings?.companyName || "Spectrum Pro"}
          logoSrc={bizSettings?.logo}
          reportTitle={reportNames[reportType]}
          periodLine={
            isWealthReport
              ? `As of: ${endDate}`
              : `Reporting period: ${startDate} to ${endDate}`
          }
        >
          {reportType === "MONTHLY_OPERATIONS" ? (
            <table style={book.table}>
              <thead>
                <tr>
                  <th style={book.th}>Month</th>
                  <th style={{ ...book.th, ...book.thRight }}>Sales</th>
                  <th style={{ ...book.th, ...book.thRight }}>Profit</th>
                  <th style={{ ...book.th, ...book.thRight }}>Expenses</th>
                  <th style={{ ...book.th, ...book.thRight }}>Collected</th>
                  <th style={{ ...book.th, ...book.thRight }}>Purchases</th>
                  <th style={{ ...book.th, ...book.thRight }}>Returns</th>
                  <th style={{ ...book.th, ...book.thRight }}>Expiry (cost)</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row) => (
                  <tr key={row.ym}>
                    <td style={book.td}>{row.label}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{row.sales.toLocaleString()}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{row.profit.toLocaleString()}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{row.expenses.toLocaleString()}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{row.collected.toLocaleString()}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{row.purchases.toLocaleString()}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{row.returns.toLocaleString()}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {Math.round(row.expiryValue).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : ["PROFIT_LOSS", "ENTERPRISE_OVERVIEW", "CAPITAL_POSITION", "ZAKAT"].includes(reportType) ? (
            <table style={book.table}>
              <thead>
                <tr>
                  <th style={book.th}>Line item</th>
                  <th style={{ ...book.th, ...book.thRight, width: "32%" }}>Amount (AFN)</th>
                </tr>
              </thead>
              <tbody>
                {reportType === "PROFIT_LOSS" ? (
                  <>
                    <tr>
                      <td style={book.td}>Gross sales</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.grossRevenue.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Customer returns</td>
                      <td style={{ ...book.td, ...book.tdRight }}>({stats.returnValue.toLocaleString()})</td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, backgroundColor: "#f3f4f6", fontWeight: 700 }}>Net revenue</td>
                      <td style={{ ...book.td, ...book.tdRight, backgroundColor: "#f3f4f6", fontWeight: 700 }}>
                        {stats.netRevenue.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={book.td}>Cost of goods sold (COGS)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.cogs.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Operating expenses</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.totalExpenses.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Payroll (period)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.totalSalaries.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, backgroundColor: "#f3f4f6", fontWeight: 700 }}>Trading margin</td>
                      <td style={{ ...book.td, ...book.tdRight, backgroundColor: "#f3f4f6", fontWeight: 700 }}>
                        {stats.tradingProfit.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, fontWeight: 700 }}>Net profit (after expenses)</td>
                      <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                        {stats.pureProfit.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={book.td}>External capital (financing, not in profit)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.externalCapitalReceived.toLocaleString()}</td>
                    </tr>
                  </>
                ) : reportType === "CAPITAL_POSITION" && capitalPosition ? (
                  <>
                    <tr>
                      <td style={book.td}>Stock value</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.stockValue).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Money to collect (customers)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.receivables).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Money to pay (suppliers)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.supplierPayables).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Cash on hand</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.cashOnHand).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Someone else&apos;s capital</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.externalCapital).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Owner capital injected</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.ownerCapitalInjected).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Unpaid staff salaries</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(capitalPosition.salaryDues).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, backgroundColor: "#f3f4f6", fontWeight: 700 }}>Your net capital</td>
                      <td style={{ ...book.td, ...book.tdRight, backgroundColor: "#f3f4f6", fontWeight: 700 }}>
                        {Math.round(capitalPosition.ownCapital).toLocaleString()}
                      </td>
                    </tr>
                  </>
                ) : reportType === "ZAKAT" && zakatAssessment ? (
                  <>
                    <tr>
                      <td style={book.td}>Cash on hand</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(zakatAssessment.cashOnHand).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Inventory (selling value)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(zakatAssessment.inventoryMarketValue).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Receivables</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(zakatAssessment.receivables).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Less: supplier dues</td>
                      <td style={{ ...book.td, ...book.tdRight }}>({Math.round(zakatAssessment.supplierPayables).toLocaleString()})</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Less: unpaid salaries</td>
                      <td style={{ ...book.td, ...book.tdRight }}>({Math.round(zakatAssessment.salaryDues).toLocaleString()})</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Less: someone else&apos;s capital</td>
                      <td style={{ ...book.td, ...book.tdRight }}>({Math.round(zakatAssessment.externalCapital).toLocaleString()})</td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, backgroundColor: "#f3f4f6", fontWeight: 700 }}>Zakat base</td>
                      <td style={{ ...book.td, ...book.tdRight, backgroundColor: "#f3f4f6", fontWeight: 700 }}>
                        {Math.round(zakatAssessment.zakatBase).toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td style={book.td}>
                        Nisab ({zakatAssessment.nisabBasis === "GOLD" ? "gold" : "silver"})
                      </td>
                      <td style={{ ...book.td, ...book.tdRight }}>{Math.round(zakatAssessment.nisabUsed).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, fontWeight: 700 }}>
                        Zakat due {zakatAssessment.nisabMet ? "(2.5%)" : "(below nisab)"}
                      </td>
                      <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                        {Math.round(zakatAssessment.zakatDue).toLocaleString()}
                      </td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td style={book.td}>Inventory valuation (stock × cost)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.totalStockValue.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Accounts receivable (customer balances)</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.moneyInMarket.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>Cash from sales & receipts</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.totalCollected.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={book.td}>External / owner capital</td>
                      <td style={{ ...book.td, ...book.tdRight }}>{stats.externalCapitalReceived.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ ...book.td, backgroundColor: "#f3f4f6", fontWeight: 700 }}>Total cash-type inflows</td>
                      <td style={{ ...book.td, ...book.tdRight, backgroundColor: "#f3f4f6", fontWeight: 700 }}>
                        {stats.totalLiquidityInflows.toLocaleString()}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          ) : (
            <table style={book.table}>
              <thead>
                <tr>
                  <th style={book.th}>Description / reference</th>
                  <th style={book.th}>Category</th>
                  <th style={{ ...book.th, ...book.thRight }}>Amount (AFN)</th>
                </tr>
              </thead>
              <tbody>
                {(dbPagedReport ? tablePageItems : displayContent).map((item: any, i: number) => (
                  <tr key={i}>
                    <td style={book.td}>
                      {item.name ||
                        item.description ||
                        item.customerName ||
                        item.employeeName ||
                        `Doc #${item.id}`}
                    </td>
                    <td style={book.td}>{item.category || item.company || item.type || item.role || "—"}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {(() => {
                        if (reportType === "EMPLOYEE_PAYROLL") return Number(item.due) || 0;
                        if (reportType === "SUPPLIER_DUES") return supplierBalances[item.id!] || 0;
                        if (reportType === "INVOICE_PROFIT") return Number(item.profit) || 0;
                        if (reportType === "PRODUCT_AUDIT") return Number(item.value) || 0;
                        if (reportType === "CUSTOMER_AUDIT") return Number(item.balance) || 0;
                        if (reportType === "EMPLOYEE_SALES") return Number(item.total) || 0;
                        return (
                          Number(item.amount) ||
                          Number(item.paidAmount) ||
                          Number(item.totalAmount) ||
                          0
                        );
                      })().toLocaleString()}
                    </td>
                  </tr>
                ))},
                {reportType === "SUPPLIER_DUES" && (
                  <tr>
                    <td style={{ ...book.td, fontWeight: 700 }} colSpan={2}>
                      Total accounts payable
                    </td>
                    <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                      {supplierTotalDue.toLocaleString()}
                    </td>
                  </tr>
                )}
                {reportType === "EXPENSE_REGISTRY" && (
                  <tr>
                    <td style={{ ...book.td, fontWeight: 700 }} colSpan={2}>
                      Total expenses
                    </td>
                    <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                      {expenseRegistryTotal.toLocaleString()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </SimpleBookReportPage>
      </PrintMountPortal>
    </div>
  );
}
