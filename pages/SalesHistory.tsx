import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Package,
  Printer,
  RefreshCw,
  X,
  ChevronDown,
  Search,
} from "lucide-react";
import { db } from "../db";
import { Transaction, TransactionItem, Customer, Product, SystemSettings } from "../types";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { SimpleBookReportPage, book } from "../components/SimpleBookReport";
import PrintMountPortal from "../components/PrintMountPortal";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { TX_LIST_COLUMNS } from "../utils/txListColumns";
import { useLedgerSync } from "../utils/dataSync";

interface FlattenedSaleItem extends TransactionItem {
  date: Date;
  customerName: string;
  customerId?: number;
  transactionId: number;
}

export default function SalesHistory({ darkMode }: { darkMode: boolean }) {
  const [listVersion, setListVersion] = useState(0);
  const bumpList = useCallback(() => setListVersion((v) => v + 1), []);
  useLedgerSync(bumpList);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productById, setProductById] = useState<Map<number, Product>>(new Map());

  const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
  const [listSearch, setListSearch] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<number | "All">("All");
  const [selectedProduct, setSelectedProduct] = useState<number | "All">("All");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [customerPickerSearch, setCustomerPickerSearch] = useState("");
  const [productPickerSearch, setProductPickerSearch] = useState("");
  const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
  const bookRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const settings = await db.settings.toArray();
        if (settings.length > 0) setBizSettings(settings[0]);
      } catch (err) {
        console.error("Sales History settings error:", err);
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  const loadCustomers = async (force = false) => {
    if (customersLoaded && !force) return;
    try {
      const allCustomers = await db.customers.query({
        where: [{ col: "isDeleted", op: "=", val: 0 }],
        orderBy: "name",
        orderDir: "ASC",
        columns: ["id", "name", "phone", "isDeleted"],
      });
      setCustomers(allCustomers as Customer[]);
      setCustomersLoaded(true);
    } catch (err) {
      console.error("Sales History customers error:", err);
    }
  };

  const loadProducts = async (force = false) => {
    if (productsLoaded && !force) return;
    try {
      const allProducts = await db.products.query({
        where: [{ col: "isDeleted", op: "=", val: 0 }],
        orderBy: "name",
        orderDir: "ASC",
        columns: ["id", "name", "skuCode", "barcode", "isDeleted"],
      });
      setProducts(allProducts as Product[]);
      setProductById(
        new Map(
          (allProducts as Product[])
            .filter((p) => p.id != null)
            .map((p) => [p.id!, p])
        )
      );
      setProductsLoaded(true);
      setListVersion((v) => v + 1);
    } catch (err) {
      console.error("Sales History products error:", err);
    }
  };

  useEffect(() => {
    if (showCustomerModal) loadCustomers();
  }, [showCustomerModal]);

  useEffect(() => {
    if (showProductModal || selectedProduct !== "All") loadProducts();
  }, [showProductModal, selectedProduct]);

  useEffect(() => {
    const term = (listSearch || searchQuery).trim();
    if (term) loadProducts();
  }, [listSearch, searchQuery]);

  const refreshAll = async () => {
    setListVersion((v) => v + 1);
    const settings = await db.settings.toArray();
    if (settings.length > 0) setBizSettings(settings[0]);
    if (showCustomerModal || selectedCustomer !== "All") await loadCustomers(true);
    if (showProductModal || selectedProduct !== "All" || (listSearch || searchQuery).trim()) {
      await loadProducts(true);
    }
  };

  const {
    pageItems: pageSales,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
  } = useDbPagination<Transaction>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "type", op: "=", val: "SALE" },
      ];
      if (selectedCustomer !== "All") {
        where.push({ col: "customerId", val: selectedCustomer });
      }
      if (selectedProduct !== "All") {
        where.push({
          col: "items",
          op: "LIKE",
          val: `%"productId":${selectedProduct}%`,
        });
      }

      const term = (listSearch || searchQuery).trim();
      const orWhere: DbWhere = [];
      if (term) {
        orWhere.push(
          { col: "customerName", op: "LIKE", val: `%${term}%` },
          { col: "notes", op: "LIKE", val: `%${term}%` },
          { col: "items", op: "LIKE", val: `%${term}%` }
        );
        if (/^\d+$/.test(term)) {
          orWhere.push({ col: "id", val: Number(term) });
        }
        const termLower = term.toLowerCase();
        let skuMatches = 0;
        for (const p of productById.values()) {
          if (skuMatches >= 40) break;
          const sku = (p.skuCode || "").toLowerCase();
          if (sku && sku.includes(termLower) && p.id != null) {
            orWhere.push({
              col: "items",
              op: "LIKE",
              val: `%"productId":${p.id}%`,
            });
            skuMatches += 1;
          }
        }
      }

      const [headers, count] = await Promise.all([
        db.transactionLogs.query({
          where,
          orWhere,
          orderBy: "date",
          orderDir: "DESC",
          limit: size,
          offset,
          columns: [...TX_LIST_COLUMNS, "items"],
        }),
        db.transactionLogs.countWhere(where, orWhere),
      ]);
      return { rows: headers as Transaction[], total: count };
    },
    [
      listSearch,
      searchQuery,
      selectedCustomer,
      selectedProduct,
      listVersion,
      productById,
    ],
    undefined,
    `sales-history:${listSearch}:${searchQuery}:${selectedCustomer}:${selectedProduct}:${listVersion}`
  );

  const pageItems = useMemo(() => {
    const term = (listSearch || searchQuery).trim().toLowerCase();
    const flattened: FlattenedSaleItem[] = [];
    for (const t of pageSales) {
      for (const item of t.items ?? []) {
        if (selectedProduct !== "All" && item.productId !== selectedProduct) {
          continue;
        }
        if (term) {
          const sku = (
            productById.get(item.productId)?.skuCode || ""
          ).toLowerCase();
          const matches =
            (t.customerName || "").toLowerCase().includes(term) ||
            (item.productName || "").toLowerCase().includes(term) ||
            String(t.id || "").includes(term) ||
            sku.includes(term);
          if (!matches) continue;
        }
        flattened.push({
          ...item,
          date: t.date,
          customerName: t.customerName || "General Cash",
          customerId: t.customerId,
          transactionId: t.id!,
        });
      }
    }
    return flattened;
  }, [pageSales, listSearch, searchQuery, selectedProduct, productById]);

  const activeCustomerName = useMemo(() => {
    if (selectedCustomer === "All") return "All Customers";
    return customers.find((c) => c.id === selectedCustomer)?.name || "Unknown";
  }, [selectedCustomer, customers]);

  const activeProductName = useMemo(() => {
    if (selectedProduct === "All") return "All Products";
    return products.find((p) => p.id === selectedProduct)?.name || "Unknown";
  }, [selectedProduct, products]);

  const pickerCustomers = useMemo(() => {
    const term = customerPickerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) || (c.phone || "").includes(term)
    );
  }, [customers, customerPickerSearch]);

  const pickerProducts = useMemo(() => {
    const term = productPickerSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.skuCode || "").toLowerCase().includes(term) ||
        (p.barcode || "").toLowerCase().includes(term)
    );
  }, [products, productPickerSearch]);

  if (!settingsLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <RefreshCw size={40} className="text-red-500 animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
          Accessing History...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4 w-full">
      <div className="no-print flex flex-col xl:flex-row gap-3 justify-end xl:items-center px-1">
        <div className="relative flex-1 min-w-[180px] max-w-md mr-auto">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search customer, product, SKU, or invoice #…"
            className={`w-full pl-8 pr-3 py-2.5 rounded-xl text-xs font-bold outline-none border ${
              darkMode
                ? "bg-[#1a1d23] border-gray-800 text-white placeholder:text-gray-600"
                : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 shadow-sm"
            }`}
          />
        </div>
        <div className="no-print flex flex-wrap items-center gap-4">
          <button
            onClick={() => {
              setCustomerPickerSearch("");
              setShowCustomerModal(true);
            }}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
              selectedCustomer !== "All"
                ? "bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20"
                : `${
                    darkMode
                      ? "bg-[#1a1d23] border-gray-800 text-gray-400 hover:text-white"
                      : "bg-white border-gray-200 text-gray-600 shadow-sm"
                  }`
            }`}
          >
            <User size={16} /> {activeCustomerName}
            <ChevronDown size={14} className="opacity-50" />
          </button>

          <button
            onClick={() => {
              setProductPickerSearch("");
              setShowProductModal(true);
            }}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${
              selectedProduct !== "All"
                ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                : `${
                    darkMode
                      ? "bg-[#1a1d23] border-gray-800 text-gray-400 hover:text-white"
                      : "bg-white border-gray-200 text-gray-600 shadow-sm"
                  }`
            }`}
          >
            <Package size={16} /> {activeProductName}
            <ChevronDown size={14} className="opacity-50" />
          </button>

          <button
            onClick={() => {
              setListSearch("");
              setSearchQuery("");
              refreshAll();
            }}
            className={`p-4 rounded-[20px] ${
              darkMode
                ? "bg-gray-800 text-gray-400 hover:text-white"
                : "bg-white shadow-sm border text-gray-500 hover:text-red-500 transition-colors"
            }`}
            title="Refresh"
          >
            <RefreshCw size={20} />
          </button>

          <button
            onClick={() => window.print()}
            className={`p-4 rounded-[20px] ${
              darkMode
                ? "bg-gray-800 text-gray-400"
                : "bg-white shadow-sm border text-gray-500 hover:text-red-500 transition-colors"
            }`}
          >
            <Printer size={20} />
          </button>
        </div>
      </div>

      <div
        className={`print:hidden rounded-[48px] border overflow-hidden transition-all flex flex-col ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800 shadow-2xl"
            : "bg-white shadow-xl border-gray-100"
        }`}
      >
        <div className="overflow-hidden flex-1">
          <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10">
                <tr
                  className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                    darkMode
                      ? "bg-[#1a1d23] text-gray-500"
                      : "bg-white text-gray-400"
                  } border-b border-gray-800/10`}
                >
                  <th className="py-6 px-10">Date & Ref</th>
                  <th className="py-6 px-4">Customer</th>
                  <th className="py-6 px-4">Product Sold</th>
                  <th className="py-6 px-4 text-center">Qty</th>
                  <th className="py-6 px-4 text-right">Unit Price</th>
                  <th className="py-6 px-10 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  darkMode ? "divide-gray-800/40" : "divide-gray-50"
                }`}
              >
                {pageItems.map((item, idx) => (
                  <tr
                    key={`${item.transactionId}-${item.productId}-${idx}`}
                    className={`group transition-all ${
                      darkMode ? "hover:bg-gray-800/30" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="py-6 px-10">
                      <p
                        className={`text-xs font-black ${
                          darkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {new Date(item.date).toLocaleDateString()}
                      </p>
                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-0.5">
                        Bill: #{item.transactionId}
                      </p>
                    </td>
                    <td className="py-6 px-4">
                      <p
                        className={`text-sm font-black ${
                          darkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {item.customerName}
                      </p>
                    </td>
                    <td className="py-6 px-4">
                      <p
                        className={`text-sm font-black uppercase ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.productName}
                      </p>
                    </td>
                    <td className="py-6 px-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          darkMode
                            ? "bg-gray-800 text-gray-400"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {item.quantity}
                      </span>
                    </td>
                    <td className="py-6 px-4 text-right">
                      <p
                        className={`text-sm font-black ${
                          darkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        AFN {Number(item.unitPrice || 0).toLocaleString()}
                      </p>
                    </td>
                    <td className="py-6 px-10 text-right">
                      <p className="text-sm font-black text-red-500">
                        AFN {Number(item.total || 0).toLocaleString()}
                      </p>
                    </td>
                  </tr>
                ))}
                {total === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-40 text-center opacity-30 italic font-black uppercase tracking-[0.4em]"
                    >
                      No sales history found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <PaginationBar
          darkMode={darkMode}
          total={total}
          shown={shown}
          hasMore={hasMore}
          onLoadMore={loadMore}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      </div>

      <AnimatePresence>
        {showCustomerModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCustomerModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-lg max-h-[80vh] rounded-[32px] border overflow-hidden flex flex-col ${
                darkMode
                  ? "bg-[#1a1d23] border-gray-800"
                  : "bg-white border-gray-100 shadow-2xl"
              }`}
            >
              <div className="p-6 border-b border-gray-800/10 flex justify-between items-center">
                <h3
                  className={`font-black uppercase tracking-widest text-sm ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Filter Customer
                </h3>
                <button onClick={() => setShowCustomerModal(false)}>
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="p-4 border-b border-gray-800/10">
                <input
                  value={customerPickerSearch}
                  onChange={(e) => setCustomerPickerSearch(e.target.value)}
                  placeholder="Search customers…"
                  className={`w-full px-4 py-3 rounded-2xl text-xs font-bold outline-none ${
                    darkMode
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-900"
                  }`}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <button
                  onClick={() => {
                    setSelectedCustomer("All");
                    setShowCustomerModal(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-black uppercase ${
                    selectedCustomer === "All"
                      ? "bg-red-500 text-white"
                      : darkMode
                        ? "hover:bg-gray-800 text-gray-400"
                        : "hover:bg-gray-50 text-gray-600"
                  }`}
                >
                  All Customers
                </button>
                {pickerCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c.id!);
                      setShowCustomerModal(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-black ${
                      selectedCustomer === c.id
                        ? "bg-red-500 text-white"
                        : darkMode
                          ? "hover:bg-gray-800 text-white"
                          : "hover:bg-gray-50 text-gray-900"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProductModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProductModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-lg max-h-[80vh] rounded-[32px] border overflow-hidden flex flex-col ${
                darkMode
                  ? "bg-[#1a1d23] border-gray-800"
                  : "bg-white border-gray-100 shadow-2xl"
              }`}
            >
              <div className="p-6 border-b border-gray-800/10 flex justify-between items-center">
                <h3
                  className={`font-black uppercase tracking-widest text-sm ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Filter Product
                </h3>
                <button onClick={() => setShowProductModal(false)}>
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="p-4 border-b border-gray-800/10">
                <input
                  value={productPickerSearch}
                  onChange={(e) => setProductPickerSearch(e.target.value)}
                  placeholder="Search products…"
                  className={`w-full px-4 py-3 rounded-2xl text-xs font-bold outline-none ${
                    darkMode
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-900"
                  }`}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <button
                  onClick={() => {
                    setSelectedProduct("All");
                    setShowProductModal(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-black uppercase ${
                    selectedProduct === "All"
                      ? "bg-blue-600 text-white"
                      : darkMode
                        ? "hover:bg-gray-800 text-gray-400"
                        : "hover:bg-gray-50 text-gray-600"
                  }`}
                >
                  All Products
                </button>
                {pickerProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p.id!);
                      setShowProductModal(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-black ${
                      selectedProduct === p.id
                        ? "bg-blue-600 text-white"
                        : darkMode
                          ? "hover:bg-gray-800 text-white"
                          : "hover:bg-gray-50 text-gray-900"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PrintMountPortal>
        <div className="hidden print:block" ref={bookRef}>
          <SimpleBookReportPage
            companyName={bizSettings?.companyName || "SpectrumPro"}
            reportTitle="Sales History"
            periodLine={`${activeCustomerName} · ${activeProductName}`}
          >
            <table style={book.table}>
              <thead>
                <tr>
                  <th style={book.th}>Date</th>
                  <th style={book.th}>Bill</th>
                  <th style={book.th}>Customer</th>
                  <th style={book.th}>Product</th>
                  <th style={{ ...book.th, ...book.thRight }}>Qty</th>
                  <th style={{ ...book.th, ...book.thRight }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, idx) => (
                  <tr key={`print-${item.transactionId}-${idx}`}>
                    <td style={book.td}>
                      {new Date(item.date).toLocaleDateString()}
                    </td>
                    <td style={book.td}>#{item.transactionId}</td>
                    <td style={book.td}>{item.customerName}</td>
                    <td style={book.td}>{item.productName}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>{item.quantity}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {Number(item.total || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SimpleBookReportPage>
        </div>
      </PrintMountPortal>
    </div>
  );
}
