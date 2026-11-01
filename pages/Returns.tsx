import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  Search,
  User,
  Package,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  X,
  Check,
  Building2,
  ShoppingBag,
  ArrowRightLeft,
  ShieldCheck,
  RefreshCw,
  Info,
} from "lucide-react";
import { db } from "../db";
import {
  Product,
  Customer,
  Company,
  Transaction,
  TransactionItem,
} from "../types";
import { recomputeProductCostsFromBatches, allocateCustomerReturnRestore, restoreSaleBatchAllocations } from "../batchFifo";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { useFeedback } from "../contexts/FeedbackContext";
import { useOpenNewFromQuery } from "../hooks/useOpenNewFromQuery";
import { computeCompanyBalance } from "../utils/ledgerBalances";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { PaginationBar } from "../components/ui/PaginationBar";
import { notifyInventoryChanged, notifyLedgerChanged } from "../utils/dataSync";
import { clearFormDraft, readFormDraft, writeFormDraft } from "../utils/formDraft";
import { SaveDraftButton } from "../components/ui/SaveDraftButton";

type ReturnMode = "CUSTOMER" | "SUPPLIER";
type ReturnItem = TransactionItem & {
  returnKey: string;
  availableQty: number;
  skuCode?: string;
};
type EntityRow = Customer | Company;

const ENTITY_PAGE_SIZE = 10;

