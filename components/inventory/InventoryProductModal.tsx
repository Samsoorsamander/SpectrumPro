import React, { useEffect, useRef, useState } from "react";
import {
  Package,
  Tag,
  Barcode,
  Building2,
  Calendar,
  ChevronLeft,
  Plus,
  X,
} from "lucide-react";
import { db } from "../../db";
import {
  Product,
  Category,
  UnitType,
  Company,
} from "../../types";
import { LandscapeModal } from "../ui/LandscapeModal";
import { SaveDraftButton } from "../ui/SaveDraftButton";
import { recomputeProductCostsFromBatches } from "../../batchFifo";
import { assertUniqueSkuCode } from "../../utils/skuUnique";
import { useFeedback } from "../../contexts/FeedbackContext";
import { clearFormDraft, readFormDraft, writeFormDraft } from "../../utils/formDraft";

const PRODUCT_DRAFT = "product";

const INITIAL_FORM: Partial<Product> = {
  name: "",
  category: Category.PAINT,
  company: "",
  size: "",
  unit: UnitType.PCS,
  stock: 0,
  purchasePrice: 0,
  salePrice: 0,
  minStockLevel: 5,
  skuCode: "",
  barcode: "",
  location: "",
  weight: "",
  description: "",
  modelNumber: "",
  expiryDate: "",
};

type Props = {
  darkMode: boolean;
  open: boolean;
  onClose: () => void;
  companies: Pick<Company, "id" | "name">[];
  /** null = new product */
  editProduct: Product | null;
  onSaved: () => void;
};

/**
 * Isolated product form — keeps keystrokes from re-rendering the inventory table.
 */
