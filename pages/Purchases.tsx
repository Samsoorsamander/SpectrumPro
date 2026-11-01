import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Plus,
  Minus,
  Search,
  Trash2,
  X,
  ChevronDown,
  Building2,
  Package,
  ArrowRight,
  History,
  RefreshCw,
  PlusSquare,
  ArrowUpRight,
  Coins,
  Layers,
  Calendar,
  Tag,
  Edit2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Download,
  Printer,
  Save,
  Box,
  Info,
  DollarSign,
  Hash,
  FileText,
  Bell,
} from "lucide-react";
import { db } from "../db";
import {
  Product,
  Company,
  Transaction,
  TransactionItem,
  Category,
  UnitType,
  SystemSettings,
} from "../types";
import {
  recomputeProductCostsFromBatches,
  revertPurchaseQuantityLegacy,
} from "../batchFifo";
import { useGlobalSearch } from "../contexts/GlobalSearchContext";
import { useFeedback } from "../contexts/FeedbackContext";
import { assertUniqueSkuCode } from "../utils/skuUnique";
import { useOpenNewFromQuery } from "../hooks/useOpenNewFromQuery";
import { SimpleBookReportPage, book } from "../components/SimpleBookReport";
import PrintMountPortal from "../components/PrintMountPortal";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useDbPagination, DbWhere } from "../hooks/useDbPagination";
import { computeCompanyBalance } from "../utils/ledgerBalances";
import { TX_LIST_COLUMNS } from "../utils/txListColumns";
import { useScreenActive } from "../contexts/ScreenActiveContext";
import { notifyInventoryChanged, notifyLedgerChanged, useLazyScreenDataSync, useDirectoryEpoch } from "../utils/dataSync";
import { clearFormDraft, readFormDraft, writeFormDraft } from "../utils/formDraft";
import { SaveDraftButton } from "../components/ui/SaveDraftButton";
import { useLocation, useNavigate } from "react-router-dom";

/** Pair staged edit row to original invoice line (batchId strongest, then batch #, row index, product). */
function findMatchingOldLineIndexForPurchaseEdit(
  s: { productId: number; batchNumber?: string; batchId?: number },
  oldItems: TransactionItem[],
  usedOldIdx: Set<number>,
  stagedIndex: number
): number {
  if (s.batchId) {
    const byId = oldItems.findIndex(
      (o, idx) =>
        !usedOldIdx.has(idx) &&
        (o as TransactionItem).batchId === s.batchId
    );
    if (byId >= 0) return byId;
  }
  const bn = String(s.batchNumber || "").trim();
  const byBn = oldItems.findIndex(
    (o, idx) =>
      !usedOldIdx.has(idx) &&
      o.productId === s.productId &&
      String((o as TransactionItem).batchNumber || "").trim() === bn
  );
  if (byBn >= 0) return byBn;
  if (
    stagedIndex < oldItems.length &&
    !usedOldIdx.has(stagedIndex) &&
    oldItems[stagedIndex].productId === s.productId
  ) {
    return stagedIndex;
  }
  return oldItems.findIndex(
    (o, idx) => !usedOldIdx.has(idx) && o.productId === s.productId
  );
}

