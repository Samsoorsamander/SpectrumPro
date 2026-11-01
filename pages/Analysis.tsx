import React, { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { motion } from "framer-motion";
import { db } from "../db";
import { Product, Transaction, Expense } from "../types";
import { RefreshCw, Calendar } from "lucide-react";
import { computePeriodPnL, transactionCogs, inventoryValueFromProduct } from "../utils/periodPnL";
import { netCustomerSaleInvoiceAmount } from "../utils/saleAmounts";
import { useLazyScreenDataSync } from "../utils/dataSync";

const AnalysisCharts = React.lazy(
  () => import("../components/analysis/AnalysisCharts")
);

export default function Analysis({ darkMode }: { darkMode: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dateEnd = `${endDate}T23:59:59.999Z`;
      const [p, tx, ex] = await Promise.all([
        db.products.query({
          where: [{ col: "isDeleted", op: "=", val: 0 }],
          columns: ["id", "category", "stock", "minStockLevel", "purchasePrice"],
        }),
        db.transactionLogs.query({
          where: [
            { col: "isDeleted", op: "=", val: 0 },
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: dateEnd },
          ],
        }),
        db.expenses.query({
          where: [
            { col: "date", op: ">=", val: startDate },
            { col: "date", op: "<=", val: dateEnd },
          ],
          orderBy: "date",
          orderDir: "DESC",
        }),
      ]);
      setProducts(p as Product[]);
      setTransactions(tx as Transaction[]);
      setExpenses(ex as Expense[]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useLazyScreenDataSync(load);

  const scopedSales = useMemo(
    () => transactions.filter((t) => t.type === "SALE"),
    [transactions]
  );
  const scopedReturns = useMemo(
    () => transactions.filter((t) => t.type === "RETURN"),
    [transactions]
  );
  const scopedExp = useMemo(() => expenses, [expenses]);
  const scopedSalaries = useMemo(
    () => transactions.filter((t) => t.type === "SALARY"),
    [transactions]
  );

  const categoryPieData = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of scopedSales) {
      for (const item of t.items || []) {
        const prod = products.find((p) => p.id === item.productId);
        const cat = String(prod?.category ?? "Other");
        m.set(cat, (m.get(cat) || 0) + (Number(item.total) || 0));
      }
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scopedSales, products]);

  const inventoryBands = useMemo(() => {
    let highVal = 0,
      lowVal = 0,
      outVal = 0;
    let highN = 0,
      lowN = 0,
      outN = 0;
    for (const p of products) {
      const stock = Number(p.stock) || 0;
      const min = Math.max(0, Number(p.minStockLevel) || 0);
      const lineVal = inventoryValueFromProduct(p);
      if (stock <= 0) {
        outVal += lineVal;
        outN++;
      } else if (min > 0 && stock <= min) {
        lowVal += lineVal;
        lowN++;
      } else {
        highVal += lineVal;
        highN++;
      }
    }
    const total = highVal + lowVal + outVal || 1;
    return {
      rows: [
        { label: "Healthy stock (above min)", value: highVal, count: highN, color: "bg-emerald-500" },
        { label: "Low / at min level", value: lowVal, count: lowN, color: "bg-amber-500" },
        { label: "Out of stock", value: outVal, count: outN, color: "bg-gray-500" },
      ],
      total,
    };
  }, [products]);

  const dailyTrend = useMemo(() => {
    const days: { key: string; label: string }[] = [];
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    if (start > end) return [];
    const cap = 60;
    let cursor = new Date(start);
    let n = 0;
    while (cursor <= end && n < cap) {
      const key = cursor.toISOString().split("T")[0];
      days.push({
        key,
        label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      });
      cursor.setDate(cursor.getDate() + 1);
      n++;
    }
    return days.map(({ key, label }) => {
      const daySales = transactions.filter(
        (t) =>
          t.type === "SALE" &&
          !t.isDeleted &&
          new Date(t.date).toISOString().split("T")[0] === key
      );
      const dayReturns = transactions.filter(
        (t) =>
          t.type === "RETURN" &&
          !t.isDeleted &&
          new Date(t.date).toISOString().split("T")[0] === key
      );
      const revenue =
        daySales.reduce((s, t) => s + netCustomerSaleInvoiceAmount(t), 0) -
        dayReturns.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
      let cogs = 0;
      daySales.forEach((t) => {
        cogs += transactionCogs(t, products);
      });
      dayReturns.forEach((t) => {
        cogs -= transactionCogs(t, products);
      });
      const grossProfit = revenue - cogs;
      return { name: label, key, revenue: Math.round(revenue), profit: Math.round(grossProfit) };
    });
  }, [transactions, products, startDate, endDate]);

  const summary = useMemo(() => {
    const scopedTx = [...scopedSales, ...scopedReturns, ...scopedSalaries];
    const pnl = computePeriodPnL(scopedTx, scopedExp, products);
    return {
      netRevenue: pnl.netRevenue,
      tradingProfit: pnl.tradingProfit,
      pureProfit: pnl.pureProfit,
      cogs: pnl.cogs,
    };
  }, [scopedSales, scopedReturns, scopedExp, scopedSalaries, products]);

  const inputStyle = { colorScheme: darkMode ? "dark" : "light" };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3 text-gray-500">
        <RefreshCw className="animate-spin" size={24} />
        <span className="font-bold uppercase text-xs tracking-widest">Loading analytics…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className={`text-lg font-black uppercase tracking-tight ${darkMode ? "text-white" : "text-gray-900"}`}>
            Analysis
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${darkMode ? "border-gray-700 bg-gray-900/50" : "border-gray-200 bg-white"}`}>
            <Calendar size={14} className="text-gray-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
              className={`bg-transparent text-[11px] font-bold outline-none ${darkMode ? "text-white" : "text-gray-900"}`}
            />
            <span className="text-gray-500">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
              className={`bg-transparent text-[11px] font-bold outline-none ${darkMode ? "text-white" : "text-gray-900"}`}
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Net revenue (range)", value: summary.netRevenue, sub: "Sales − customer returns" },
          { label: "Trading profit (range)", value: summary.tradingProfit, sub: "Net revenue − COGS at cost" },
          { label: "Pure profit (range)", value: summary.pureProfit, sub: "After expenses & salaries in range" },
        ].map((k) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-2xl border ${darkMode ? "bg-[#1a1d23] border-gray-800" : "bg-white border-gray-200 shadow-sm"}`}
          >
            <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">{k.label}</p>
            <p className={`text-2xl font-black ${darkMode ? "text-white" : "text-gray-900"}`}>
              AFN {k.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-gray-500 mt-2 font-bold">{k.sub}</p>
          </motion.div>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
            <RefreshCw className="animate-spin" size={20} />
            <span className="font-bold uppercase text-xs tracking-widest">Loading charts…</span>
          </div>
        }
      >
        <AnalysisCharts
          darkMode={darkMode}
          startDate={startDate}
          endDate={endDate}
          categoryPieData={categoryPieData}
          inventoryBands={inventoryBands}
          dailyTrend={dailyTrend}
          productCount={products.length}
        />
      </Suspense>
    </div>
  );
}