export function InventoryProductModal({
  darkMode,
  open,
  onClose,
  companies,
  editProduct,
  onSaved,
}: Props) {
  const { showSuccess, showError } = useFeedback();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>(INITIAL_FORM);
  const [initialBatchNumber, setInitialBatchNumber] = useState("");
  const [isAddingCustomUnit, setIsAddingCustomUnit] = useState(false);
  const [customUnitName, setCustomUnitName] = useState("");
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editProduct?.id) {
      setEditingId(editProduct.id);
      setFormData({ ...editProduct });
      setInitialBatchNumber("");
    } else {
      setEditingId(null);
      const draft = readFormDraft<{
        form?: Partial<Product>;
        batch?: string;
      }>(PRODUCT_DRAFT);
      setFormData({ ...INITIAL_FORM, ...(draft?.form ?? {}) });
      setInitialBatchNumber(draft?.batch ?? "");
    }
    setIsAddingCustomCategory(false);
    setIsAddingCustomUnit(false);
    setCustomCategoryName("");
    setCustomUnitName("");
    const t = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, editProduct]);

  const patch = (partial: Partial<Product>) =>
    setFormData((prev) => ({ ...prev, ...partial }));

  const resetForNew = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setInitialBatchNumber("");
    setIsAddingCustomCategory(false);
    setIsAddingCustomUnit(false);
    setCustomCategoryName("");
    setCustomUnitName("");
  };

  const saveRecord = async (): Promise<boolean> => {
    try {
      const finalUnit = isAddingCustomUnit ? customUnitName : formData.unit;
      const finalCategory = isAddingCustomCategory
        ? customCategoryName
        : formData.category;

      if (!formData.name?.trim()) {
        showError("Required field", "Please enter a product name.");
        return false;
      }
      if (!formData.company?.trim()) {
        showError("Required field", "Please select a brand.");
        return false;
      }
      if (!finalUnit) {
        showError("Required field", "Please specify a measurement unit.");
        return false;
      }
      if (!finalCategory) {
        showError("Required field", "Please specify a category.");
        return false;
      }

      const submissionData = {
        ...formData,
        name: formData.name.trim(),
        skuCode: (formData.skuCode || "").trim(),
        stock: Number(formData.stock) || 0,
        purchasePrice: Number(formData.purchasePrice) || 0,
        salePrice: Number(formData.salePrice) || 0,
        minStockLevel: Number(formData.minStockLevel) || 0,
        unit: finalUnit as Product["unit"],
        category: finalCategory as Product["category"],
        isDeleted: false,
      };

      await assertUniqueSkuCode(submissionData.skuCode, editingId);

      if (editingId) {
        await db.products.update(editingId, submissionData);
      } else {
        const id = await db.products.add(submissionData as Product);
        const st = Number(submissionData.stock) || 0;
        if (id && st > 0) {
          try {
            await db.productBatches.add({
              productId: id as number,
              batchNumber: initialBatchNumber.trim() || "OPENING",
              quantity: st,
              unitCost: Number(submissionData.purchasePrice) || 0,
              salePrice: Number(submissionData.salePrice) || 0,
              expiryDate: submissionData.expiryDate || "",
              receivedAt: new Date().toISOString(),
            });
            await recomputeProductCostsFromBatches(id as number);
          } catch (batchErr) {
            try {
              await db.products.delete(id as number);
            } catch {
              /* ignore compensation failure */
            }
            throw batchErr;
          }
        }
      }

      onSaved();
      clearFormDraft(PRODUCT_DRAFT);
      return true;
    } catch (err: unknown) {
      console.error("Product save error:", err);
      const message = err instanceof Error ? err.message : String(err);
      showError("Could not save product", message);
      return false;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const ok = await saveRecord();
      if (!ok) return;
      onClose();
      resetForNew();
      showSuccess("Saved", "Inventory record updated successfully.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndNew = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await saveRecord();
      if (!ok) return;
      resetForNew();
      showSuccess("Saved", "Product saved. Add the next SKU.");
      window.setTimeout(() => nameInputRef.current?.focus(), 0);
    } finally {
      setSaving(false);
    }
  };

  const loadPreviousProduct = async () => {
    if (editingId == null) {
      const rows = await db.products.query({
        where: [{ col: "isDeleted", op: "=", val: 0 }],
        orderBy: "id",
        orderDir: "DESC",
        limit: 1,
        columns: [
          "id",
          "name",
          "skuCode",
          "company",
          "category",
          "unit",
          "stock",
          "purchasePrice",
          "salePrice",
          "minStockLevel",
          "expiryDate",
          "barcode",
          "size",
          "location",
          "weight",
          "description",
          "modelNumber",
          "isDeleted",
        ],
      });
      const last = (rows as Product[])[0];
      if (!last) {
        showError("No records", "There is no previous product to load.");
        return;
      }
      setEditingId(last.id!);
      setFormData({ ...last });
      return;
    }
    const rows = await db.products.query({
      where: [
        { col: "isDeleted", op: "=", val: 0 },
        { col: "id", op: "<", val: editingId },
      ],
      orderBy: "id",
      orderDir: "DESC",
      limit: 1,
      columns: [
        "id",
        "name",
        "skuCode",
        "company",
        "category",
        "unit",
        "stock",
        "purchasePrice",
        "salePrice",
        "minStockLevel",
        "expiryDate",
        "barcode",
        "size",
        "location",
        "weight",
        "description",
        "modelNumber",
        "isDeleted",
      ],
    });
    const prev = (rows as Product[])[0];
    if (!prev) {
      showError("Start of list", "This is the first product record.");
      return;
    }
    setEditingId(prev.id!);
    setFormData({ ...prev });
  };

  const inputCls = `w-full px-2 py-1.5 rounded-lg text-xs font-bold border-none outline-none ring-1 ${
    darkMode
      ? "bg-gray-900 text-white ring-gray-800 focus:ring-red-500"
      : "bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500"
  }`;

  const saveDraft = () => {
    writeFormDraft(PRODUCT_DRAFT, {
      form: formData,
      batch: initialBatchNumber,
    });
    showSuccess("Draft saved", "This SKU form will reopen with these values.");
  };

  if (!open) return null;

  return (
    <LandscapeModal
      darkMode={darkMode}
      open={open}
      onClose={onClose}
      title={editingId ? "Modify Record" : "Enroll Asset"}
      subtitle="SKU parameters & initial levels"
      icon={<Package size={16} />}
      wide
      fit
      footer={
        <>
          <button
            type="button"
            onClick={() => void loadPreviousProduct()}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 ${
              darkMode
                ? "bg-gray-800 text-gray-300 hover:text-white"
                : "bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAndNew()}
            disabled={saving}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 ${
              darkMode
                ? "bg-gray-800 text-gray-300 hover:text-white"
                : "bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
          >
            <Plus size={14} /> New
          </button>
          <button
            type="submit"
            form="inventory-form"
            disabled={saving}
            className="flex-[1.5] py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50"
          >
            Save
          </button>
          {!editingId && (
            <SaveDraftButton darkMode={darkMode} onClick={saveDraft} />
          )}
        </>
      }
    >
      <form
        id="inventory-form"
        onSubmit={(e) => void handleSave(e)}
        className="grid grid-cols-3 lg:grid-cols-6 gap-x-2 gap-y-1.5"
      >
        <div className="col-span-2 space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
            <Tag size={10} /> Product Name
          </label>
          <input
            required
            autoFocus
            ref={nameInputRef}
            value={formData.name || ""}
            onChange={(e) => patch({ name: e.target.value })}
            className={inputCls}
            placeholder="e.g. Gloss White Enamel"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
            <Barcode size={10} /> SKU
          </label>
          <input
            value={formData.skuCode || ""}
            onChange={(e) => patch({ skuCode: e.target.value })}
            className={inputCls}
            placeholder="ID-001"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
            <Building2 size={10} /> Brand
          </label>
          <select
            required
            value={formData.company || ""}
            onChange={(e) => patch({ company: e.target.value })}
            className={inputCls}
          >
            <option value="">Select brand...</option>
            {companies.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
            Initial Stock
          </label>
          <input
            required
            type="number"
            value={formData.stock ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              patch({ stock: raw === "" ? undefined : Number(raw) });
            }}
            className={inputCls}
          />
        </div>
        {!editingId && (
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
              Opening batch #
            </label>
            <input
              type="text"
              value={initialBatchNumber}
              onChange={(e) => setInitialBatchNumber(e.target.value)}
              placeholder="BN-2026-001"
              className={inputCls}
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
            Purchase Price
          </label>
          <input
            required
            type="number"
            value={formData.purchasePrice ?? ""}
            onChange={(e) =>
              patch({
                purchasePrice:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
            Sale Price
          </label>
          <input
            required
            type="number"
            value={formData.salePrice ?? ""}
            onChange={(e) =>
              patch({
                salePrice:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
            <Calendar size={10} /> Expiry
          </label>
          <input
            type="date"
            value={formData.expiryDate || ""}
            onChange={(e) => patch({ expiryDate: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
            Low Stock Alert
          </label>
          <input
            type="number"
            value={formData.minStockLevel ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              patch({ minStockLevel: raw === "" ? undefined : Number(raw) });
            }}
            className={inputCls}
            placeholder="Alert qty..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Unit
          </label>
          {isAddingCustomUnit ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={customUnitName}
                onChange={(e) => setCustomUnitName(e.target.value)}
                className={`flex-1 ${inputCls}`}
                placeholder="New Unit..."
              />
              <button
                type="button"
                onClick={() => setIsAddingCustomUnit(false)}
                className="p-2 bg-gray-500/10 rounded-lg"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <select
              value={formData.unit}
              onChange={(e) => {
                if (e.target.value === "ADD_NEW") setIsAddingCustomUnit(true);
                else patch({ unit: e.target.value as Product["unit"] });
              }}
              className={inputCls}
            >
              {Object.values(UnitType).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              <option value="ADD_NEW">+ Custom Unit...</option>
            </select>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Category
          </label>
          {isAddingCustomCategory ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={customCategoryName}
                onChange={(e) => setCustomCategoryName(e.target.value)}
                className={`flex-1 ${inputCls}`}
                placeholder="New Category..."
              />
              <button
                type="button"
                onClick={() => setIsAddingCustomCategory(false)}
                className="p-2 bg-gray-500/10 rounded-lg"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <select
              value={formData.category}
              onChange={(e) => {
                if (e.target.value === "ADD_NEW")
                  setIsAddingCustomCategory(true);
                else patch({ category: e.target.value as Product["category"] });
              }}
              className={inputCls}
            >
              {Object.values(Category).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="ADD_NEW">+ New Category...</option>
            </select>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Barcode
          </label>
          <input
            value={formData.barcode || ""}
            onChange={(e) => patch({ barcode: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Size
          </label>
          <input
            value={formData.size || ""}
            onChange={(e) => patch({ size: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Model
          </label>
          <input
            value={formData.modelNumber || ""}
            onChange={(e) => patch({ modelNumber: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Location
          </label>
          <input
            value={formData.location || ""}
            onChange={(e) => patch({ location: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Weight
          </label>
          <input
            value={formData.weight || ""}
            onChange={(e) => patch({ weight: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Shelf life
          </label>
          <input
            value={formData.shelfLife || ""}
            onChange={(e) => patch({ shelfLife: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Color
          </label>
          <input
            value={formData.colorHex || ""}
            onChange={(e) => patch({ colorHex: e.target.value })}
            className={inputCls}
            placeholder="#FFFFFF"
          />
        </div>
        <div className="col-span-3 lg:col-span-5 space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">
            Description
          </label>
          <input
            value={formData.description || ""}
            onChange={(e) => patch({ description: e.target.value })}
            className={inputCls}
          />
        </div>
      </form>
    </LandscapeModal>
  );
}
