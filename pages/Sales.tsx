import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  Trash2,
  CreditCard,
  ChevronDown,
  Tag,
  AlertCircle,
  User,
  Briefcase,
  X,
  UserPlus,
  Check,
  Building2,
  ShoppingBag,
  CheckCircle2,
  UserCheck,
  Layers,
  RefreshCw,
  Printer,
} from "lucide-react";
import { db } from "../db";
import {
  Product,
  Customer,
  Transaction,
  TransactionItem,
  Employee,
  Company,
  Category,
  SystemSettings,
} from "../types";
import {
  allocateFifo,
  applyFifoDeductions,
  fifoWeightedAvgCost,
  recomputeProductCostsFromBatches,
} from "../batchFifo";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { useFeedback } from "../contexts/FeedbackContext";
import { useOpenNewFromQuery } from "../hooks/useOpenNewFromQuery";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { PaginationBar } from "../components/ui/PaginationBar";
import { notifyInventoryChanged, useInventorySync, useInventoryEpoch, notifyLedgerChanged, useDirectoryEpoch, notifyDirectoryChanged } from "../utils/dataSync";
import { SimpleBookReportPage, book } from "../components/SimpleBookReport";
import PrintMountPortal from "../components/PrintMountPortal";

export default function Sales({ darkMode }: { darkMode: boolean }) {
  const { showError } = useFeedback();
    const [products, setProducts] = useState<Product[]>([]);

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [cart, setCart] = useState<TransactionItem[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<
    Customer | { id: -1; name: "Walking Customer"; balance: 0 } | null
    >({ id: -1, name: "Walking Customer", balance: 0 });
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
    );
    // Filters
    const [selectedCompanyFilter, setSelectedCompanyFilter] =
    useState<string>("All");
    const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("All");
    const { query: searchQuery } = useGlobalSearch();
    const [productSearch, setProductSearch] = useState("");
    const [paidAmount, setPaidAmount] = useState<number>(0);
    const [totalDiscount, setTotalDiscount] = useState<number>(0);
    /** Walking customers are always cash. Named customers default to credit (pay later / partial). */
    const [salePaymentMode, setSalePaymentMode] = useState<"CASH" | "CREDIT">(
    "CREDIT",
    );
    // Layout states
    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [lastOrderDetails, setLastOrderDetails] = useState<{
    id?: number;
    total: number;
    } | null>(null);
    const [printAfterConfirm, setPrintAfterConfirm] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printVoucher, setPrintVoucher] = useState<Transaction | null>(null);
    const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
    // Modal States
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [showCompanyFilterModal, setShowCompanyFilterModal] = useState(false);
    const [showCategoryFilterModal, setShowCategoryFilterModal] = useState(false);
    const [customerSearch, setCustomerSearch] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    // New Customer Form
    const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    address: "",
    });
    const cartScrollRef = useRef<HTMLDivElement>(null);
    const cartFocusKeyRef = useRef(0);
    const [cartFocusKey, setCartFocusKey] = useState(0);
    const successOkRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (!showSuccessModal) return;
      const focusTimer = window.setTimeout(() => {
        successOkRef.current?.focus();
      }, 0);
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        setShowSuccessModal(false);
      };
      window.addEventListener("keydown", onKeyDown, true);
      return () => {
        window.clearTimeout(focusTimer);
        window.removeEventListener("keydown", onKeyDown, true);
      };
    }, [showSuccessModal]);
    const openNewOrder = () => {
    setCart([]);
    setPaidAmount(0);
    setTotalDiscount(0);
    setSelectedCustomer({ id: -1, name: "Walking Customer", balance: 0 });
    setSalePaymentMode("CASH");
    setShowCustomerModal(true);
    };
    useOpenNewFromQuery(openNewOrder);
    /** FIFO preview per cart line (one line per productId in current cart model) */
    const [fifoPreview, setFifoPreview] = useState<
    Record<
    number,
    { avgCost: number; error?: string }
    >
    >({});
    useEffect(() => {
    if (showEmployeeModal) loadEmployees();
    }, [showEmployeeModal]);
    useEffect(() => {
    if (showCompanyFilterModal) loadCompanies();
    }, [showCompanyFilterModal]);
    useEffect(() => {
      void (async () => {
        try {
          const rows = (await db.settings.toArray()) as SystemSettings[];
          if (rows.length) {
            setBizSettings(
              [...rows].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0]
            );
          }
        } catch {
          /* optional */
        }
      })();
      void loadEmployees();
    }, []);
    const directoryEpoch = useDirectoryEpoch();
    useEffect(() => {
      if (directoryEpoch === 0) return;
      void loadEmployees();
    }, [directoryEpoch]);
    useEffect(() => {
    let cancelled = false;
    (async () => {
    const next: Record<number, { avgCost: number; error?: string }> = {};
    for (const line of cart) {
    try {
    const allocs = await allocateFifo(line.productId, line.quantity);
    if (cancelled) return;
    next[line.productId] = {
    avgCost: fifoWeightedAvgCost(allocs)
    };
    } catch (e: any) {
    next[line.productId] = {
    avgCost: 0,
    error: e?.message || "Stock",
    };
    }
    }
    if (!cancelled) setFifoPreview(next);
    })();
    return () => {
    cancelled = true;
    };
    }, [cart]);
    const cartSubtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const grandTotal = Math.max(0, cartSubtotal - totalDiscount);
    const balanceDue = Math.max(0, grandTotal - paidAmount);
    useEffect(() => {
    if (selectedCustomer?.id === -1) {
    setSalePaymentMode("CASH");
    setPaidAmount(grandTotal);
    return;
    }
    if (salePaymentMode === "CASH") {
    setPaidAmount(grandTotal);
    }
    }, [selectedCustomer, grandTotal, salePaymentMode]);
    // Keep the latest added line at the top of the cart list (footer stays fixed).
    useEffect(() => {
      if (cartFocusKey === 0) return;
      const container = cartScrollRef.current;
      if (!container) return;
      requestAnimationFrame(() => {
        container.scrollTo({ top: 0, behavior: "smooth" });
      });
    }, [cartFocusKey]);

    const bumpCartFocus = () => {
      cartFocusKeyRef.current += 1;
      setCartFocusKey(cartFocusKeyRef.current);
    };
    const loadEmployees = async () => {
    const e = await db.employees.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    orderBy: "name",
    orderDir: "ASC",
    columns: ["id", "name", "role", "phone", "isDeleted"],
    });
    setEmployees(e as Employee[]);
    if (!selectedEmployee && e.length > 0) setSelectedEmployee(e[0] as Employee);
    };
    const loadCompanies = async () => {
    const comps = await db.companies.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    orderBy: "name",
    orderDir: "ASC",
    columns: ["id", "name", "isDeleted"],
    });
    setCompanies(comps as Company[]);
    };
    const [productListVersion, setProductListVersion] = useState(0);
    const bumpProducts = useCallback(
      () => setProductListVersion((v) => v + 1),
      []
    );
    useInventorySync(bumpProducts);
    const inventoryEpoch = useInventoryEpoch();
    const productTerm = (productSearch || searchQuery).trim();
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    from,
    hasMore,
    loadMore,
  } = useDbPagination<Product>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [{ col: "isDeleted", op: "=", val: 0 }];
      if (selectedCompanyFilter !== "All") {
        where.push({ col: "company", val: selectedCompanyFilter });
      }
      if (selectedCategoryFilter !== "All") {
        where.push({ col: "category", val: selectedCategoryFilter });
      }
      const orWhere: DbWhere = productTerm
        ? [
            { col: "name", op: "LIKE", val: `%${productTerm}%` },
            { col: "skuCode", op: "LIKE", val: `%${productTerm}%` },
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
      return { rows: rows as Product[], total: count };
    },
    [
      selectedCompanyFilter,
      selectedCategoryFilter,
      productTerm,
      productListVersion,
      inventoryEpoch,
    ],
    undefined,
    `products:${selectedCompanyFilter}:${selectedCategoryFilter}:${productTerm}:${productListVersion}:e${inventoryEpoch}`
  );

  useEffect(() => {
    // Replace (do not merge) so deleted-sale stock restores are visible immediately.
    setProducts(pageItems);
  }, [pageItems]);

  const calculateItemTotal = (
    quantity: number,
    price: number,
    itemDiscount: number
  ) => {
    return Math.max(0, quantity * price - itemDiscount);
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showError("Out of stock", "This SKU has no available units.");
      return;
    }

    const existing = cart.find((item) => item.productId === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        showError(
          "Stock limit",
          `Only ${product.stock} ${product.unit} available in inventory.`
        );
        return;
      }
      const nextQty = existing.quantity + 1;
      const nextTotal = calculateItemTotal(nextQty, existing.unitPrice, 0);
      // Move the bumped line to the top so the latest action stays visible.
      setCart((prev) => {
        const updated = prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQty, total: nextTotal }
            : item
        );
        const head = updated.find((item) => item.productId === product.id)!;
        return [head, ...updated.filter((item) => item.productId !== product.id)];
      });
      bumpCartFocus();
    } else {
      setCart((prev) => [
        {
          productId: product.id!,
          productName: product.name,
          quantity: 1,
          unitPrice: product.salePrice,
          itemDiscount: 0,
          total: product.salePrice,
          unit: product.unit,
        },
        ...prev,
      ]);
      bumpCartFocus();
    }
  };

  const updateCartItem = (id: number, updates: Partial<TransactionItem>) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;

    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === id) {
          const newItem = { ...item, ...updates };

          // Stock Validation
          if (newItem.quantity > product.stock) {
            showError(
              "Stock limit",
              `Only ${product.stock} ${product.unit} available.`
            );
            newItem.quantity = product.stock;
          }

          newItem.total = calculateItemTotal(
            newItem.quantity,
            newItem.unitPrice,
            0
          );
          return newItem;
        }
        return item;
      })
    );
  };

  const removeFromCart = (id: number) =>
    setCart(cart.filter((item) => item.productId !== id));

  const clearCart = () => {
    if (window.confirm("Clear all items from order?")) {
      setCart([]);
      setPaidAmount(0);
      setTotalDiscount(0);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerForm.name) return;
    const newCust: Customer = {
      name: newCustomerForm.name,
      phone: newCustomerForm.phone,
      address: newCustomerForm.address,
      totalCredit: 0,
      totalDebit: 0,
      balance: 0,
      isDeleted: false,
    };
    const id = await db.customers.add(newCust);
    notifyDirectoryChanged();
    const added = await db.customers.get(id);
    if (added) {
      setSalePaymentMode("CREDIT");
      setPaidAmount(0);
      setSelectedCustomer(added);
      setIsCreatingCustomer(false);
      setNewCustomerForm({ name: "", phone: "", address: "" });
      setShowCustomerModal(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || !selectedCustomer) return;

    const isWalking = selectedCustomer.id === -1;
    const oldBalance = isWalking ? 0 : Number((selectedCustomer as Customer).balance) || 0;
    const paid = Number(paidAmount) || 0;
    const discount = Number(totalDiscount) || 0;
    const netInvoiceEffect = Number(grandTotal) - paid;
    const newBalance = oldBalance + netInvoiceEffect;

    const transaction = {
      date: new Date(),
      customerId: isWalking ? null : selectedCustomer.id,
      customerName: selectedCustomer.name ?? "",
      companyId: null,
      companyName: "",
      employeeId: selectedEmployee?.id ?? null,
      employeeName: selectedEmployee?.name ?? "",
      type: "SALE" as const,
      totalAmount: Number(grandTotal) || 0,
      paidAmount: paid,
      discount,
      items: cart,
      notes: `Sold by ${selectedEmployee?.name || "System"}`,
      oldBalance,
      newBalance,
      isDeleted: false,
    };

    try {
      let orderId: number | undefined;
      let printedItems: TransactionItem[] = [];
      await db.transaction(
        "rw",
        ["products", "customers", "transactionLogs", "productBatches"],
        async () => {
          const finalItems: TransactionItem[] = [];
          for (const line of cart) {
            const allocs = await allocateFifo(line.productId, line.quantity);
            await applyFifoDeductions(allocs);
            await recomputeProductCostsFromBatches(line.productId);
            const avg = fifoWeightedAvgCost(allocs);
            finalItems.push({
              ...line,
              batchAllocations: allocs.map((a) => ({
                batchId: a.batchId,
                batchNumber: a.batchNumber,
                quantity: a.quantity,
                unitCost: a.unitCost,
              })),
              fifoAvgUnitCost: avg,
            });
          }

          orderId = (await db.transactionLogs.add({
            ...transaction,
            items: finalItems,
          })) as number;
          printedItems = finalItems;

          // Update Customer Record if not walking
          if (!isWalking && selectedCustomer.id) {
            const customer = await db.customers.get(selectedCustomer.id);
            if (customer) {
              await db.customers.update(selectedCustomer.id, {
                totalCredit: (Number(customer.totalCredit) || 0) + Number(grandTotal),
                totalDebit: (Number(customer.totalDebit) || 0) + paid,
                balance: newBalance,
              });
            }
          }
        }
      );

      setLastOrderDetails({ id: orderId, total: grandTotal });

      if (printAfterConfirm && orderId != null) {
        setPrintVoucher({
          ...transaction,
          id: orderId,
          items: printedItems,
        } as Transaction);
        setShowPrintModal(true);
      } else {
        setShowSuccessModal(true);
      }

      // Full reset for start over
      setCart([]);
      setPaidAmount(0);
      setTotalDiscount(0);
      setSalePaymentMode("CREDIT");
      setSelectedCustomer({ id: -1, name: "Walking Customer", balance: 0 });
      setIsMobileCartOpen(false);
      setProductListVersion((v) => v + 1);
      notifyInventoryChanged();
      notifyLedgerChanged();
    } catch (err: any) {
      console.error("Checkout failed", err);
      showError("Order failed", err?.message || String(err));
    }
  };

  const uniqueCategories = useMemo(() => {
    return ["All", ...Object.values(Category)];
  }, []);

  const customerTerm = customerSearch.trim();
  const {
    pageItems: customerPageItems,
    hasMore: customerHasMore,
    loadMore: customerLoadMore,
    shown: customerShown,
    total: customerTotal,
    loading: customerLoading,
  } = useDbPagination<Customer>(
    async ({ pageSize: size, offset }) => {
      if (!showCustomerModal || customerTerm.length < 1) {
        return { rows: [], total: 0 };
      }
      const where: DbWhere = [{ col: "isDeleted", op: "=", val: 0 }];
      const orWhere: DbWhere = [
        { col: "name", op: "LIKE", val: `%${customerTerm}%` },
        { col: "phone", op: "LIKE", val: `%${customerTerm}%` },
      ];
      const [rows, count] = await Promise.all([
        db.customers.query({
          where,
          orWhere,
          orderBy: "name",
          orderDir: "ASC",
          limit: size,
          offset,
          columns: ["id", "name", "phone", "balance", "isDeleted"],
        }),
        db.customers.countWhere(where, orWhere),
      ]);
      return { rows: rows as Customer[], total: count };
    },
    [showCustomerModal, customerTerm, directoryEpoch],
    undefined,
    showCustomerModal && customerTerm.length >= 1
      ? `sales-customers:${customerTerm}`
      : undefined
  );

  const filteredEmployees = employees.filter((e) =>
    e.name.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const cartLayout = (
    <div
      className={`grid h-full min-h-0 overflow-hidden ${
        darkMode ? "bg-[#1a1d23]" : "bg-white"
      }`}
      style={{ gridTemplateRows: "auto minmax(0, 1fr) auto" }}
    >
      <div className="px-4 py-3 border-b border-gray-800/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="text-red-500" size={18} />
          <span
            className={`font-black text-sm uppercase tracking-widest ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Checkout Terminal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearCart}
            title="Clear Cart"
            className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-500/5"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={() => setIsMobileCartOpen(false)}
            className="lg:hidden p-2 text-gray-400"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div
        ref={cartScrollRef}
        className="min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-2 custom-scrollbar overscroll-contain"
      >
        <AnimatePresence initial={false}>
          {cart.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              className="flex flex-col items-center justify-center py-20 text-gray-500"
            >
              <ShoppingBag size={48} className="mb-4" />
              <p className="text-xs font-black uppercase tracking-widest text-center">
                No items added to sale
              </p>
            </motion.div>
          ) : (
            cart.map((item) => (
                <motion.div
                  key={item.productId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`relative p-4 rounded-3xl border ${
                    darkMode
                      ? "bg-[#0f1115] border-gray-800"
                      : "bg-gray-50 border-gray-200 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[12px] font-black leading-tight ${
                          darkMode ? "text-white" : "text-gray-900"
                        } truncate`}
                      >
                        {item.productName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                          Adjust Price:
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-gray-500 tracking-widest">
                        Quantity ({item.unit})
                      </p>
                      <div className="flex items-center gap-1 bg-gray-500/10 p-0.5 rounded-xl">
                        <button
                          onClick={() =>
                            updateCartItem(item.productId, {
                              quantity: Math.max(1, item.quantity - 1)
                            })
                          }
                          className={`p-1 rounded-lg ${
                            darkMode ? "hover:bg-gray-800" : "hover:bg-gray-200"
                          }`}
                        >
                          <Minus size={10} className="text-gray-500" />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateCartItem(item.productId, {
                              quantity: Number(e.target.value)
                            })
                          }
                          className={`w-10 text-center text-xs font-black bg-transparent outline-none ${
                            darkMode ? "text-white" : "text-gray-900"
                          }`}
                        />
                        <button
                          onClick={() =>
                            updateCartItem(item.productId, {
                              quantity: item.quantity + 1,
                            })
                          }
                          className={`p-1 rounded-lg ${
                            darkMode ? "hover:bg-gray-800" : "hover:bg-gray-200"
                          }`}
                        >
                          <Plus size={10} className="text-gray-500" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-red-500 tracking-widest">
                        Unit Rate (AFN)
                      </p>
                      <input
                        type="number"
                        value={item.unitPrice}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          updateCartItem(item.productId, {
                            unitPrice: Number(e.target.value)
                          })
                        }
                        className={`w-full px-2 py-1.5 rounded-xl text-[11px] font-black outline-none border transition-all ${
                          darkMode
                            ? "bg-gray-900 border-gray-800 text-white focus:border-red-500/50"
                            : "bg-white border-gray-100 text-gray-900 focus:border-red-500 shadow-inner"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {fifoPreview[item.productId]?.error ? (
                      <p className="text-[9px] font-bold text-red-500">
                        {fifoPreview[item.productId].error}
                      </p>
                    ) : fifoPreview[item.productId] ? (
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">
                        FIFO unit cost (oldest batches first): AFN{" "},
                        {fifoPreview[item.productId].avgCost.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 pt-2 border-t border-gray-800/10 flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-gray-500">
                      Line Subtotal
                    </span>
                    <span
                      className={`text-[13px] font-black ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      AFN {item.total.toLocaleString()}
                    </span>
                  </div>
                </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <div
        className={`px-3 py-2.5 border-t ${
          darkMode
            ? "border-gray-800 bg-[#0f1115]"
            : "border-gray-100 bg-gray-50"
        } space-y-2`}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
              Customer Party
            </label>
            <button
              onClick={() => setShowCustomerModal(true)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                darkMode
                  ? "bg-gray-900 border-gray-800 text-white hover:border-red-500"
                  : "bg-white border-gray-200 text-gray-900 hover:border-red-500 shadow-sm"
              }`}
            >
              <span className="truncate">
                {selectedCustomer?.name || "Select Party"}
              </span>
              <ChevronDown size={14} className="text-gray-500" />
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
              Authorized Rep
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowEmployeeModal(true);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                darkMode
                  ? "bg-gray-900 border-gray-800 text-white hover:border-blue-500"
                  : "bg-white border-gray-200 text-gray-900 hover:border-blue-500 shadow-sm"
              }`}
            >
              <span className="truncate">
                {selectedEmployee?.name || "Select Staff"}
              </span>
              <ChevronDown size={14} className="text-gray-500" />
            </button>
          </div>
        </div>

        {selectedCustomer && selectedCustomer.id !== -1 && (
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
              Settlement
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSalePaymentMode("CASH");
                  setPaidAmount(grandTotal);
                }}
                className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                  salePaymentMode === "CASH"
                    ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-500/20"
                    : darkMode
                      ? "bg-gray-900 border-gray-800 text-gray-400 hover:border-red-500/50"
                      : "bg-white border-gray-200 text-gray-500 hover:border-red-200"
                }`}
              >
                Cash (full pay)
              </button>
              <button
                type="button"
                onClick={() => setSalePaymentMode("CREDIT")}
                className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                  salePaymentMode === "CREDIT"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20"
                    : darkMode
                      ? "bg-gray-900 border-gray-800 text-gray-400 hover:border-indigo-500/50"
                      : "bg-white border-gray-200 text-gray-500 hover:border-indigo-200"
                }`}
              >
                Credit / partial
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label
              className={`block text-[9px] font-black uppercase tracking-widest ${
                darkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              Bill Discount
            </label>
            <input
              type="number"
              value={totalDiscount ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setTotalDiscount(raw === "" ? 0 : Number(raw));
              }}
              placeholder="0"
              className={`w-full px-2.5 py-2 rounded-xl text-xs font-bold ${
                darkMode
                  ? "bg-gray-900 text-red-400 border-gray-800"
                  : "bg-white text-red-500 border-gray-200"
              } border focus:ring-1 focus:ring-red-500 outline-none`}
            />
          </div>
          <div className="space-y-1">
            <label
              className={`block text-[9px] font-black uppercase tracking-widest ${
                darkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              Cash Collected
            </label>
            <input
              type="number"
              value={paidAmount ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setPaidAmount(raw === "" ? 0 : Number(raw));
              }}
              disabled={
                selectedCustomer?.id === -1 || salePaymentMode === "CASH"
              }
              placeholder="0"
              className={`w-full px-2.5 py-2 rounded-xl text-xs font-bold ${
                darkMode
                  ? "bg-gray-900 text-green-400 border-gray-800"
                  : "bg-white text-green-600 border-gray-200"
              } border focus:ring-1 focus:ring-green-500 outline-none ${
                selectedCustomer?.id === -1 || salePaymentMode === "CASH"
                  ? "opacity-50"
                  : ""
              }`}
            />
          </div>
        </div>

        <div
          className={`px-3 py-2 rounded-2xl flex flex-col gap-1 border ${
            darkMode
              ? "bg-gray-900 border-gray-800"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          {selectedCustomer && selectedCustomer.id !== -1 && (
            <div className="flex justify-between items-center border-b border-gray-500/10 pb-1">
              <span className="text-[9px] font-black uppercase text-gray-500">
                Old Registry Balance
              </span>
              <span
                className={`text-[11px] font-black ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              >
                AFN {selectedCustomer.balance.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">
              Net Bill Value
            </span>
            <span
              className={`text-lg font-black ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            >
              AFN {grandTotal.toLocaleString()}
            </span>
          </div>
          {balanceDue > 0 && selectedCustomer?.id !== -1 && (
            <div className="flex justify-between items-center text-red-500">
              <span className="text-[9px] font-black uppercase">
                Net Effect (Debt)
              </span>
              <span className="text-[11px] font-black italic">
                + AFN {balanceDue.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <label
          className={`flex items-center gap-2 px-1 cursor-pointer select-none ${
            darkMode ? "text-gray-300" : "text-gray-700"
          }`}
        >
          <input
            type="checkbox"
            checked={printAfterConfirm}
            onChange={(e) => setPrintAfterConfirm(e.target.checked)}
            className="w-4 h-4 rounded border-gray-500 accent-red-600"
          />
          <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
            <Printer size={12} className="text-red-500" />
            Print bill after confirm
          </span>
        </label>

        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={cart.length === 0 || !selectedCustomer}
          onClick={handleCheckout}
          className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest text-white transition-all shadow-lg ${
            cart.length === 0 || !selectedCustomer
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700 shadow-red-500/20"
          }`}
        >
          <CreditCard size={16} /> Confirm
        </motion.button>
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col lg:flex-row gap-3 overflow-hidden h-full min-h-0">
      {/* LEFT: Products Selection Card */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden space-y-3 p-3 rounded-2xl border ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800 shadow-2xl"
            : "bg-white border-gray-100 shadow-xl"
        }`}
      >
        <div className="flex flex-col gap-2 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2
                className={`text-lg font-black ${
                  darkMode ? "text-white" : "text-gray-900"
                } uppercase tracking-tight`}
              >
                Sale Terminal
              </h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                {total} Items Listed
              </p>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <div
                className={`relative flex-1 min-w-[240px] sm:min-w-[320px] max-w-xl ${
                  darkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  size={14}
                />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search name or SKU…"
                  aria-label="Search products by name or SKU"
                  className={`w-full pl-8 pr-2 py-2 rounded-xl text-xs font-bold border-none outline-none ring-1 focus:ring-2 focus:ring-red-500 ${
                    darkMode
                      ? "bg-gray-900 text-white ring-gray-800 placeholder:text-gray-500"
                      : "bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400"
                  }`}
                />
              </div>
              <button
                onClick={() => setShowCompanyFilterModal(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  selectedCompanyFilter !== "All"
                    ? "bg-blue-500/10 border-blue-500 text-blue-500"
                    : `${
                        darkMode
                          ? "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                          : "bg-white border-gray-200 text-gray-500 shadow-sm"
                      }`
                }`}
              >
                <Building2 size={14} />{" "},
                {selectedCompanyFilter === "All"
                  ? "Brand"
                  : selectedCompanyFilter}
              </button>
              <button
                onClick={() => setShowCategoryFilterModal(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  selectedCategoryFilter !== "All"
                    ? "bg-indigo-500/10 border-indigo-500 text-indigo-500"
                    : `${
                        darkMode
                          ? "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                          : "bg-white border-gray-200 text-gray-500 shadow-sm"
                      }`
                }`}
              >
                <Layers size={14} />{" "},
                {selectedCategoryFilter === "All"
                  ? "Category"
                  : selectedCategoryFilter}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-4">
            {pageItems.map((product, index) => (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                className={`p-4 rounded-[32px] cursor-pointer transition-all border flex flex-col justify-between h-[180px] relative overflow-hidden group hover:-translate-y-1 active:scale-[0.98] ${
                  darkMode
                    ? "bg-[#0f1115] border-gray-800 hover:border-red-500/40"
                    : "bg-white border-gray-100 hover:border-red-500 shadow-sm"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[9px] font-black tabular-nums shrink-0 ${
                          darkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        #{from + index}
                      </span>
                      <span
                        className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest truncate ${
                          darkMode
                            ? "bg-indigo-500/10 text-indigo-400"
                            : "bg-indigo-50 text-indigo-500"
                        }`}
                      >
                        {product.category}
                      </span>
                    </div>
                    <span
                      className={`text-[12px] font-black shrink-0 ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      AFN {product.salePrice}
                    </span>
                  </div>
                  <h4
                    className={`text-sm font-black ${
                      darkMode ? "text-white" : "text-gray-900"
                    } leading-tight line-clamp-2`}
                  >
                    {product.name}
                  </h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 truncate">
                    {product.company},
                    {product.skuCode ? ` · ${product.skuCode}` : ""}
                  </p>
                </div>
                <div className="flex justify-between items-end mt-2">
                  <div className="flex flex-col">
                    <span
                      className={`text-[10px] font-black uppercase tracking-tighter ${
                        product.stock > 5 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {product.stock > 0
                        ? `${product.stock} ${product.unit} In Stock`
                        : "Out of Stock"}
                    </span>
                    {product.stock > 0 && product.stock <= 5 && (
                      <span className="text-[8px] font-bold text-amber-500 uppercase animate-pulse">
                        Low Supply Alert
                      </span>
                    )}
                  </div>
                  <div className="p-3 rounded-2xl bg-red-600 text-white shadow-xl shadow-red-600/20 transform transition-transform group-hover:scale-110">
                    <Plus size={16} />
                  </div>
                </div>
              </div>
            ))},
            {total === 0 && (
              <div className="col-span-full py-20 text-center opacity-20 uppercase font-black tracking-widest">
                No matching paint items
              </div>
            )}
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

      {/* Cart Sidebar (Desktop Only) — fixed panel; only item list scrolls */}
      <div className="hidden lg:flex w-[400px] h-full min-h-0 flex-col overflow-hidden rounded-[48px] flex-shrink-0 border border-gray-800/10 shadow-2xl">
        {cartLayout}
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {showCustomerModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowCustomerModal(false);
                setIsCreatingCustomer(false);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-3xl max-h-[min(72vh,520px)] h-[min(72vh,520px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex items-center justify-between bg-gray-500/5 shrink-0">
                <h3
                  className={`font-black text-xs uppercase tracking-[0.3em] ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {isCreatingCustomer ? "Quick Registry" : "Select Party"}
                </h3>
                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setIsCreatingCustomer(false);
                  }}
                  className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {!isCreatingCustomer ? (
                <>
                  <div className="p-6 border-b border-gray-800/10">
                    <div className="relative">
                      <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                        size={18}
                      />
                      <input
                        type="text"
                        placeholder="Type a name or phone to search…"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className={`w-full pl-12 pr-4 py-4 rounded-[20px] text-sm font-bold ${
                          darkMode
                            ? "bg-gray-900 text-white border-gray-800"
                            : "bg-gray-50 text-gray-900 border-gray-200"
                        } border focus:ring-2 focus:ring-red-500 outline-none`}
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
                    <button
                      onClick={() => {
                        setSelectedCustomer({
                          id: -1,
                          name: "Walking Customer",
                          balance: 0,
                        });
                        setSalePaymentMode("CASH");
                        setShowCustomerModal(false);
                      }}
                      className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                        selectedCustomer?.id === -1
                          ? "bg-red-500/10 border-red-500/50"
                          : `${
                              darkMode
                                ? "bg-gray-900 border-gray-800 hover:bg-gray-800"
                                : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                            }`
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-black ${
                            selectedCustomer?.id === -1
                              ? "bg-red-500 text-white"
                              : darkMode
                              ? "bg-gray-800 text-gray-500"
                              : "bg-white shadow-sm text-gray-400"
                          }`}
                        >
                          <UserCheck size={20} />
                        </div>
                        <div>
                          <p
                            className={`text-sm font-black ${
                              darkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            Walking Customer
                          </p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">
                            Cash Only Settlement
                          </p>
                        </div>
                      </div>
                      {selectedCustomer?.id === -1 && (
                        <Check
                          size={18}
                          className="text-red-500"
                          strokeWidth={3}
                        />
                      )}
                    </button>

                    {customerTerm.length < 1 ? (
                      <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-500 py-4">
                        Type a name or phone to see matching customers
                      </p>
                    ) : (
                      <>
                    {customerLoading && customerPageItems.length === 0 && (
                      <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-500 py-4">
                        Searching…
                      </p>
                    )}
                    {customerPageItems.map((c) => {
                      const isSelected = selectedCustomer?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setSalePaymentMode("CREDIT");
                            setPaidAmount(0);
                            setShowCustomerModal(false);
                          }}
                          className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                            isSelected
                              ? "bg-red-500/10 border-red-500/50"
                              : `${
                                  darkMode
                                    ? "bg-gray-900 border-gray-800 hover:bg-gray-800"
                                    : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                                }`
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-black ${
                                isSelected
                                  ? "bg-red-500 text-white"
                                  : darkMode
                                  ? "bg-gray-800 text-gray-500"
                                  : "bg-white shadow-sm text-gray-400"
                              }`}
                            >
                              <User size={20} />
                            </div>
                            <div>
                              <p
                                className={`text-sm font-black ${
                                  darkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {c.name}
                              </p>
                              <p
                                className={`text-[10px] font-bold uppercase mt-1 ${
                                  c.balance > 0
                                    ? "text-red-500"
                                    : "text-green-500"
                                }`}
                              >
                                Ledger: AFN {c.balance.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <Check
                              size={18}
                              className="text-red-500"
                              strokeWidth={3}
                            />
                          )}
                        </button>
                      );
                    })}
                    {!customerLoading && customerTerm.length >= 1 && customerTotal === 0 && (
                      <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-500 py-4">
                        No matching customers
                      </p>
                    )}
                    <PaginationBar
                      darkMode={darkMode}
                      total={customerTotal}
                      shown={customerShown}
                      hasMore={customerHasMore}
                      onLoadMore={customerLoadMore}
                      loading={customerLoading}
                    />
                      </>
                    )}
                  </div>
                  <div className="p-6 border-t border-gray-800/10">
                    <button
                      onClick={() => setIsCreatingCustomer(true)}
                      className="w-full py-4 bg-red-600 text-white rounded-[20px] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-red-500/20"
                    >
                      <UserPlus size={18} /> New Party Entry
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest px-2">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.name}
                        onChange={(e) =>
                          setNewCustomerForm({
                            ...newCustomerForm,
                            name: e.target.value,
                          })
                        }
                        className={`w-full px-6 py-4 rounded-[20px] text-sm font-bold ${
                          darkMode
                            ? "bg-gray-900 text-white border-gray-800"
                            : "bg-gray-50 text-gray-900 border-gray-200"
                        } border outline-none focus:ring-2 focus:ring-red-500`}
                        placeholder="Legal Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest px-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={newCustomerForm.phone}
                        onChange={(e) =>
                          setNewCustomerForm({
                            ...newCustomerForm,
                            phone: e.target.value,
                          })
                        }
                        className={`w-full px-6 py-4 rounded-[20px] text-sm font-bold ${
                          darkMode
                            ? "bg-gray-900 text-white border-gray-800"
                            : "bg-gray-50 text-gray-900 border-gray-200"
                        } border outline-none focus:ring-2 focus:ring-red-500`}
                        placeholder="Contact #"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest px-2">
                        Address
                      </label>
                      <input
                        type="text"
                        value={newCustomerForm.address}
                        onChange={(e) =>
                          setNewCustomerForm({
                            ...newCustomerForm,
                            address: e.target.value,
                          })
                        }
                        className={`w-full px-6 py-4 rounded-[20px] text-sm font-bold ${
                          darkMode
                            ? "bg-gray-900 text-white border-gray-800"
                            : "bg-gray-50 text-gray-900 border-gray-200"
                        } border outline-none focus:ring-2 focus:ring-red-500`}
                        placeholder="Location"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button
                      onClick={() => setIsCreatingCustomer(false)}
                      className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest rounded-[20px] ${
                        darkMode
                          ? "bg-gray-800 text-gray-400"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateCustomer}
                      className="flex-[2] py-4 bg-red-600 text-white rounded-[20px] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-red-500/20"
                    >
                      Save & Select
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEmployeeModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmployeeModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-3xl max-h-[min(72vh,520px)] h-[min(72vh,520px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex justify-between items-center bg-gray-500/5 shrink-0">
                <h3
                  className={`font-black text-xs uppercase tracking-[0.3em] ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Select Authorized Rep
                </h3>
                <button
                  onClick={() => setShowEmployeeModal(false)}
                  className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 border-b border-gray-800/10">
                <div className="relative">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Search staff members..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className={`w-full pl-12 pr-4 py-4 rounded-[20px] text-sm font-bold ${
                      darkMode
                        ? "bg-gray-900 text-white border-gray-800"
                        : "bg-gray-50 text-gray-900 border-gray-200"
                    } border focus:ring-2 focus:ring-blue-500 outline-none`}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
                {filteredEmployees.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setSelectedEmployee(e);
                      setShowEmployeeModal(false);
                    }}
                    className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                      selectedEmployee?.id === e.id
                        ? "bg-blue-500/10 border-blue-500/50"
                        : `${
                            darkMode
                              ? "bg-gray-900 border-gray-800 hover:bg-gray-800"
                              : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                          }`
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-[16px] flex items-center justify-center font-black ${
                          selectedEmployee?.id === e.id
                            ? "bg-blue-500 text-white"
                            : darkMode
                            ? "bg-gray-800 text-gray-500"
                            : "bg-white shadow-sm text-gray-400"
                        }`}
                      >
                        <Briefcase size={20} />
                      </div>
                      <div>
                        <p
                          className={`text-sm font-black ${
                            darkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {e.name}
                        </p>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">
                          {e.role}
                        </p>
                      </div>
                    </div>
                    {selectedEmployee?.id === e.id && (
                      <Check
                        size={18}
                        className="text-blue-500"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                ))},
                {filteredEmployees.length === 0 && (
                  <div className="py-20 text-center opacity-30 italic font-black uppercase text-xs">
                    No staff found
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompanyFilterModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCompanyFilterModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-3xl max-h-[min(72vh,520px)] h-[min(72vh,520px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex justify-between items-center shrink-0">
                <h3
                  className={`font-black text-xs uppercase tracking-[0.3em] ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Filter by Brand
                </h3>
                <button onClick={() => setShowCompanyFilterModal(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 custom-scrollbar">
                <button
                  onClick={() => {
                    setSelectedCompanyFilter("All");
                    setShowCompanyFilterModal(false);
                  }}
                  className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                    selectedCompanyFilter === "All"
                      ? "bg-blue-600/10 border-blue-600/50"
                      : `${
                          darkMode
                            ? "bg-gray-900 border-gray-800 text-gray-400"
                            : "bg-gray-50"
                        }`
                  }`}
                >
                  <span
                    className={`text-sm font-black ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    All Brands
                  </span>
                  {selectedCompanyFilter === "All" && (
                    <Check size={18} className="text-blue-500" />
                  )}
                </button>
                {companies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCompanyFilter(c.name);
                      setShowCompanyFilterModal(false);
                    }}
                    className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                      selectedCompanyFilter === c.name
                        ? "bg-blue-600/10 border-blue-600/50"
                        : `${
                            darkMode
                              ? "bg-gray-900 border-gray-800 text-gray-400"
                              : "bg-gray-50"
                          }`
                    }`}
                  >
                    <p
                      className={`text-sm font-black ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {c.name}
                    </p>
                    {selectedCompanyFilter === c.name && (
                      <Check size={18} className="text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoryFilterModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCategoryFilterModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-3xl max-h-[min(72vh,520px)] h-[min(72vh,520px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex justify-between items-center shrink-0">
                <h3
                  className={`font-black text-xs uppercase tracking-[0.3em] ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Filter by Category
                </h3>
                <button onClick={() => setShowCategoryFilterModal(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 custom-scrollbar">
                {uniqueCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategoryFilter(cat);
                      setShowCategoryFilterModal(false);
                    }}
                    className={`w-full p-5 rounded-[24px] border text-left flex items-center justify-between transition-all ${
                      selectedCategoryFilter === cat
                        ? "bg-indigo-600/10 border-indigo-600/50"
                        : `${
                            darkMode
                              ? "bg-gray-900 border-gray-800 text-gray-400"
                              : "bg-gray-50"
                          }`
                    }`}
                  >
                    <p
                      className={`text-sm font-black ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {cat}
                    </p>
                    {selectedCategoryFilter === cat && (
                      <Check size={18} className="text-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`relative w-full max-w-sm p-10 rounded-[48px] text-center shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="w-24 h-24 bg-green-500/10 text-green-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                <CheckCircle2 size={48} />
              </div>
              <h3
                className={`text-2xl font-black uppercase tracking-widest ${
                  darkMode ? "text-white" : "text-gray-900"
                } mb-2`}
              >
                Sale Complete
              </h3>
              <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-8">
                Order ID: #DOC-{lastOrderDetails?.id}
              </p>
              <div
                className={`p-6 rounded-3xl border mb-10 ${
                  darkMode
                    ? "bg-gray-900 border-gray-800"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
                  Total AFN Received
                </p>
                <p
                  className={`text-3xl font-black ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  AFN {lastOrderDetails?.total.toLocaleString()}
                </p>
              </div>
              <button
                ref={successOkRef}
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-4 bg-green-600 text-white rounded-[20px] font-black text-xs uppercase tracking-widest shadow-xl shadow-green-500/20 hover:bg-green-700 transition-all outline-none focus:ring-2 focus:ring-green-400/60"
              >
                Start New Order
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileCartOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-[90] flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => setIsMobileCartOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className={`relative z-10 max-h-[92vh] flex flex-col rounded-t-[48px] border-t shadow-2xl overflow-hidden ${
                darkMode ? "bg-[#1a1d23] border-gray-800" : "bg-white border-gray-200"
              }`}
            >
              <button
                type="button"
                aria-label="Close cart"
                onClick={() => setIsMobileCartOpen(false)}
                className="flex-shrink-0 flex justify-center pt-3 pb-2 w-full"
              >
                <span className="w-12 h-1.5 rounded-full bg-gray-500/35" />
              </button>
              <div className="flex-1 min-h-0 h-[min(88vh,900px)] flex flex-col overflow-hidden">
                {cartLayout}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {cart.length > 0 && !isMobileCartOpen && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="lg:hidden fixed bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-48px)] max-w-sm"
        >
          <button
            onClick={() => setIsMobileCartOpen(true)}
            className="w-full bg-red-600 text-white rounded-[24px] p-4 flex items-center justify-between shadow-2xl transition-transform active:scale-95"
          >
            <div className="flex items-center gap-4">
              <ShoppingCart size={20} />
              <div className="text-left">
                <p className="text-lg font-black">
                  AFN {grandTotal.toLocaleString()}
                </p>
              </div>
            </div>
            <ChevronDown size={20} className="-rotate-90 opacity-60" />
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {showPrintModal && printVoucher && (
          <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
              onClick={() => {
                setShowPrintModal(false);
                setPrintVoucher(null);
                setShowSuccessModal(true);
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-2xl max-h-[min(88vh,720px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-4 py-3 border-b border-gray-800/10 flex items-center justify-between shrink-0 bg-gray-500/5">
                <div>
                  <h3
                    className={`text-sm font-black uppercase tracking-widest ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Sale Bill #{printVoucher.id}
                  </h3>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                    Print or close to continue
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPrintModal(false);
                    setPrintVoucher(null);
                    setShowSuccessModal(true);
                  }}
                  className="p-2 text-gray-500 hover:text-red-500"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-white">
                <div className="text-[11px] text-gray-800 space-y-2">
                  <p className="font-black text-sm">
                    {bizSettings?.companyName || "Spectrum Pro"}
                  </p>
                  <p className="text-gray-500">
                    {new Date(printVoucher.date).toLocaleString()} ·{" "}
                    {printVoucher.customerName || "—"}
                  </p>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-1.5 font-black uppercase text-[9px]">Item</th>
                        <th className="py-1.5 font-black uppercase text-[9px] text-center">Qty</th>
                        <th className="py-1.5 font-black uppercase text-[9px] text-right">Unit</th>
                        <th className="py-1.5 font-black uppercase text-[9px] text-right">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printVoucher.items ?? []).map((item, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-1.5 font-bold">{item.productName}</td>
                          <td className="py-1.5 text-center">{item.quantity}</td>
                          <td className="py-1.5 text-right">
                            {Number(item.unitPrice).toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-black">
                            {Number(item.total).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between pt-2 font-black">
                    <span>Total</span>
                    <span>AFN {Number(printVoucher.totalAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Paid</span>
                    <span>AFN {Number(printVoucher.paidAmount).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-800/10 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowPrintModal(false);
                    setPrintVoucher(null);
                    setShowSuccessModal(true);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    darkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => window.print());
                    });
                  }}
                  className="flex-[2] py-2.5 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  <Printer size={14} /> Print Bill
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {printVoucher && (
        <PrintMountPortal>
          <SimpleBookReportPage
            printable={true}
            companyName={bizSettings?.companyName || "Spectrum Pro"}
            logoSrc={
              bizSettings?.logos?.[bizSettings?.selectedLogoIndex ?? 0] ||
              bizSettings?.logo
            }
            reportTitle={`Sale Bill #${printVoucher.id}`}
            periodLine={`${new Date(printVoucher.date).toLocaleDateString()} · ${
              printVoucher.customerName || "—"
            }`}
          >
            {bizSettings?.address || bizSettings?.phone ? (
              <p style={{ ...book.tag, marginBottom: "10px", fontSize: "8px" }}>
                {[bizSettings?.address, bizSettings?.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <div style={book.sectionLabel}>Line items</div>
            <table style={book.table}>
              <thead>
                <tr>
                  <th style={book.th}>Description</th>
                  <th style={{ ...book.th, ...book.thCenter }}>Qty</th>
                  <th style={{ ...book.th, ...book.thRight }}>Unit (AFN)</th>
                  <th style={{ ...book.th, ...book.thRight }}>Line (AFN)</th>
                </tr>
              </thead>
              <tbody>
                {(printVoucher.items ?? []).map((item, i) => (
                  <tr key={i}>
                    <td style={book.td}>{item.productName}</td>
                    <td style={{ ...book.td, ...book.tdCenter }}>{item.quantity}</td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {Number(item.unitPrice).toLocaleString()}
                    </td>
                    <td style={{ ...book.td, ...book.tdRight }}>
                      {Number(item.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={book.sectionLabel}>Totals (AFN)</div>
            <table style={{ ...book.table, maxWidth: "280px", marginLeft: "auto" }}>
              <tbody>
                <tr>
                  <td style={book.td}>Previous balance</td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {(printVoucher.oldBalance || 0).toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td style={book.td}>Document amount</td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {(printVoucher.totalAmount ?? 0).toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td style={book.td}>Paid</td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    ({(printVoucher.paidAmount ?? 0).toLocaleString()})
                  </td>
                </tr>
                <tr>
                  <td style={{ ...book.td, fontWeight: 700 }}>Balance due</td>
                  <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                    {(printVoucher.newBalance ?? 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </SimpleBookReportPage>
        </PrintMountPortal>
      )}
    </div>
  );
}