export default function Purchases({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const screenActive = useScreenActive();
  const { showSuccess, showError } = useFeedback();
    const [purchasesVersion, setPurchasesVersion] = useState(0);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [listSearch, setListSearch] = useState("");
    // New Filters State
    const [filterCompany, setFilterCompany] = useState("All");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showProductCreationModal, setShowProductCreationModal] =
    useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Transaction | null>(
    null,
    );
    const [showConfirmCommit, setShowConfirmCommit] = useState(false);
    const [isEditingInvoice, setIsEditingInvoice] = useState(false);
    // New Purchase Form State
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [invoiceNo, setInvoiceNo] = useState("");
    const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
    );
    const [stagedItems, setStagedItems] = useState<any[]>([]);
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showProductDropdown, setShowProductDropdown] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    // Refs for auto-close behavior
    const productComboRef = useRef<HTMLDivElement>(null);
    const productMenuRef = useRef<HTMLDivElement>(null);
    const companyDropdownRef = useRef<HTMLDivElement>(null);
    const [productMenuPos, setProductMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    } | null>(null);
    // New Product Modal State
    const initialProductState: Partial<Product> = {
    name: "",
    category: Category.PAINT,
    company: "",
    unit: UnitType.PCS,
    stock: 0,
    purchasePrice: 0,
    salePrice: 0,
    minStockLevel: 5,
    expiryDate: "",
    skuCode: "",
    barcode: "",
    size: "",
    location: "",
    weight: "",
    description: "",
    modelNumber: "",
    shelfLife: "",
    colorHex: "",
    };
    const [newProductForm, setNewProductForm] =
    useState<Partial<Product>>(initialProductState);
    const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
    const [customCategoryName, setCustomCategoryName] = useState("");
    const [newSkuBatchNumber, setNewSkuBatchNumber] = useState("");
    // Item Input State
    const [currentItem, setCurrentItem] = useState({
    productId: undefined as number | undefined,
    name: "",
    cost: "" as any,
    price: "" as any,
    quantity: "" as any,
    batchNumber: "",
    expiryDate: "",
    });
    const [companyBalance, setCompanyBalance] = useState(0);
    const [supplierSearch, setSupplierSearch] = useState("");
    const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState("");
    const [supplierHits, setSupplierHits] = useState<Company[]>([]);
    const [supplierSearching, setSupplierSearching] = useState(false);
    const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
    const [productHits, setProductHits] = useState<Product[]>([]);
    const [productSearching, setProductSearching] = useState(false);
    const simplePdfRef = useRef<HTMLDivElement>(null);
    /** Slim company names for the list filter only — not used by the shipment modal. */
    const loadLookups = async () => {
    try {
    const [c, settings] = await Promise.all([
    db.companies.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    orderBy: "name",
    orderDir: "ASC",
    columns: ["id", "name", "isDeleted"],
    }),
    db.settings.toArray()
    ]);
    setCompanies(c as Company[]);
    if (settings.length > 0) setBizSettings(settings[0]);
    } catch (err) {
    console.error(err);
    }
    };
    const refreshPurchases = useCallback(() => setPurchasesVersion((v) => v + 1), []);
    const directoryEpoch = useDirectoryEpoch();
    useLazyScreenDataSync(refreshPurchases);
    useEffect(() => {
    if (!screenActive) return;
    let cancelled = false;
    const run = () => {
    if (!cancelled) void loadLookups();
    };
    let idleId: number;
    if (typeof requestIdleCallback === "function") {
    idleId = requestIdleCallback(run);
    return () => {
    cancelled = true;
    cancelIdleCallback(idleId);
    };
    }
    idleId = window.setTimeout(run, 0);
    return () => {
    cancelled = true;
    window.clearTimeout(idleId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screenActive, directoryEpoch]);
    useEffect(() => {
    if (!isModalOpen) {
    setShowProductDropdown(false);
    setShowCompanyDropdown(false);
    setProductMenuPos(null);
    setSupplierSearch("");
    setDebouncedSupplierSearch("");
    setSupplierHits([]);
    setProductHits([]);
    setDebouncedProductSearch("");
    }
    }, [isModalOpen]);
    useEffect(() => {
      const t = window.setTimeout(
        () => setDebouncedSupplierSearch(supplierSearch.trim()),
        150
      );
      return () => window.clearTimeout(t);
    }, [supplierSearch]);
    useEffect(() => {
      const t = window.setTimeout(
        () => setDebouncedProductSearch((currentItem.name || "").trim()),
        150
      );
      return () => window.clearTimeout(t);
    }, [currentItem.name]);
    /** Type-to-search suppliers — only query when the user types. */
    useEffect(() => {
      if (!isModalOpen || !showCompanyDropdown) return;
      if (debouncedSupplierSearch.length < 1) {
        setSupplierHits([]);
        setSupplierSearching(false);
        return;
      }
      let cancelled = false;
      setSupplierSearching(true);
      (async () => {
        try {
          const term = debouncedSupplierSearch;
          const where: DbWhere = [{ col: "isDeleted", op: "=", val: 0 }];
          const orWhere: DbWhere = [
            { col: "name", op: "LIKE", val: `%${term}%` },
            { col: "contactPerson", op: "LIKE", val: `%${term}%` },
            { col: "phone", op: "LIKE", val: `%${term}%` },
          ];
          const rows = await db.companies.query({
            where,
            orWhere,
            orderBy: "name",
            orderDir: "ASC",
            limit: 15,
            columns: [
              "id",
              "name",
              "openingBalance",
              "contactPerson",
              "phone",
              "isDeleted",
            ],
          });
          if (!cancelled) setSupplierHits(rows as Company[]);
        } catch (err) {
          console.error(err);
          if (!cancelled) setSupplierHits([]);
        } finally {
          if (!cancelled) setSupplierSearching(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isModalOpen, showCompanyDropdown, debouncedSupplierSearch]);
    /** Type-to-search products for the selected supplier — no full catalog load. */
    useEffect(() => {
      if (!isModalOpen || !showProductDropdown || !selectedCompany?.name) {
        if (!selectedCompany) setProductHits([]);
        return;
      }
      if (debouncedProductSearch.length < 1) {
        setProductHits([]);
        setProductSearching(false);
        return;
      }
      let cancelled = false;
      setProductSearching(true);
      (async () => {
        try {
          const term = debouncedProductSearch;
          const where: DbWhere = [
            { col: "isDeleted", op: "=", val: 0 },
            { col: "company", val: selectedCompany.name },
          ];
          const orWhere: DbWhere = [
            { col: "name", op: "LIKE", val: `%${term}%` },
            { col: "skuCode", op: "LIKE", val: `%${term}%` },
          ];
          const rows = await db.products.query({
            where,
            orWhere,
            orderBy: "name",
            orderDir: "ASC",
            limit: 15,
            columns: [
              "id",
              "name",
              "skuCode",
              "company",
              "companyId",
              "purchasePrice",
              "salePrice",
              "unit",
              "stock",
              "category",
              "size",
              "isDeleted",
            ],
          });
          if (!cancelled) setProductHits(rows as Product[]);
        } catch (err) {
          console.error(err);
          if (!cancelled) setProductHits([]);
        } finally {
          if (!cancelled) setProductSearching(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [
      isModalOpen,
      showProductDropdown,
      selectedCompany?.name,
      debouncedProductSearch,
    ]);
    const updateProductMenuPosition = useCallback(() => {
    if (!showProductDropdown || !productComboRef.current) {
    setProductMenuPos(null);
    return;
    }
    const r = productComboRef.current.getBoundingClientRect();
    const gap = 8;
    setProductMenuPos({
    top: r.bottom + gap,
    left: r.left,
    width: r.width,
    });
    }, [showProductDropdown]);
    useLayoutEffect(() => {
    updateProductMenuPosition();
    }, [updateProductMenuPosition]);
    useEffect(() => {
    if (!showProductDropdown) return;
    const onScrollOrResize = () => updateProductMenuPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
    };
    }, [showProductDropdown, updateProductMenuPosition]);
    useEffect(() => {
    if (!showProductDropdown) return;
    const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setShowProductDropdown(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    }, [showProductDropdown]);
    // Close dropdowns when clicking outside (capture: menu is portaled to body)
    useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
    const t = event.target as Node;
    if (
    productComboRef.current?.contains(t) ||
    productMenuRef.current?.contains(t)
    ) {
    return;
    }
    setShowProductDropdown(false);
    if (
    companyDropdownRef.current &&
    !companyDropdownRef.current.contains(t)
    ) {
    setShowCompanyDropdown(false);
    }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
    document.removeEventListener("pointerdown", handlePointerDown, true);
    }, []);
    const handleSelectCompany = async (company: Company) => {
    const full =
      (company.id
        ? ((await db.companies.get(company.id)) as Company | undefined)
        : undefined) || company;
    setSelectedCompany(full);
    setShowCompanyDropdown(false);
    setSupplierSearch("");
    setSupplierHits([]);
    setProductHits([]);
    setCurrentItem((prev) => ({
      ...prev,
      productId: undefined,
      name: "",
      cost: "",
      price: "",
    }));
    const history = (await db.transactionLogs.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "companyId", val: full.id! },
        {
          col: "type",
          op: "IN",
          val: ["PURCHASE", "PAYMENT", "PURCHASE_RETURN"],
        },
      ],
      columns: ["type", "totalAmount", "paidAmount", "isDeleted"],
    })) as Transaction[];
    setCompanyBalance(computeCompanyBalance(full.openingBalance, history));
    };
    const addItemToStage = () => {
    const missing: string[] = [];
    if (!selectedCompany) missing.push("Supplier");
    if (!currentItem.productId || !currentItem.name?.trim()) missing.push("Product (select from lookup or add new SKU)");
    const qtyValue = Number(currentItem.quantity);
    const costValue = Number(currentItem.cost);
    const saleValue = Number(currentItem.price);
    if (currentItem.quantity === "" || currentItem.quantity === undefined || isNaN(qtyValue) || qtyValue <= 0) missing.push("Quantity (at least 1)");
    if (currentItem.cost === "" || currentItem.cost === undefined || isNaN(costValue) || costValue <= 0) missing.push("Unit Cost (must be greater than 0)");
    if (currentItem.price === "" || currentItem.price === undefined || isNaN(saleValue) || saleValue <= 0) missing.push("Sell Price (must be greater than 0)");
    if (!currentItem.batchNumber?.trim()) missing.push("Batch number");
    if (missing.length > 0) {
    showError("Required fields", "• " + missing.join("\n• "));
    return;
    }
    const item = {
    productId: currentItem.productId!,
    productName: currentItem.name,
    quantity: qtyValue,
    unitPrice: costValue,
    salePrice: saleValue,
    total: costValue * qtyValue,
    itemDiscount: 0,
    batchNumber: currentItem.batchNumber.trim(),
    expiryDate: currentItem.expiryDate?.trim() || "",
    };
    setStagedItems([...stagedItems, item]);
    setCurrentItem({
    productId: undefined,
    name: "",
    cost: "",
    price: "",
    quantity: "",
    batchNumber: "",
    expiryDate: "",
    });
    };
    type StagedPurchaseLine = {
    productId: number;
    productName: string;
    /** Physical units to put in the new batch (FIFO remainder). For new purchases equals invoice qty. */
    quantity: number;
    /** Invoice line qty when it differs from batch (after edit: sold units already taken from old lot). */
    invoiceQty?: number;
    unitPrice: number;
    salePrice: number;
    total: number;
    itemDiscount: number;
    batchNumber: string;
    expiryDate: string;
    batchId?: number;
    };
    const buildPurchaseCommittedItems = async (
    items: StagedPurchaseLine[]
    ): Promise<TransactionItem[]> => {
    const out: TransactionItem[] = [];
    for (const raw of items) {
    const batchQty = Number(raw.quantity) || 0;
    if (batchQty <= 0) continue;
    const unitCost = Number(raw.unitPrice) || 0;
    const saleP = Number(raw.salePrice) || 0;
    const invoiceQty =
    raw.invoiceQty != null ? Number(raw.invoiceQty) : batchQty;
    const lineTotal = invoiceQty * unitCost;
    const batchId = (await db.productBatches.add({
    productId: raw.productId,
    batchNumber: raw.batchNumber || `LOT-${Date.now()}`,
    quantity: batchQty,
    unitCost: unitCost,
    salePrice: saleP,
    expiryDate: raw.expiryDate || "",
    receivedAt: new Date().toISOString()
    })) as number;
    out.push({
    productId: raw.productId,
    productName: raw.productName,
    quantity: invoiceQty,
    unitPrice: unitCost,
    itemDiscount: 0,
    total: lineTotal,
    salePrice: saleP,
    batchNumber: raw.batchNumber,
    expiryDate: raw.expiryDate,
    batchId,
    });
    }
    return out;
    };
    const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing: string[] = [];
    if (!newProductForm.name?.trim()) missing.push("Product name");
    const cost = Number(newProductForm.purchasePrice);
    const price = Number(newProductForm.salePrice);
    if (newProductForm.purchasePrice == null || isNaN(cost) || cost < 0) missing.push("Unit cost (0 or more)");
    if (newProductForm.salePrice == null || isNaN(price) || price < 0) missing.push("Sell price (0 or more)");
    if (missing.length > 0) {
    showError("Required fields", "• " + missing.join("\n• "));
    return;
    }
    try {
    const finalCategory = isAddingCustomCategory
    ? customCategoryName
    : newProductForm.category;
    const skuCode = (newProductForm.skuCode || "").trim();
    await assertUniqueSkuCode(skuCode);
    const submissionData = {
    ...newProductForm,
    skuCode,
    purchasePrice: Number(newProductForm.purchasePrice) || 0,
    salePrice: Number(newProductForm.salePrice) || 0,
    category: finalCategory as any,
    isDeleted: false,
    company: (newProductForm.company || selectedCompany?.name || "Manual Registry").trim(),
    };
    const id = await db.products.add(submissionData as Product);
    const added = await db.products.get(id as number);
    if (added) {
    try {
    const st = Number(added.stock) || 0;
    if (st > 0) {
    await db.productBatches.add({
    productId: added.id!,
    batchNumber: newSkuBatchNumber.trim() || "OPENING",
    quantity: st,
    unitCost: Number(added.purchasePrice) || 0,
    salePrice: Number(added.salePrice) || 0,
    expiryDate: added.expiryDate || "",
    receivedAt: new Date().toISOString()
    });
    await recomputeProductCostsFromBatches(added.id!);
    }
    setProductHits((prev) => [added, ...prev.filter((p) => p.id !== added.id)]);
    setCurrentItem({
    productId: added.id,
    name: added.name,
    cost: Number(added.purchasePrice) || 0,
    price: Number(added.salePrice) || 0,
    quantity: "",
    batchNumber: "",
    expiryDate: "",
    });
    setShowProductCreationModal(false);
    setIsAddingCustomCategory(false);
    setCustomCategoryName("");
    setNewSkuBatchNumber("");
    setNewProductForm(initialProductState);
    setShowProductDropdown(true);
    clearFormDraft("purchase-sku");
    showSuccess(
    "New SKU added",
    "It is now in the lookup — enter quantity and click Stage Item to add to purchase.",
    );
    notifyInventoryChanged();
    } catch (batchErr: any) {
    if (added.id) {
      try {
        await db.products.delete(added.id);
      } catch {
        /* ignore compensation failure */
      }
    }
    throw batchErr;
    }
    }
    } catch (err: any) {
    console.error("New product save error:", err);
    showError("Could not save new SKU", err?.message || String(err));
    }
    };
    const commitPurchase = async () => {
    if (stagedItems.length === 0 || !selectedCompany || isProcessing) return;
    setIsProcessing(true);
    setShowConfirmCommit(false);
    try {
    await db.transaction(
    "rw",
    ["products", "transactionLogs", "companies", "productBatches"],
    async () => {
    const totalBill = stagedItems.reduce(
    (sum, item) => sum + item.total,
    0,
    );
    let oldInvoice: Transaction | null = null;
    if (isEditingInvoice && selectedInvoice) {
    oldInvoice =
    (await db.transactionLogs.get(selectedInvoice.id!)) ?? null;
    if (oldInvoice) {
    const oldItems = oldInvoice.items ?? [];
    /** Units already sold / consumed from each original line’s batch (invoice qty − still in batch). */
    const preSold: number[] = [];
    for (const line of oldItems) {
    const it = line as TransactionItem & { batchId?: number };
    const invoiceLineQty = Number(it.quantity) || 0;
    let qRem = 0;
    if (it.batchId) {
    const b = await db.productBatches.get(it.batchId);
    qRem = b ? Number(b.quantity) || 0 : 0;
    } else {
    const lots = await db.productBatches
    .where("productId")
    .equals(it.productId)
    .toArray();
    const match = lots.find(
    (l) =>
    String(l.batchNumber || "").trim() ===
    String(it.batchNumber || "").trim()
    );
    qRem = match ? Number(match.quantity) || 0 : invoiceLineQty;
    }
    preSold.push(Math.max(0, invoiceLineQty - qRem));
    }
    const usedMatch = new Set<number>();
    const matchPerStaged: number[] = [];
    for (let si = 0; si < stagedItems.length; si++) {
    const s = stagedItems[si] as StagedPurchaseLine & {
    batchId?: number;
    };
    const oi = findMatchingOldLineIndexForPurchaseEdit(
    s,
    oldItems,
    usedMatch,
    si,
    );
    matchPerStaged.push(oi);
    if (oi >= 0) usedMatch.add(oi);
    }
    for (let si = 0; si < stagedItems.length; si++) {
    const oi = matchPerStaged[si];
    const sold = oi >= 0 ? preSold[oi] ?? 0 : 0;
    const want = Number(stagedItems[si].quantity) || 0;
    if (oi >= 0 && want + 1e-4 < sold) {
    throw new Error(
    `“${stagedItems[si].productName}”: invoice qty (${want}) cannot be less than units already sold from this shipment (${sold.toFixed(3)}). Increase the line qty or remove the line.`,
    );
    }
    }
    const adjusted: StagedPurchaseLine[] = [];
    for (let si = 0; si < stagedItems.length; si++) {
    const s = stagedItems[si] as StagedPurchaseLine & {
    batchId?: number;
    };
    const oi = matchPerStaged[si];
    const sold = oi >= 0 ? preSold[oi] ?? 0 : 0;
    const want = Number(s.quantity) || 0;
    const eff = Math.max(0, want - sold);
    if (eff <= 0) continue;
    const uc = Number(s.unitPrice) || 0;
    adjusted.push({
    ...s,
    invoiceQty: want,
    quantity: eff,
    total: want * uc,
    });
    }
    if (adjusted.length === 0) {
    throw new Error(
    "No stock left to receive on this bill — quantities are at or below what was already sold from these lots. Increase a line qty or cancel.",
    );
    }
    const editTotalBill = stagedItems.reduce(
    (sum, row) =>
    sum +
    (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
    0,
    );
    for (const line of oldItems) {
    const it = line as TransactionItem & { batchId?: number };
    if (it.batchId) {
    const b = await db.productBatches.get(it.batchId);
    if (b) await db.productBatches.delete(it.batchId);
    } else {
    await revertPurchaseQuantityLegacy(
    it.productId,
    it.quantity,
    );
    }
    }
    const committedItems =
    await buildPurchaseCommittedItems(adjusted);
    const transaction: Transaction = {
    ...selectedInvoice,
    date: new Date(purchaseDate),
    companyId: selectedCompany.id,
    companyName: selectedCompany.name,
    type: "PURCHASE",
    totalAmount: editTotalBill,
    items: committedItems,
    notes: invoiceNo
    ? `Updated Bill: ${invoiceNo}`
    : "Registry Adjustment",
    newBalance: (selectedInvoice.oldBalance || 0) + editTotalBill,
    };
    await db.transactionLogs.update(selectedInvoice.id!, transaction);
    }
    } else {
    const committedItems = await buildPurchaseCommittedItems(stagedItems);
    const dateVal = purchaseDate ? new Date(purchaseDate) : new Date();
    const transaction = {
    date: dateVal,
    companyId: selectedCompany.id ?? null,
    companyName: selectedCompany.name ?? "",
    type: "PURCHASE" as const,
    totalAmount: Number(totalBill) || 0,
    paidAmount: 0,
    discount: 0,
    items: committedItems,
    notes: invoiceNo
    ? `Supplier Invoice: ${invoiceNo}`
    : "Direct Purchase Registry",
    oldBalance: Number(companyBalance) || 0,
    newBalance: Number(companyBalance) + Number(totalBill) || 0,
    isDeleted: false,
    };
    await db.transactionLogs.add(transaction);
    }
    const touchedIds = new Set<number>();
    if (oldInvoice) {
    for (const line of oldInvoice.items ?? []) {
    const it = line as TransactionItem;
    if (it.productId != null) touchedIds.add(it.productId);
    }
    }
    for (const item of stagedItems) {
    touchedIds.add(item.productId);
    }
    for (const pid of touchedIds) {
    await recomputeProductCostsFromBatches(pid);
    }
    }
    );
    showSuccess("Registry synchronized", "Purchase saved successfully.");
    clearFormDraft("purchase");
    setIsModalOpen(false);
    setIsEditingInvoice(false);
    setStagedItems([]);
    setSelectedCompany(null);
    setSelectedInvoice(null);
    void loadLookups();
    refreshPurchases();
    notifyInventoryChanged();
    notifyLedgerChanged();
    } catch (err: any) {
    console.error("Purchase commit error:", err);
    const msg = err?.message || String(err);
    showError("Purchase failed", msg || "Check console for details.");
    } finally {
    setIsProcessing(false);
    }
    };
    const loadFullPurchase = async (id: number) => {
    const tx = await db.transactionLogs.get(id);
    if (!tx || tx.isDeleted || tx.type !== "PURCHASE") return null;
    return tx as Transaction;
    };
    const handleOpenEdit = async (tx: Transaction) => {
    const full = (await loadFullPurchase(tx.id!)) || tx;
    setSelectedInvoice(full);
    let company: Company | null = null;
    if (full.companyId) {
      const row = await db.companies.get(full.companyId);
      if (row && !row.isDeleted) company = row as Company;
    }
    if (company) {
      setSelectedCompany(company);
      const history = (await db.transactionLogs.query({
        where: [
          { col: "isDeleted", op: "=", val: 0 },
          { col: "companyId", val: company.id! },
          {
            col: "type",
            op: "IN",
            val: ["PURCHASE", "PAYMENT", "PURCHASE_RETURN"],
          },
        ],
        columns: ["type", "totalAmount", "paidAmount", "isDeleted"],
      })) as Transaction[];
      setCompanyBalance(
        computeCompanyBalance(company.openingBalance, history)
      );
    }
    setStagedItems((full.items ?? []).map((i) => ({ ...i })));
    setInvoiceNo(full.notes || "");
    setPurchaseDate(new Date(full.date).toISOString().split("T")[0]);
    setIsEditingInvoice(true);
    setIsModalOpen(true);
    };
    const hardDeleteInvoice = async (tx: Transaction) => {
    const full = (await loadFullPurchase(tx.id!)) || tx;
    if (
    !window.confirm(
    `CRITICAL SECURITY ACTION: You are about to PERMANENTLY DELETE Purchase #${full.id}.\n\nThis will subtract the physical stock and revert the supplier debt. Continue?`,
    )
    )
    return;
    try {
    await db.transaction(
    "rw",
    ["products", "transactionLogs", "companies", "productBatches"],
    async () => {
    for (const line of full.items ?? []) {
    const it = line as TransactionItem & { batchId?: number };
    if (it.batchId) {
    await db.productBatches.delete(it.batchId);
    } else {
    await revertPurchaseQuantityLegacy(it.productId, it.quantity);
    }
    await recomputeProductCostsFromBatches(it.productId);
    }
    await db.transactionLogs.delete(full.id!);
    }
    );
    showSuccess("Purged", "Document purged and registry reconciled.");
    void loadLookups();
    refreshPurchases();
    notifyInventoryChanged();
    notifyLedgerChanged();
    } catch (err: any) {
    console.error("Purchase purge error:", err);
    showError("Could not purge purchase", err?.message || String(err));
    }
    };
    useEffect(() => {
    const state = location.state as { editId?: number; deleteId?: number } | null;
    if (!state?.editId && !state?.deleteId) return;
    navigate(location.pathname, { replace: true, state: null });
    (async () => {
    const id = state.editId ?? state.deleteId;
    if (id == null) return;
    const tx = await db.transactionLogs.get(id);
    if (!tx || tx.isDeleted || tx.type !== "PURCHASE") {
    showError("Not found", "Purchase record was not found.");
    return;
    }
    if (state.editId) handleOpenEdit(tx);
    if (state.deleteId) await hardDeleteInvoice(tx);
    })();
    }, [location.state]);
    const handlePrintPurchaseVoucher = () => {
    requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
    });
    };
    const handleDownloadInvoicePDF = async (tx: Transaction) => {
    if (!simplePdfRef.current) return;
    setIsExporting(true);
    try {
    const full = (await loadFullPurchase(tx.id!)) || tx;
    setSelectedInvoice(full);
    await new Promise((r) => setTimeout(r, 150));
    const el = simplePdfRef.current;
    if (!el) {
    setIsExporting(false);
    return;
    }
    const { exportElementToPdf } = await import("../utils/pdfExport");
    await exportElementToPdf(el, `Purchase_${tx.id}`, {
    scale: 1.5,
    backgroundColor: "#ffffff",
    });
    } catch (err) {
    console.error(err);
    showError("PDF export failed", "Could not generate the purchase PDF.");
    } finally {
    setIsExporting(false);
    }
    };
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    hasMore,
    loadMore,
    loading: listLoading,
  } = useDbPagination<Transaction>(
    async ({ pageSize: size, offset }) => {
      const where: DbWhere = [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "type", op: "=", val: "PURCHASE" },
      ];
      if (filterCompany !== "All") {
        where.push({ col: "companyName", val: filterCompany });
      }
      if (startDate) where.push({ col: "date", op: ">=", val: startDate });
      if (endDate) {
        where.push({ col: "date", op: "<=", val: `${endDate}T23:59:59.999Z` });
      }
      const term = (listSearch || searchQuery).trim();
      const orWhere: DbWhere = term
        ? [
            { col: "companyName", op: "LIKE", val: `%${term}%` },
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
      return { rows: rows as Transaction[], total: count };
    },
    [listSearch, searchQuery, filterCompany, startDate, endDate, purchasesVersion],
    undefined,
    `purchases:${listSearch}:${searchQuery}:${filterCompany}:${startDate}:${endDate}:${purchasesVersion}`
  );

  const inputStyle = { colorScheme: darkMode ? "dark" : "light" };

  const openNewShipment = () => {
    setIsEditingInvoice(false);
    const draft = readFormDraft<{
      companyId?: number;
      invoiceNo?: string;
      purchaseDate?: string;
      stagedItems?: any[];
      currentItem?: typeof currentItem;
    }>("purchase");
    if (draft) {
      setInvoiceNo(draft.invoiceNo || "");
      if (draft.purchaseDate) setPurchaseDate(draft.purchaseDate);
      setStagedItems(draft.stagedItems || []);
      if (draft.currentItem) setCurrentItem(draft.currentItem);
      if (draft.companyId) {
        void db.companies.get(draft.companyId).then((row) => {
          if (row) setSelectedCompany(row as Company);
        });
      } else {
        setSelectedCompany(null);
      }
    } else {
      setSelectedCompany(null);
      setStagedItems([]);
      setInvoiceNo("");
    }
    setIsModalOpen(true);
  };

  const savePurchaseDraft = () => {
    writeFormDraft("purchase", {
      companyId: selectedCompany?.id,
      invoiceNo,
      purchaseDate,
      stagedItems,
      currentItem,
    });
    showSuccess("Draft saved", "This purchase will reopen with these lines.");
  };

  useOpenNewFromQuery(openNewShipment);

  return (
    <div className="space-y-3 pb-6 w-full min-h-0 h-full flex flex-col">
      <div className="flex items-center justify-end gap-3 px-1 shrink-0">
        <button
          onClick={openNewShipment}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shrink-0"
        >
          <PlusSquare size={14} /> New Shipment
        </button>
      </div>

      {/* FILTER BAR */}
      <div
        className={`p-3 rounded-2xl border flex flex-wrap items-end gap-3 no-print ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800"
            : "bg-white border-gray-100 shadow-sm"
        }`}
      >
        <div className="space-y-2 flex-1 min-w-[180px] max-w-sm">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
            Search
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search supplier or doc #…"
              className={`w-full pl-9 pr-3 py-3.5 rounded-2xl text-xs font-bold outline-none border-none ring-1 ${
                darkMode
                  ? "bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600"
                  : "bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400"
              }`}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
            Supplier Entity
          </label>
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className={`border-none rounded-2xl px-5 py-3.5 text-[10px] font-black uppercase outline-none ring-1 transition-all ${
              darkMode
                ? "bg-gray-900 text-white ring-gray-800"
                : "bg-gray-50 text-gray-900 ring-gray-200"
            }`}
          >
            <option value="All">All Suppliers</option>
            {companies.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
            Date Frame
          </label>
          <div
            className={`flex items-center gap-2 p-1.5 rounded-2xl border ${
              darkMode
                ? "bg-gray-900 border-gray-800"
                : "bg-gray-50 border-gray-200 shadow-sm"
            }`}
          >
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
              className={`bg-transparent px-3 py-1.5 outline-none text-[10px] font-black uppercase ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            />
            <div className="w-4 h-0.5 bg-gray-500/20" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
              className={`bg-transparent px-3 py-1.5 outline-none text-[10px] font-black uppercase ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            />
          </div>
        </div>

        <button
          onClick={() => {
            setListSearch("");
            setSearchQuery("");
            setFilterCompany("All");
            setStartDate("");
            setEndDate("");
          }}
          className={`p-3.5 rounded-2xl transition-all ${
            darkMode
              ? "bg-gray-800 text-gray-500 hover:text-white"
              : "bg-gray-100 text-gray-400 hover:text-blue-500"
          }`}
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <div
        className={`rounded-[48px] border overflow-hidden flex-1 min-h-[280px] relative flex flex-col ${
          darkMode
            ? "bg-[#1a1d23] border-gray-800"
            : "bg-white border-gray-100 shadow-2xl"
        }`}
      >
        <div className="overflow-auto flex-1 min-h-[280px] custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr
                className={`text-[10px] font-black uppercase tracking-widest ${
                  darkMode
                    ? "bg-[#1a1d23] text-gray-500"
                    : "bg-white text-gray-400"
                } border-b border-gray-800/10`}
              >
                <th className="py-6 px-10">Registry ID</th>
                <th className="py-6 px-4">Supplier Entity</th>
                <th className="py-6 px-4 text-right">Magnitude (AFN)</th>
                <th className="py-6 px-10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                darkMode ? "divide-gray-800/40" : "divide-gray-50"
              }`}
            >
              {pageItems.map((p) => (
                <tr
                  key={p.id}
                  className="group hover:bg-blue-500/5 transition-all"
                >
                  <td className="py-6 px-10">
                    <p
                      className={`text-sm font-black ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      #PUR-{p.id}
                    </p>
                    <p
                      className={`text-[10px] font-bold ${
                        darkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {new Date(p.date).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="py-6 px-4">
                    <p
                      className={`text-sm font-black uppercase ${
                        darkMode ? "text-gray-200" : "text-gray-700"
                      }`}
                    >
                      {p.companyName}
                    </p>
                  </td>
                  <td className="py-6 px-4 text-right">
                    <p className="text-sm font-black text-blue-600">
                      AFN {p.totalAmount.toLocaleString()}
                    </p>
                  </td>
                  <td className="py-6 px-10 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={async () => {
                          const full = await loadFullPurchase(p.id!);
                          if (full) setSelectedInvoice(full);
                        }}
                        className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-blue-500"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-amber-500"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => hardDeleteInvoice(p)}
                        className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))},
              {total === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-40 text-center opacity-30 italic font-black uppercase tracking-[0.4em]"
                  >
                    No shipment records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

      {/* NEW/EDIT SHIPMENT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80"
            />
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              className={`relative w-[min(98vw,1100px)] max-h-[min(88vh,720px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode
                  ? "bg-[#161a20] border border-gray-800"
                  : "bg-white border border-gray-100"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex justify-between items-center bg-gray-500/5 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                    <ShoppingBag size={16} />
                  </div>
                  <div>
                    <h3
                      className={`text-xl font-black uppercase tracking-widest ${
                        darkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {isEditingInvoice
                        ? "Modify Shipment"
                        : "Stock Inflow Registry"}
                    </h3>
                    <p className="text-[10px] text-gray-500 font-black uppercase mt-1">
                      Register incoming inventory shipments
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-3 text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
                <div
                  className={`w-full lg:w-[340px] border-r border-gray-800/10 p-3 flex flex-col space-y-3 overflow-y-auto custom-scrollbar ${
                    darkMode ? "bg-black/20" : "bg-gray-50"
                  }`}
                >
                  <div className="space-y-4" ref={companyDropdownRef}>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Supplier Node
                    </label>
                    <div className="relative">
                      {selectedCompany ? (
                        <div
                          className={`w-full p-4 rounded-[24px] border flex items-center justify-between gap-2 ${
                            darkMode
                              ? "bg-gray-900 border-gray-800"
                              : "bg-white border-gray-200 shadow-sm"
                          }`}
                        >
                          <span
                            className={`text-sm font-black truncate ${
                              darkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {selectedCompany.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(null);
                              setCompanyBalance(0);
                              setShowCompanyDropdown(true);
                              setSupplierSearch("");
                              setSupplierHits([]);
                            }}
                            className="text-[10px] font-black uppercase text-blue-500 shrink-0"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <>
                          <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                            size={16}
                          />
                          <input
                            type="search"
                            autoComplete="off"
                            placeholder="Type to search supplier…"
                            value={supplierSearch}
                            onFocus={() => setShowCompanyDropdown(true)}
                            onChange={(e) => {
                              setSupplierSearch(e.target.value);
                              setShowCompanyDropdown(true);
                            }}
                            className={`w-full pl-10 pr-4 py-4 rounded-2xl text-xs font-black border-none ring-1 outline-none ${
                              darkMode
                                ? "bg-gray-900 text-white ring-gray-800 focus:ring-blue-500"
                                : "bg-white ring-gray-200 focus:ring-blue-500"
                            }`}
                          />
                        </>
                      )}
                      {showCompanyDropdown && !selectedCompany && (
                        <div
                          className={`absolute z-[160] left-0 right-0 top-full mt-2 rounded-[24px] border overflow-hidden shadow-2xl p-2 ${
                            darkMode
                              ? "bg-gray-900 border-gray-700"
                              : "bg-white border-gray-100"
                          }`}
                        >
                          <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                            {supplierSearching ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                Searching…
                              </p>
                            ) : debouncedSupplierSearch.length < 1 ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                Type a supplier name to search
                              </p>
                            ) : supplierHits.length === 0 ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                No matching suppliers
                              </p>
                            ) : (
                              supplierHits.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => void handleSelectCompany(c)}
                                  className={`w-full p-4 text-left text-xs font-black uppercase rounded-2xl hover:bg-blue-500/10 hover:text-blue-500 transition-colors ${
                                    darkMode ? "text-white" : "text-gray-900"
                                  }`}
                                >
                                  {c.name}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-800/10 space-y-6">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        Add Stock Item
                      </label>
                      <button
                        onClick={() => {
                          const draft = readFormDraft<{
                            form?: Partial<Product>;
                            batch?: string;
                          }>("purchase-sku");
                          if (draft?.form) {
                            setNewProductForm({
                              ...initialProductState,
                              ...draft.form,
                              company:
                                draft.form.company ||
                                selectedCompany?.name ||
                                "",
                            });
                            setNewSkuBatchNumber(draft.batch || "");
                          } else {
                            setNewProductForm({
                              ...initialProductState,
                              company: selectedCompany?.name || "",
                            });
                            setNewSkuBatchNumber("");
                          }
                          setShowProductCreationModal(true);
                        }}
                        className="text-[10px] font-black text-blue-500 hover:underline uppercase"
                      >
                        + Enroll New SKU
                      </button>
                    </div>
                    <div className="relative" ref={productComboRef}>
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        size={16}
                      />
                      <input
                        type="text"
                        autoComplete="off"
                        placeholder="Search product name or SKU..."
                        onFocus={() => setShowProductDropdown(true)}
                        onChange={(e) =>
                          setCurrentItem({
                            ...currentItem,
                            name: e.target.value,
                          })
                        }
                        value={currentItem.name}
                        className={`w-full pl-10 pr-11 py-4 rounded-2xl text-xs font-black border-none ring-1 outline-none transition-all ${
                          darkMode
                            ? "bg-gray-900 text-white ring-gray-800 focus:ring-blue-500"
                            : "bg-white ring-gray-200 focus:ring-blue-500"
                        }`}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label="Toggle product list"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setShowProductDropdown((v) => !v);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-500 hover:bg-gray-500/10 hover:text-gray-300"
                      >
                        <ChevronDown
                          size={18}
                          className={`transition-transform duration-200 ${
                            showProductDropdown ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                    {showProductDropdown &&
                      productMenuPos &&
                      createPortal(
                        <div
                          ref={productMenuRef}
                          style={{
                            position: "fixed",
                            top: productMenuPos.top,
                            left: productMenuPos.left,
                            width: productMenuPos.width,
                            zIndex: 200,
                            maxHeight: Math.min(
                              320,
                              typeof window !== "undefined"
                                ? window.innerHeight - productMenuPos.top - 12
                                : 320
                            )
                          }}
                          className={`flex flex-col min-h-0 rounded-[24px] border shadow-2xl overflow-hidden ${
                            darkMode
                              ? "bg-gray-900 border-gray-700"
                              : "bg-white border-gray-100"
                          }`}
                        >
                          <div
                            className={`px-3 py-2 border-b shrink-0 ${
                              darkMode
                                ? "border-gray-800 bg-black/20"
                                : "border-gray-100 bg-gray-50"
                            }`}
                          >
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">
                              Matching products
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              Type in the field above to search by name or SKU
                            </p>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-2">
                            {!selectedCompany ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                Select a supplier first
                              </p>
                            ) : productSearching ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                Searching…
                              </p>
                            ) : debouncedProductSearch.length < 1 ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                Type a product name or SKU to search
                              </p>
                            ) : productHits.length === 0 ? (
                              <p className="px-3 py-4 text-[11px] font-bold text-gray-500 text-center">
                                No matching products. Add a SKU or try
                                another search.
                              </p>
                            ) : (
                              productHits.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setCurrentItem({
                                      ...currentItem,
                                      productId: p.id,
                                      name: p.name,
                                      cost: p.purchasePrice,
                                      price: p.salePrice,
                                    });
                                    setShowProductDropdown(false);
                                  }}
                                  className={`w-full p-3 text-left rounded-2xl hover:bg-blue-500/10 transition-colors ${
                                    darkMode ? "text-white" : "text-gray-900"
                                  }`}
                                >
                                  <p className="text-xs font-black uppercase">
                                    {p.skuCode ? `[${p.skuCode}] ` : ""}
                                    {p.name}
                                  </p>
                                </button>
                              ))
                            )}
                          </div>
                        </div>,
                        document.body
                      )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-500 uppercase">
                          Batch #
                        </p>
                        <input
                          type="text"
                          placeholder="Required"
                          value={currentItem.batchNumber}
                          onChange={(e) =>
                            setCurrentItem({
                              ...currentItem,
                              batchNumber: e.target.value,
                            })
                          }
                          className={`w-full p-3 rounded-2xl text-xs font-black ring-1 ${
                            darkMode
                              ? "bg-gray-900 text-white ring-gray-800"
                              : "bg-white ring-gray-200"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-500 uppercase">
                          Batch expiry
                        </p>
                        <input
                          type="date"
                          value={currentItem.expiryDate}
                          onChange={(e) =>
                            setCurrentItem({
                              ...currentItem,
                              expiryDate: e.target.value,
                            })
                          }
                          className={`w-full p-3 rounded-2xl text-xs font-bold ring-1 outline-none ${
                            darkMode
                              ? "bg-gray-900 text-white ring-gray-800"
                              : "bg-white ring-gray-200"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-500 uppercase">
                          Qty
                        </p>
                        <input
                          type="number"
                          placeholder="0"
                          value={currentItem.quantity}
                          onChange={(e) =>
                            setCurrentItem({
                              ...currentItem,
                              quantity: e.target.value,
                            })
                          }
                          className={`w-full p-3 rounded-2xl text-xs font-black ring-1 ${
                            darkMode
                              ? "bg-gray-900 text-white ring-gray-800"
                              : "bg-white"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-500 uppercase">
                          Unit Cost
                        </p>
                        <input
                          type="number"
                          placeholder="0"
                          value={currentItem.cost}
                          onChange={(e) =>
                            setCurrentItem({
                              ...currentItem,
                              cost: e.target.value,
                            })
                          }
                          className={`w-full p-3 rounded-2xl text-xs font-black ring-1 ${
                            darkMode
                              ? "bg-gray-900 text-white ring-gray-800"
                              : "bg-white"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-gray-500 uppercase">
                          Sell Price
                        </p>
                        <input
                          type="number"
                          placeholder="0"
                          value={currentItem.price}
                          onChange={(e) =>
                            setCurrentItem({
                              ...currentItem,
                              price: e.target.value,
                            })
                          }
                          className={`w-full p-3 rounded-2xl text-xs font-black ring-1 ${
                            darkMode
                              ? "bg-gray-900 text-white ring-gray-800"
                              : "bg-white"
                          }`}
                        />
                      </div>
                    </div>
                    <button
                      onClick={addItemToStage}
                      className="w-full py-4 bg-gray-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-700 shadow-xl transition-all"
                    >
                      Stage Item
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-3 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-4 space-y-4">
                    {stagedItems.map((item, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-6 rounded-[32px] border flex items-center justify-between transition-all ${
                          darkMode
                            ? "bg-[#0f1115] border-gray-800"
                            : "bg-gray-50 shadow-inner"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-black uppercase ${
                              darkMode ? "text-white" : "text-gray-900"
                            } truncate`}
                          >
                            {item.productName}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 mt-1">
                            <p className="text-[10px] text-gray-500 font-bold uppercase">
                              {item.quantity} units × AFN{" "},
                              {item.unitPrice.toLocaleString()}
                            </p>
                            <span className="text-[10px] text-blue-500 font-black uppercase bg-blue-500/5 px-2 rounded-lg">
                              Target Sell: AFN {item.salePrice.toLocaleString()}
                            </span>
                            {(item as StagedPurchaseLine).batchNumber && (
                              <span className="text-[10px] text-amber-500 font-black uppercase bg-amber-500/10 px-2 rounded-lg">
                                Batch: {(item as StagedPurchaseLine).batchNumber}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-10">
                          <div className="text-right">
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                              Magnitude
                            </p>
                            <p
                              className={`text-sm font-black ${
                                darkMode ? "text-white" : "text-gray-900"
                              }`}
                            >
                              AFN {item.total.toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setStagedItems(
                                stagedItems.filter((_, i) => i !== idx)
                              )
                            }
                            className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </motion.div>
                    ))},
                    {stagedItems.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale py-40">
                        <Box size={100} />
                        <p className="mt-6 font-black uppercase tracking-[0.4em] text-sm">
                          Awaiting Items Staging
                        </p>
                      </div>
                    )}
                  </div>
                  <div
                    className={`mt-4 shrink-0 p-6 rounded-[32px] border-2 border-dashed flex flex-col sm:flex-row items-center justify-between gap-6 ${
                      darkMode
                        ? "bg-blue-500/5 border-blue-500/20"
                        : "bg-blue-50 border-blue-100"
                    }`}
                  >
                    <div>
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">
                        Aggregate Bill Magnitude
                      </p>
                      <h3
                        className={`text-3xl font-black ${
                          darkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        AFN{" "},
                        {stagedItems
                          .reduce((s, i) => s + i.total, 0)
                          .toLocaleString()}
                      </h3>
                    </div>
                    <SaveDraftButton darkMode={darkMode} onClick={savePurchaseDraft} className="!flex-none px-6 py-4 rounded-2xl" />
                    <button
                      type="button"
                      data-ctrl-s-save
                      disabled={stagedItems.length === 0 || !selectedCompany}
                      onClick={() => setShowConfirmCommit(true)}
                      className={`px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl transition-all ${
                        stagedItems.length === 0
                          ? "bg-gray-600 grayscale"
                          : "bg-blue-600 text-white hover:scale-105 active:scale-95 shadow-blue-500/30"
                      }`}
                    >
                      Authorize Sync
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NEW SKU CREATION MODAL */}
      <AnimatePresence>
        {showProductCreationModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProductCreationModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`relative w-[min(98vw,1180px)] flex flex-col rounded-2xl overflow-hidden shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-gray-800/10 flex justify-between items-center bg-gray-500/5 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-600 text-white rounded-2xl">
                    <Package size={24} />
                  </div>
                  <h3
                    className={`text-sm font-black uppercase tracking-tight ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Enroll New SKU
                  </h3>
                </div>
                <button
                  onClick={() => setShowProductCreationModal(false)}
                  className="p-2 text-gray-500"
                >
                  <X size={28} />
                </button>
              </div>
              <form
                onSubmit={handleSaveNewProduct}
                className="overflow-hidden p-3 space-y-2"
              >
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Full Product Name
                    </label>
                    <input
                      required
                      value={newProductForm.name}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          name: e.target.value,
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none outline-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800 focus:ring-red-500"
                          : "bg-gray-50"
                      }`}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Category
                    </label>
                    {isAddingCustomCategory ? (
                      <div className="flex gap-4">
                        <input
                          autoFocus
                          value={customCategoryName}
                          onChange={(e) =>
                            setCustomCategoryName(e.target.value)
                          }
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border-none ring-1 ${
                            darkMode
                              ? "bg-gray-900 text-white ring-gray-800"
                              : "bg-gray-50"
                          }`}
                          placeholder="New Category..."
                        />
                        <button
                          type="button"
                          onClick={() => setIsAddingCustomCategory(false)}
                          className="p-4 bg-gray-500/10 rounded-2xl"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={newProductForm.category}
                        onChange={(e) => {
                          if (e.target.value === "ADD_NEW")
                            setIsAddingCustomCategory(true);
                          else
                            setNewProductForm({
                              ...newProductForm,
                              category: e.target.value as any
                            });
                        }}
                        className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none outline-none ring-1 ${
                          darkMode
                            ? "bg-gray-900 text-white ring-gray-800"
                            : "bg-gray-50"
                        }`}
                      >
                        {Object.values(Category).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="ADD_NEW">+ Add New Category...</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Initial on-hand qty (optional)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={newProductForm.stock ?? ""}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          stock: Number(e.target.value)
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-black border-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Batch # (if qty &gt; 0)
                    </label>
                    <input
                      type="text"
                      value={newSkuBatchNumber}
                      onChange={(e) => setNewSkuBatchNumber(e.target.value)}
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-black border-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                      placeholder="e.g. BN-2026-001"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      SKU Code
                    </label>
                    <input
                      type="text"
                      value={newProductForm.skuCode}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          skuCode: e.target.value,
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-black border-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                      placeholder="ID-XXX"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Unit Cost
                    </label>
                    <input
                      required
                      type="number"
                      value={newProductForm.purchasePrice ?? ""}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          purchasePrice: e.target.value === "" ? (0 as number) : Number(e.target.value)
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-black border-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Selling Price (Target)
                    </label>
                    <input
                      required
                      type="number"
                      value={newProductForm.salePrice ?? ""}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          salePrice: e.target.value === "" ? (0 as number) : Number(e.target.value)
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-black border-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest">
                      Measurement Unit
                    </label>
                    <select
                      value={newProductForm.unit}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          unit: e.target.value,
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none outline-none ring-1 ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                    >
                      {Object.values(UnitType).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest flex items-center gap-2">
                      <Calendar size={12} /> Expiry Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={newProductForm.expiryDate}
                      onChange={(e) =>
                        setNewProductForm({
                          ...newProductForm,
                          expiryDate: e.target.value,
                        })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none ring-1 outline-none ${
                        darkMode
                          ? "bg-gray-900 text-white ring-gray-800"
                          : "bg-gray-50"
                      }`}
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 px-2 tracking-widest flex items-center gap-2">
                    <Bell size={12} /> Low Stock Alert Qty
                  </label>
                  <input
                    type="number"
                    value={newProductForm.minStockLevel ?? ""}
                    onChange={(e) =>
                      setNewProductForm({
                        ...newProductForm,
                        minStockLevel: e.target.value === "" ? (0 as number) : Number(e.target.value)
                      })
                    }
                    className={`w-full px-2 py-1.5 rounded-lg text-xs font-black border-none outline-none ring-1 ${
                      darkMode
                        ? "bg-gray-900 text-white ring-gray-800"
                        : "bg-gray-50 shadow-inner"
                    }`}
                    placeholder="5"
                  />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Brand</label>
                    <select
                      value={newProductForm.company || selectedCompany?.name || ""}
                      onChange={(e) =>
                        setNewProductForm({ ...newProductForm, company: e.target.value })
                      }
                      className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none outline-none ring-1 ${
                        darkMode ? "bg-gray-900 text-white ring-gray-800" : "bg-gray-50"
                      }`}
                    >
                      <option value="">Select brand...</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {(
                    [
                      ["barcode", "Barcode"],
                      ["size", "Size"],
                      ["modelNumber", "Model"],
                      ["location", "Location"],
                      ["weight", "Weight"],
                      ["shelfLife", "Shelf life"],
                      ["colorHex", "Color"],
                      ["description", "Description"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">{label}</label>
                      <input
                        value={(newProductForm[key] as string) || ""}
                        onChange={(e) =>
                          setNewProductForm({ ...newProductForm, [key]: e.target.value })
                        }
                        className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none outline-none ring-1 ${
                          darkMode ? "bg-gray-900 text-white ring-gray-800" : "bg-gray-50"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowProductCreationModal(false)}
                    className="flex-1 py-2.5 text-[10px] font-black uppercase text-gray-500"
                  >
                    Discard
                  </button>
                  <SaveDraftButton
                    darkMode={darkMode}
                    onClick={() => {
                      writeFormDraft("purchase-sku", {
                        form: newProductForm,
                        batch: newSkuBatchNumber,
                      });
                      showSuccess("Draft saved", "This SKU form will reopen with these values.");
                    }}
                  />
                  <button
                    type="submit"
                    className="flex-[2] py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-xl hover:bg-red-700 transition-all"
                  >
                    Synchronize SKU
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* COMMIT CONFIRMATION */}
      <AnimatePresence>
        {showConfirmCommit && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmCommit(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`relative w-full max-w-sm p-10 rounded-[48px] text-center shadow-2xl ${
                darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white"
              }`}
            >
              <div className="w-20 h-20 bg-blue-500/10 text-blue-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                <ShieldCheck size={40} />
              </div>
              <h3
                className={`text-2xl font-black uppercase tracking-widest ${
                  darkMode ? "text-white" : "text-gray-900"
                } mb-2`}
              >
                Sync Registry?
              </h3>
              <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-10 leading-relaxed">
                This will adjust stock counts and update the supplier ledger
                balance.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowConfirmCommit(false)}
                  className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest ${
                    darkMode
                      ? "bg-gray-800 text-gray-400"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  Abort
                </button>
                <button
                  data-ctrl-s-save
                  onClick={commitPurchase}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all"
                >
                  Authorize
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VIEW SHIPMENT MODAL */}
      <AnimatePresence>
        {selectedInvoice && !isEditingInvoice && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInvoice(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md no-print"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`relative w-[min(96vw,920px)] max-h-[min(72vh,520px)] flex flex-col rounded-2xl overflow-hidden ${
                darkMode
                  ? "bg-[#1a1d23] border border-gray-800"
                  : "bg-white shadow-2xl"
              }`}
            >
              <div
                className={`p-8 border-b flex justify-between items-center no-print bg-gray-500/5 ${
                  darkMode ? "border-gray-700/50" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg">
                    <FileText size={20} />
                  </div>
                  <h3
                    className={`font-black text-xs uppercase tracking-widest ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Official Voucher Registry
                  </h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
                  <button
                    type="button"
                    onClick={handlePrintPurchaseVoucher}
                    className={`flex items-center gap-2 px-4 py-3 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                      darkMode
                        ? "bg-gray-800 text-white hover:bg-gray-700"
                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                    }`}
                  >
                    <Printer size={16} /> Print
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadInvoicePDF(selectedInvoice)}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-3 sm:px-6 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:scale-105 transition-all disabled:opacity-50"
                  >
                    <Download size={16} /> Save PDF
                  </button>
                  <button type="button" onClick={() => setSelectedInvoice(null)}>
                    <X size={28} className="text-gray-500 hover:text-red-500" />
                  </button>
                </div>
              </div>
              <div
                className={`flex-1 overflow-y-auto p-8 sm:p-10 custom-scrollbar ${
                  darkMode
                    ? "bg-[#14171c] text-gray-100"
                    : "bg-white text-gray-900"
                }`}
              >
                <h2
                  className={`text-3xl font-black uppercase ${
                    darkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Procurement Bill #PUR-{selectedInvoice.id}
                </h2>
                <p
                  className={`text-sm font-bold mb-8 uppercase ${
                    darkMode ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  Recorded:{" "},
                  {new Date(selectedInvoice.date).toLocaleDateString()}
                </p>
                <table className="w-full border-collapse">
                  <thead>
                    <tr
                      className={`border-b-2 text-xs font-black uppercase ${
                        darkMode
                          ? "border-gray-600 text-gray-400"
                          : "border-black text-black"
                      }`}
                    >
                      <th className="py-4 text-left">SKU Description</th>
                      <th className="py-4 text-center">Qty</th>
                      <th className="py-4 text-right">Cost</th>
                      <th className="py-4 text-right">Sum</th>
                    </tr>
                  </thead>
                  <tbody
                    className={
                      darkMode ? "divide-y divide-gray-800" : "divide-y divide-gray-100"
                    }
                  >
                    {(selectedInvoice.items ?? []).map((item, i) => (
                      <tr key={i} className="text-xs font-bold">
                        <td
                          className={`py-4 uppercase ${
                            darkMode ? "text-gray-200" : "text-gray-900"
                          }`}
                        >
                          {item.productName}
                        </td>
                        <td className="py-4 text-center">{item.quantity}</td>
                        <td
                          className={`py-4 text-right ${
                            darkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          AFN {item.unitPrice.toLocaleString()}
                        </td>
                        <td className="py-4 text-right font-black">
                          AFN {item.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div
                  className={`mt-10 pt-10 border-t-2 text-right ${
                    darkMode ? "border-gray-600" : "border-black"
                  }`}
                >
                  <p
                    className={`text-xs font-black uppercase mb-2 ${
                      darkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    Total Payable
                  </p>
                  <h3
                    className={`text-4xl font-black ${
                      darkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    AFN {selectedInvoice.totalAmount.toLocaleString()}
                  </h3>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PrintMountPortal>
        {selectedInvoice ? (
        <SimpleBookReportPage
          ref={simplePdfRef}
          printable={true}
          companyName={bizSettings?.companyName || "Spectrum Pro"}
          logoSrc={bizSettings?.logo}
          reportTitle={
            selectedInvoice
              ? `Purchase voucher #${selectedInvoice.id}`
              : "Purchase voucher"
          }
          periodLine={
            selectedInvoice
              ? `${new Date(selectedInvoice.date).toLocaleDateString()} · Vendor: ${
                  selectedInvoice.companyName || "—"
                }`
              : ""
          }
        >
          {bizSettings?.address || bizSettings?.phone ? (
            <p style={{ ...book.tag, marginBottom: "10px", fontSize: "8px" }}>
              {[bizSettings?.address, bizSettings?.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <div style={book.sectionLabel}>Stock lines</div>
          <table style={book.table}>
            <thead>
              <tr>
                <th style={book.th}>Description</th>
                <th style={{ ...book.th, ...book.thCenter }}>Qty</th>
                <th style={{ ...book.th, ...book.thRight }}>Unit cost</th>
                <th style={{ ...book.th, ...book.thRight }}>Line total</th>
              </tr>
            </thead>
            <tbody>
              {(selectedInvoice?.items ?? []).map((item, i) => (
                <tr key={i}>
                  <td style={book.td}>{item.productName}</td>
                  <td style={{ ...book.td, ...book.tdCenter }}>{item.quantity}</td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {item.unitPrice.toLocaleString()}
                  </td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {item.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table style={{ ...book.table, maxWidth: "240px", marginLeft: "auto" }}>
            <tbody>
              <tr>
                <td style={{ ...book.td, fontWeight: 700 }}>Bill total (AFN)</td>
                <td style={{ ...book.td, ...book.tdRight, fontWeight: 700 }}>
                  {(selectedInvoice?.totalAmount ?? 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ ...book.tag, marginTop: "24px", textAlign: "right" }}>
            Authorized signature: _______________________
          </p>
        </SimpleBookReportPage>
        ) : null}
      </PrintMountPortal>
    </div>
  );
}