export default function Returns({ darkMode }: { darkMode: boolean }) {
  const { showSuccess, showError } = useFeedback();
  const [returnMode, setReturnMode] = useState<ReturnMode>("CUSTOMER");

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const [productById, setProductById] = useState<Map<number, Product>>(new Map());
  const [purchasedItems, setPurchasedItems] = useState<ReturnItem[]>([]);
  const [returnCart, setReturnCart] = useState<ReturnItem[]>([]);

  const [showEntityModal, setShowEntityModal] = useState(false);
  const [entityModalSearch, setEntityModalSearch] = useState("");
  const [debouncedEntitySearch, setDebouncedEntitySearch] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { query: searchQuery } = useGlobalSearch();
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeBalance, setActiveBalance] = useState(0);
  const skipModeReset = useRef(false);

  const openNewReturn = () => {
    const draft = readFormDraft<{
      returnMode?: ReturnMode;
      customerId?: number;
      companyId?: number;
      returnCart?: ReturnItem[];
    }>("return");
    if (draft?.returnMode && draft.returnMode !== returnMode) {
      skipModeReset.current = true;
      setReturnMode(draft.returnMode);
    }
    setReturnCart(draft?.returnCart || []);
    setEntityModalSearch("");
    if (draft?.customerId) {
      void db.customers.get(draft.customerId).then((row) => {
        if (row) setSelectedCustomer(row as Customer);
      });
    }
    if (draft?.companyId) {
      void db.companies.get(draft.companyId).then((row) => {
        if (row) setSelectedCompany(row as Company);
      });
    }
    setShowEntityModal(!draft?.returnCart?.length);
  };

  useOpenNewFromQuery(openNewReturn);

  useEffect(() => {
    if (skipModeReset.current) {
      skipModeReset.current = false;
      return;
    }
    setSelectedCustomer(null);
    setSelectedCompany(null);
    setPurchasedItems([]);
    setReturnCart([]);
    setProductById(new Map());
  }, [returnMode]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedEntitySearch(entityModalSearch),
      150
    );
    return () => window.clearTimeout(t);
  }, [entityModalSearch]);

  useEffect(() => {
    const refreshContext = async () => {
      if (returnMode === "CUSTOMER" && selectedCustomer) {
        await loadHistoryItems(selectedCustomer.id!, "SALE");
        setActiveBalance(selectedCustomer.balance || 0);
        setReturnCart([]);
      } else if (returnMode === "SUPPLIER" && selectedCompany) {
        await loadSupplierBatchItems(selectedCompany);
        const bal = await calculateCompanyBalance(selectedCompany);
        setActiveBalance(bal);
        setReturnCart([]);
      }
    };
    refreshContext();
  }, [selectedCustomer, selectedCompany, returnMode]);

  const {
    pageItems: entityPageItems,
    pageSize: entityPageSize,
    setPageSize: setEntityPageSize,
    total: entityTotal,
    shown: entityShown,
    hasMore: entityHasMore,
    loadMore: entityLoadMore,
    loading: entityLoading,
  } = useDbPagination<EntityRow>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [{ col: "isDeleted", op: "=", val: 0 }];
      const term = debouncedEntitySearch.trim();
      if (returnMode === "CUSTOMER") {
        const orWhere: DbWhere = term
          ? [
              { col: "name", op: "LIKE", val: `%${term}%` },
              { col: "phone", op: "LIKE", val: `%${term}%` },
              { col: "address", op: "LIKE", val: `%${term}%` },
            ]
          : [];
        const [rows, count] = await Promise.all([
          db.customers.query({
            where,
            orWhere,
            orderBy: "name",
            orderDir: "ASC",
            limit: size,
            offset,
            columns: ["id", "name", "phone", "address", "balance", "isDeleted"],
          }),
          db.customers.countWhere(where, orWhere),
        ]);
        return { rows: rows as Customer[], total: count };
      }
      const orWhere: DbWhere = term
        ? [
            { col: "name", op: "LIKE", val: `%${term}%` },
            { col: "phone", op: "LIKE", val: `%${term}%` },
            { col: "email", op: "LIKE", val: `%${term}%` },
            { col: "contactPerson", op: "LIKE", val: `%${term}%` },
          ]
        : [];
      const [rows, count] = await Promise.all([
          db.companies.query({
            where,
            orWhere,
            orderBy: "name",
            orderDir: "ASC",
            limit: size,
            offset,
            columns: ["id", "name", "phone", "contactPerson", "isDeleted"],
          }),
        db.companies.countWhere(where, orWhere),
      ]);
      return { rows: rows as Company[], total: count };
    },
    [showEntityModal, returnMode, debouncedEntitySearch],
    ENTITY_PAGE_SIZE,
    showEntityModal
      ? `returns-entity:${returnMode}:${debouncedEntitySearch}`
      : undefined
  );

  const calculateCompanyBalance = async (company: Company) => {
    const history = await db.transactionLogs
      .where("companyId")
      .equals(company.id!)
      .toArray();
    return computeCompanyBalance(company.openingBalance, history);
  };

  const loadHistoryItems = async (id: number, type: "SALE" | "PURCHASE") => {
    const field = type === "SALE" ? "customerId" : "companyId";
    const relevantTypes =
      type === "SALE" ? ["SALE", "RETURN"] : ["PURCHASE", "PURCHASE_RETURN"];
    const logs = (await db.transactionLogs.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        { col: field, val: id },
        { col: "type", op: "IN", val: relevantTypes },
      ],
      orderBy: "date",
      orderDir: "DESC",
    })) as Transaction[];

    const netTradedQty: Record<number, { item: TransactionItem; qty: number }> =
      {};
    logs.forEach((log) => {
      const isBaseType = log.type === type;
      const isReturnType =
        (type === "SALE" && log.type === "RETURN") ||
        (type === "PURCHASE" && log.type === "PURCHASE_RETURN");
      (log.items ?? []).forEach((item) => {
        if (!netTradedQty[item.productId]) {
          netTradedQty[item.productId] = { item: { ...item }, qty: 0 };
        }
        if (isBaseType) netTradedQty[item.productId].qty += item.quantity;
        else if (isReturnType)
          netTradedQty[item.productId].qty -= item.quantity;
      });
    });

    const productIds = Object.keys(netTradedQty).map(Number);
    const productMap = new Map<number, Product>();
    if (productIds.length) {
      const prods = (await db.products.query({
        where: [
          { col: "isDeleted", op: "=", val: 0 },
          { col: "id", op: "IN", val: productIds },
        ],
        columns: [
          "id",
          "name",
          "skuCode",
          "purchasePrice",
          "salePrice",
          "unit",
          "isDeleted",
        ],
      })) as Product[];
      for (const p of prods) {
        if (p.id != null) productMap.set(p.id, p);
      }
    }
    setProductById(productMap);

    const list: ReturnItem[] = Object.values(netTradedQty)
      .filter((entry) => entry.qty > 0)
      .map((entry) => {
        const qty = entry.qty;
        return {
          ...entry.item,
          quantity: qty,
          total: qty * (Number(entry.item.unitPrice) || 0),
          availableQty: qty,
          returnKey: `P-${entry.item.productId}`,
          skuCode: productMap.get(entry.item.productId)?.skuCode,
        };
      });
    setPurchasedItems(list);
  };

  const loadSupplierBatchItems = async (company: Company) => {
    const supplierProducts = (await db.products.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "company", val: company.name },
      ],
      columns: [
        "id",
        "name",
        "skuCode",
        "company",
        "purchasePrice",
        "salePrice",
        "unit",
        "expiryDate",
        "isDeleted",
      ],
    })) as Product[];
    const map = new Map<number, Product>(
      supplierProducts.filter((p) => p.id != null).map((p) => [p.id!, p])
    );
    setProductById(map);
    if (map.size === 0) {
      setPurchasedItems([]);
      return;
    }
    const productIds = [...map.keys()];
    const batches = await db.productBatches.query({
      where: [{ col: "productId", op: "IN", val: productIds }],
      orderBy: "productId",
      orderDir: "ASC",
    });
    const rows: ReturnItem[] = batches
      .filter((b) => map.has(b.productId) && (Number(b.quantity) || 0) > 0.00001)
      .map((b) => {
        const product = map.get(b.productId)!;
        const qty = Number(b.quantity) || 0;
        const unitPrice =
          Number(b.unitCost) || Number(product.purchasePrice) || 0;
        return {
          productId: b.productId,
          productName: product.name,
          quantity: qty,
          unitPrice,
          itemDiscount: 0,
          total: qty * unitPrice,
          unit: product.unit,
          batchId: b.id,
          batchNumber: b.batchNumber || "",
          salePrice: Number(b.salePrice) || Number(product.salePrice) || 0,
          expiryDate: b.expiryDate || product.expiryDate || "",
          availableQty: qty,
          skuCode: product.skuCode,
          returnKey: `B-${b.id}`,
        };
      })
      .sort((a, b) => {
        const pn = a.productName.localeCompare(b.productName);
        if (pn !== 0) return pn;
        return String(a.batchNumber || "").localeCompare(
          String(b.batchNumber || "")
        );
      });
    setPurchasedItems(rows);
  };

  const addToReturnCart = (item: ReturnItem) => {
    const existing = returnCart.find((r) => r.returnKey === item.returnKey);
    if (existing) {
      if (existing.quantity < item.availableQty) {
        updateReturnQuantity(item.returnKey, existing.quantity + 1);
      } else {
        showError(
          "Quantity limit",
          `Maximum returnable quantity (${item.availableQty}) reached for this line.`
        );
      }
    } else {
      setReturnCart([
        ...returnCart,
        { ...item, quantity: 1, total: Number(item.unitPrice) || 0 },
      ]);
    }
  };

  const updateReturnQuantity = (returnKey: string, newQty: number) => {
    const historyItem = purchasedItems.find((p) => p.returnKey === returnKey);
    if (!historyItem) return;

    const qty = Math.min(Math.max(1, newQty), historyItem.availableQty);
    setReturnCart((prev) =>
      prev.map((item) => {
        if (item.returnKey === returnKey) {
          const updated = { ...item, quantity: qty };
          updated.total = updated.unitPrice * updated.quantity;
          return updated;
        }
        return item;
      })
    );
  };

  const processReturn = async () => {
    if (returnCart.length === 0 || isProcessing) return;
    const activeEntity =
      returnMode === "CUSTOMER" ? selectedCustomer : selectedCompany;
    if (!activeEntity) return;

    setIsProcessing(true);
    setShowConfirmModal(false);

    try {
      // Fix: db.transaction expects table names as strings, not proxy objects.
      await db.transaction(
        "rw",
        ["products", "customers", "transactionLogs", "companies", "productBatches"],
        async () => {
          const docType =
            returnMode === "CUSTOMER" ? "RETURN" : "PURCHASE_RETURN";

          const finalizedItems: ReturnItem[] = [];
          for (const item of returnCart) {
            if (returnMode === "SUPPLIER" && item.batchId) {
              const batch = await db.productBatches.get(item.batchId);
              if (!batch) {
                throw new Error(
                  `Batch #${item.batchId} is no longer available. Refresh and retry.`
                );
              }
              const currentQty = Number(batch.quantity) || 0;
              const retQty = Number(item.quantity) || 0;
              if (retQty > currentQty + 0.00001) {
                throw new Error(
                  `Return qty for ${item.productName} (${retQty}) exceeds remaining batch qty (${currentQty}).`
                );
              }
              const batchCost = Number(batch.unitCost) || 0;
              finalizedItems.push({
                ...item,
                unitPrice: batchCost,
                total: retQty * batchCost,
                batchAllocations: [
                  {
                    batchId: item.batchId,
                    batchNumber: item.batchNumber || batch.batchNumber || "",
                    quantity: retQty,
                    unitCost: batchCost,
                  },
                ],
                fifoAvgUnitCost: batchCost,
              });
            } else if (returnMode === "CUSTOMER" && selectedCustomer?.id) {
              const retQty = Number(item.quantity) || 0;
              const u = Number(item.unitPrice) || 0;
              const { allocations, avgCost } =
                await allocateCustomerReturnRestore(
                  item.productId,
                  retQty,
                  selectedCustomer.id
                );
              finalizedItems.push({
                ...item,
                total: retQty * u,
                batchAllocations: allocations.map((a) => ({
                  batchId: a.batchId,
                  batchNumber: a.batchNumber,
                  quantity: a.quantity,
                  unitCost: a.unitCost,
                })),
                fifoAvgUnitCost: avgCost,
              });
            } else {
              const q = Number(item.quantity) || 0;
              const u = Number(item.unitPrice) || 0;
              finalizedItems.push({
                ...item,
                total: q * u,
              });
            }
          }

          const totalReturnAmount = finalizedItems.reduce((s, i) => s + i.total, 0);
          const prevBal = Number(activeBalance) || 0;
          const totalAmt = Number(totalReturnAmount) || 0;
          const nextBal = prevBal - totalAmt;
          await db.transactionLogs.add({
            date: new Date(),
            customerId: returnMode === "CUSTOMER" ? (selectedCustomer?.id ?? null) : null,
            customerName: returnMode === "CUSTOMER" ? (selectedCustomer?.name ?? "") : "",
            companyId: returnMode !== "CUSTOMER" ? (selectedCompany?.id ?? null) : null,
            companyName: returnMode !== "CUSTOMER" ? (selectedCompany?.name ?? "") : "",
            type: docType,
            totalAmount: totalAmt,
            paidAmount: totalAmt,
            discount: 0,
            items: finalizedItems,
            notes: `Official ${returnMode.toLowerCase()} return documented.`,
            oldBalance: prevBal,
            newBalance: nextBal,
            isDeleted: false,
          });

          // 2. Adjust Physical Stock
          for (const item of finalizedItems) {
            if (returnMode === "SUPPLIER" && item.batchId) {
              const batch = await db.productBatches.get(item.batchId);
              if (!batch) {
                throw new Error(
                  `Batch #${item.batchId} is no longer available. Refresh and retry.`
                );
              }
              const currentQty = Number(batch.quantity) || 0;
              const retQty = Number(item.quantity) || 0;
              if (retQty > currentQty + 0.00001) {
                throw new Error(
                  `Return qty for ${item.productName} (${retQty}) exceeds remaining batch qty (${currentQty}).`
                );
              }
              const nextQty = currentQty - retQty;
              if (nextQty <= 0.00001) {
                await db.productBatches.delete(item.batchId);
              } else {
                await db.productBatches.update(item.batchId, { quantity: nextQty });
              }
              await recomputeProductCostsFromBatches(item.productId);
              continue;
            }

            if (returnMode === "CUSTOMER") {
              // Restore into the same FIFO lots that were sold (or RESTORED lots).
              if (item.batchAllocations?.length) {
                await restoreSaleBatchAllocations(
                  item.productId,
                  item.batchAllocations
                );
              } else {
                const product = await db.products.get(item.productId);
                if (!product) continue;
                await db.productBatches.add({
                  productId: item.productId,
                  batchNumber: "RESTORED",
                  quantity: Number(item.quantity) || 0,
                  unitCost:
                    Number(item.fifoAvgUnitCost) ||
                    Number(product.purchasePrice) ||
                    0,
                  salePrice: Number(product.salePrice) || 0,
                  expiryDate: "",
                  receivedAt: new Date().toISOString(),
                });
                await recomputeProductCostsFromBatches(item.productId);
              }
              continue;
            }

            // Legacy supplier path without batch id
            const product = await db.products.get(item.productId);
            if (!product) continue;
            const factor = -1;
            await db.products.update(item.productId, {
              stock: Math.max(
                0,
                (Number(product.stock) || 0) + item.quantity * factor
              ),
            });
          }

          // 3. Update Customer Registry Balance
          if (returnMode === "CUSTOMER" && selectedCustomer?.id) {
            const cust = await db.customers.get(selectedCustomer.id);
            if (cust) {
              await db.customers.update(selectedCustomer.id, {
                balance: Math.max(0, (Number(cust.balance) || 0) - totalAmt),
                totalDebit: (Number(cust.totalDebit) || 0) + totalReturnAmount,
              });
            }
          }
        }
      );

      showSuccess(
        "Return recorded",
        "Registry synchronized. Inventory and ledger updated."
      );
      notifyInventoryChanged();
      notifyLedgerChanged();
      clearFormDraft("return");
      setReturnCart([]);
      if (returnMode === "CUSTOMER" && selectedCustomer?.id) {
        await loadHistoryItems(selectedCustomer.id, "SALE");
        const cust = await db.customers.get(selectedCustomer.id);
        if (cust) {
          setSelectedCustomer(cust);
          setActiveBalance(Number(cust.balance) || 0);
        }
      } else if (returnMode === "SUPPLIER" && selectedCompany) {
        await loadSupplierBatchItems(selectedCompany);
        const bal = await calculateCompanyBalance(selectedCompany);
        setActiveBalance(bal);
      }
    } catch (err: any) {
      console.error("Return sync error:", err);
      showError("Could not save return", err?.message || String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredItems = purchasedItems.filter((i) => {
    const q = searchQuery.toLowerCase();
    return (
      i.productName.toLowerCase().includes(q) ||
      (i.skuCode || "").toLowerCase().includes(q) ||
      (i.batchNumber || "").toLowerCase().includes(q)
    );
  });

  const cartTotal = returnCart.reduce((s, i) => s + i.total, 0);

  return (
    <div className="relative flex flex-col lg:flex-row gap-3 h-full min-h-0 overflow-hidden">
      {/* Selection Panel */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 space-y-3">
        <div className="flex justify-between items-center bg-gray-500/10 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => {
              setReturnMode("CUSTOMER");
              setSelectedCustomer(null);
            }}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              returnMode === "CUSTOMER"
                ? "bg-red-500 text-white shadow-lg"
                : "text-gray-500 hover:text-gray-400"
            }`}
          >
            Customer Return
          </button>
          <button
            onClick={() => {
              setReturnMode("SUPPLIER");
              setSelectedCompany(null);
            }}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              returnMode === "SUPPLIER"
                ? "bg-blue-600 text-white shadow-lg"
                : "text-gray-500 hover:text-gray-400"
            }`}
          >
            Supplier Reject
          </button>
        </div>

        <button
          onClick={() => {
            setEntityModalSearch("");
            setShowEntityModal(true);
          }}
          className={`w-full flex items-center justify-between px-8 py-5 rounded-[32px] text-sm font-black border transition-all ${
            darkMode
              ? "bg-[#1a1d23] border-gray-800 text-white hover:border-red-500 shadow-2xl"
              : "bg-white shadow-xl border-gray-100 hover:border-red-500"
          }`}
        >
          <span className="flex items-center gap-4">
            {returnMode === "CUSTOMER" ? (
              <User size={20} className="text-red-500" />
            ) : (
              <Building2 size={20} className="text-blue-500" />
            )}
            {returnMode === "CUSTOMER"
              ? selectedCustomer?.name || "Search Party Archive..."
              : selectedCompany?.name || "Search Supplier Brands..."}
          </span>
          <div className="flex items-center gap-3">
            {selectedCustomer || selectedCompany ? (
              <span className="text-[10px] font-bold text-green-500 uppercase">
                Selected
              </span>
            ) : null}
            <ChevronDown size={20} className="text-gray-500" />
          </div>
        </button>

        {(returnMode === "CUSTOMER" && selectedCustomer) ||
        (returnMode === "SUPPLIER" && selectedCompany) ? (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredItems.map((item) => (
                  <motion.div
                    key={item.productId}
                    whileHover={{ y: -4 }}
                    onClick={() => addToReturnCart(item)}
                    className={`p-6 rounded-[32px] border cursor-pointer transition-all ${
                      darkMode
                        ? "bg-[#1a1d23] border-gray-800 hover:border-red-500/50 hover:shadow-red-500/5"
                        : "bg-white hover:border-red-500/50 shadow-sm border-gray-100 hover:shadow-xl"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-gray-500/10 text-gray-500">
                        History SKU
                      </span>
                      <Package size={14} className="text-gray-500" />
                    </div>
                    <h4
                      className={`text-sm font-black truncate mb-1 ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.productName}
                    </h4>
                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">
                      SKU: {item.skuCode || "N/A"}
                    </p>
                    {returnMode === "SUPPLIER" && (
                      <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-1">
                        Batch: {item.batchNumber || "—"}
                      </p>
                    )}
                    {returnMode === "SUPPLIER" && (
                      <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest mt-1">
                        Batch Cost: AFN {Number(item.unitPrice || 0).toLocaleString()}
                      </p>
                    )}
                    {returnMode === "SUPPLIER" && (
                      <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mt-1">
                        AVCO: AFN{" "}
                        {Number(
                          productById.get(item.productId)?.purchasePrice || 0
                        ).toLocaleString()}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      {returnMode === "SUPPLIER" ? "In stock left" : "Tradable"}: {item.availableQty} units
                    </p>
                    <div className="mt-4 pt-4 border-t border-gray-500/5 flex justify-between items-center">
                      <p className="text-[10px] font-black text-red-500">
                        AFN {item.unitPrice.toLocaleString()}
                      </p>
                      <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                        <Plus size={14} />
                      </div>
                    </div>
                  </motion.div>
                ))}
                {filteredItems.length === 0 && (
                  <div className="col-span-full py-20 text-center opacity-20 flex flex-col items-center gap-4">
                    <ShoppingBag size={48} />
                    <p className="font-black text-xs uppercase tracking-[0.3em]">
                      No tradable items found in history
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-10 p-10 grayscale">
            <ArrowRightLeft size={120} className="mb-6" />
            <p className="font-black text-sm uppercase tracking-[0.4em]">
              Identify ledger account to load history
            </p>
          </div>
        )}
      </div>

      {/* Cart Sidebar */}
      <div
        className={`w-full lg:w-[420px] h-full min-h-0 grid overflow-hidden flex-shrink-0 border rounded-[56px] ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800 shadow-2xl"
            : "bg-white shadow-xl border-gray-100"
        }`}
        style={{ gridTemplateRows: "auto minmax(0, 1fr) auto" }}
      >
        <div className="p-6 border-b border-gray-800/10 flex items-center justify-between bg-gray-500/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg">
              <RotateCcw size={20} />
            </div>
            <span
              className={`font-black text-sm uppercase tracking-widest ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Return Cart
            </span>
          </div>
          {returnCart.length > 0 && (
            <button
              onClick={() => setReturnCart([])}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto p-4 space-y-3 custom-scrollbar overscroll-contain">
          <AnimatePresence initial={false}>
            {returnCart.map((item) => (
              <motion.div
                key={item.returnKey}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`p-6 rounded-[32px] border transition-all ${
                  darkMode
                    ? "bg-black/20 border-gray-800"
                    : "bg-gray-50 border-gray-100 shadow-inner"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="max-w-[240px] min-w-0">
                    <p
                      className={`text-[13px] font-black leading-tight ${
                        darkMode ? "text-white" : "text-gray-900"
                      } truncate uppercase`}
                    >
                      {item.productName}
                    </p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                      SKU: {item.skuCode || "N/A"}
                    </p>
                    {returnMode === "SUPPLIER" && (
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mt-0.5">
                        Batch: {item.batchNumber || "—"}
                      </p>
                    )}
                    {returnMode === "SUPPLIER" && (
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mt-0.5">
                        Cost: AFN {Number(item.unitPrice || 0).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setReturnCart(
                        returnCart.filter((r) => r.returnKey !== item.returnKey)
                      )
                    }
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div
                    className={`flex items-center gap-3 p-1 rounded-xl ${
                      darkMode ? "bg-gray-900" : "bg-white shadow-sm"
                    }`}
                  >
                    <button
                      onClick={() =>
                        updateReturnQuantity(item.returnKey, item.quantity - 1)
                      }
                      className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <span
                      className={`w-8 text-center text-xs font-black ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateReturnQuantity(item.returnKey, item.quantity + 1)
                      }
                      className="p-2 hover:bg-green-500/10 rounded-lg text-gray-500 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className={`text-sm font-black ${darkMode ? "text-red-400" : "text-red-600"}`}>
                    AFN {item.total.toLocaleString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {returnCart.length === 0 && (
            <div className="py-20 text-center opacity-20 italic flex flex-col items-center gap-4">
              <RefreshCw size={32} className="animate-spin-slow" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                Awaiting item selection
              </p>
            </div>
          )}
        </div>

        <div
          className={`p-6 border-t ${
            darkMode
              ? "bg-[#0f1115] border-gray-800"
              : "bg-gray-50 border-gray-100"
          } space-y-4`}
        >
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              Aggregate Refund
            </span>
            <span className={`text-3xl font-black ${darkMode ? "text-red-400" : "text-red-600"}`}>
              AFN {cartTotal.toLocaleString()}
            </span>
          </div>
          <SaveDraftButton
            darkMode={darkMode}
            className="w-full !flex-none py-4 rounded-[24px]"
            onClick={() => {
              writeFormDraft("return", {
                returnMode,
                customerId: selectedCustomer?.id,
                companyId: selectedCompany?.id,
                returnCart,
              });
              showSuccess("Draft saved", "This return will reopen with these lines.");
            }}
          />
          <button
            disabled={returnCart.length === 0 || isProcessing}
            onClick={() => setShowConfirmModal(true)}
            className={`w-full py-6 rounded-[28px] font-black text-xs uppercase tracking-widest text-white shadow-xl transition-all ${
              returnCart.length === 0 || isProcessing
                ? "bg-gray-600 cursor-not-allowed grayscale"
                : "bg-red-600 hover:bg-red-700 hover:scale-[1.02] active:scale-95 shadow-red-500/20"
            }`}
          >
            {isProcessing ? "SYNCHRONIZING..." : "COMMIT TO REGISTRY"}
          </button>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isProcessing && setShowConfirmModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`relative w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-[28px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                <ShieldCheck size={40} />
              </div>
              <h3
                className={`text-2xl font-black uppercase tracking-widest ${
                  darkMode ? "text-white" : "text-gray-900"
                } mb-2`}
              >
                Authorize Entry
              </h3>
              <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.3em] mb-8">
                Confirm stock reversal and ledger write
              </p>
              <div
                className={`p-8 rounded-[32px] border mb-10 text-left space-y-4 ${
                  darkMode
                    ? "bg-gray-900 border-gray-800"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-500 uppercase">
                    Account:
                  </span>
                  <span
                    className={`text-xs font-black ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {selectedCustomer?.name || selectedCompany?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-500 uppercase">
                    Items:
                  </span>
                  <span
                    className={`text-xs font-black ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {returnCart.length} SKUs
                  </span>
                </div>
                <div className="pt-4 border-t border-gray-800/10 flex justify-between items-center">
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                    Total Refund:
                  </span>
                  <span className={`text-2xl font-black ${darkMode ? "text-red-400" : "text-red-600"}`}>
                    AFN {cartTotal.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isProcessing}
                  className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest ${
                    darkMode
                      ? "bg-gray-800 text-gray-400"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  Discard
                </button>
                <button
                  onClick={processReturn}
                  disabled={isProcessing}
                  className="flex-[2] py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-red-500/30 hover:bg-red-700 transition-all"
                >
                  Authorize Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Entity Selection Modal */}
      <AnimatePresence>
        {showEntityModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEntityModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-3xl max-h-[min(72vh,520px)] h-[min(72vh,520px)] flex flex-col rounded-2xl overflow-hidden ${
                darkMode
                  ? "bg-[#1a1d23] border border-gray-800 shadow-2xl"
                  : "bg-white shadow-2xl"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex justify-between items-center bg-gray-500/5 shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-lg ${
                      returnMode === "CUSTOMER" ? "bg-red-500" : "bg-blue-600"
                    } text-white`}
                  >
                    <Search size={18} />
                  </div>
                  <h3
                    className={`font-black text-xs uppercase tracking-widest ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {returnMode} REGISTRY
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setEntityModalSearch("");
                    setShowEntityModal(false);
                  }}
                  className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="px-6 pt-2 pb-4 border-b border-gray-800/10">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    type="search"
                    autoFocus
                    placeholder={
                      returnMode === "CUSTOMER"
                        ? "Search customer by name or phone..."
                        : "Search supplier by name, phone, or contact..."
                    }
                    value={entityModalSearch}
                    onChange={(e) => setEntityModalSearch(e.target.value)}
                    className={`w-full pl-12 pr-4 py-3.5 rounded-[20px] text-sm font-bold border outline-none focus:ring-2 focus:ring-red-500/40 ${
                      darkMode
                        ? "bg-[#0f1115] border-gray-800 text-white"
                        : "bg-gray-50 border-gray-200 text-gray-900"
                    }`}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
                {entityLoading && entityPageItems.length === 0 && (
                  <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-gray-500">
                    Searching…
                  </div>
                )}
                {entityPageItems.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      if (returnMode === "CUSTOMER")
                        setSelectedCustomer(e as Customer);
                      else setSelectedCompany(e as Company);
                      setEntityModalSearch("");
                      setShowEntityModal(false);
                    }}
                    className={`w-full p-5 rounded-[28px] border text-left transition-all hover:scale-[1.01] flex items-center justify-between ${
                      (returnMode === "CUSTOMER"
                        ? selectedCustomer?.id
                        : selectedCompany?.id) === e.id
                        ? "bg-red-500 text-white border-red-500 shadow-lg"
                        : `${
                            darkMode
                              ? "bg-[#0f1115] border-gray-800 text-gray-400 hover:bg-gray-800"
                              : "bg-gray-50 border-gray-100 text-gray-600"
                          }`
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                          (returnMode === "CUSTOMER"
                            ? selectedCustomer?.id
                            : selectedCompany?.id) === e.id
                            ? "bg-white/20"
                            : "bg-gray-500/10"
                        }`}
                      >
                        {e.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-sm uppercase tracking-tight">
                          {e.name}
                        </p>
                        <p
                          className={`text-[9px] font-bold uppercase opacity-60`}
                        >
                          ID: #ACC-{e.id}
                        </p>
                      </div>
                    </div>
                    <ChevronDown className="-rotate-90 opacity-40" size={14} />
                  </button>
                ))}
                {!entityLoading && entityTotal === 0 && (
                  <div className="py-20 text-center opacity-30 italic font-black uppercase text-xs">
                    No records found
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-gray-800/10">
                <PaginationBar
                  darkMode={darkMode}
                  total={entityTotal}
                  shown={entityShown}
                  hasMore={entityHasMore}
                  onLoadMore={entityLoadMore}
                  pageSize={entityPageSize}
                  onPageSizeChange={setEntityPageSize}
                  loading={entityLoading}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
