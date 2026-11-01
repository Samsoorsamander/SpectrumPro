import React, { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";
import { db } from "../../db";
import { Company, Category } from "../../types";
import { LandscapeModal } from "../ui/LandscapeModal";
import { SaveDraftButton } from "../ui/SaveDraftButton";
import { useFeedback } from "../../contexts/FeedbackContext";
import { notifyDirectoryChanged } from "../../utils/dataSync";
import { clearFormDraft, readFormDraft, writeFormDraft } from "../../utils/formDraft";

const INITIAL: Partial<Company> = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  category: Category.PAINT,
  openingBalance: 0,
  taxId: "",
  website: "",
  notes: "",
  originCountry: "",
  licenseNumber: "",
  licenseExpiry: "",
  priceCategory: "General",
  bankName: "",
  accountNumber: "",
  paymentTerms: "Net 30",
};

type Props = {
  darkMode: boolean;
  open: boolean;
  onClose: () => void;
  editCompany: Company | null;
  onSaved: () => void;
};

/** Isolated supplier form — keystrokes do not re-render the companies list. */
export function CompanyFormModal({
  darkMode,
  open,
  onClose,
  editCompany,
  onSaved,
}: Props) {
  const { showSuccess, showError } = useFeedback();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Company>>(INITIAL);
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editCompany?.id) {
      setEditingId(editCompany.id);
      setFormData({ ...editCompany });
    } else {
      setEditingId(null);
      const draft = readFormDraft<Partial<Company>>("company");
      setFormData({ ...INITIAL, ...(draft ?? {}) });
    }
    setIsAddingCustomCategory(false);
    setCustomCategoryName("");
  }, [open, editCompany]);

  const patch = (partial: Partial<Company>) =>
    setFormData((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const finalCategory = isAddingCustomCategory
        ? customCategoryName
        : formData.category;
      if (!finalCategory) throw new Error("Category is required.");
      const sanitizedData = {
        ...formData,
        category: finalCategory as Company["category"],
        openingBalance: Number(formData.openingBalance) || 0,
        isDeleted: false,
      };
      if (editingId) {
        await db.companies.update(editingId, sanitizedData);
      } else {
        await db.companies.add(sanitizedData as Company);
      }
      notifyDirectoryChanged();
      clearFormDraft("company");
      onSaved();
      onClose();
      showSuccess("Saved", "Supplier details saved.");
    } catch (err: unknown) {
      console.error("Company save error:", err);
      const message = err instanceof Error ? err.message : String(err);
      showError("Could not save supplier", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = `w-full px-3 py-2 rounded-lg text-xs font-bold border-none ring-1 outline-none ${
    darkMode
      ? "bg-gray-900 text-white ring-gray-800 focus:ring-red-500"
      : "bg-gray-50 text-gray-900 ring-gray-200 focus:ring-red-500"
  }`;

  if (!open) return null;

  return (
    <LandscapeModal
      darkMode={darkMode}
      open={open}
      onClose={onClose}
      title={editingId ? "Edit Supplier" : "New Supplier"}
      subtitle="Vendor registry & ledger opening"
      icon={<Building2 size={16} />}
      wide
      bodyScroll
      footer={
        <>
          {!editingId && (
            <SaveDraftButton
              darkMode={darkMode}
              onClick={() => {
                writeFormDraft("company", formData);
                showSuccess("Draft saved", "This supplier form will reopen with these values.");
              }}
            />
          )}
          <button
            type="submit"
            form="company-form"
            disabled={isSubmitting}
            className="flex-[2] py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : "Save Supplier"}
          </button>
        </>
      }
    >
      <form
        id="company-form"
        onSubmit={(e) => void handleSubmit(e)}
        className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2"
      >
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Supplier Name
          </label>
          <input
            required
            autoFocus
            type="text"
            value={formData.name || ""}
            onChange={(e) => patch({ name: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Contact Person
          </label>
          <input
            type="text"
            value={formData.contactPerson || ""}
            onChange={(e) => patch({ contactPerson: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Phone
          </label>
          <input
            type="tel"
            value={formData.phone || ""}
            onChange={(e) => patch({ phone: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Email
          </label>
          <input
            type="email"
            value={formData.email || ""}
            onChange={(e) => patch({ email: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Price Type
          </label>
          <input
            type="text"
            value={formData.priceCategory || ""}
            onChange={(e) => patch({ priceCategory: e.target.value })}
            className={inputCls}
            placeholder="e.g. A Grade"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            License Number
          </label>
          <input
            type="text"
            value={formData.licenseNumber || ""}
            onChange={(e) => patch({ licenseNumber: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            License Expiry
          </label>
          <input
            type="date"
            value={formData.licenseExpiry || ""}
            onChange={(e) => patch({ licenseExpiry: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Country of Origin
          </label>
          <input
            type="text"
            value={formData.originCountry || ""}
            onChange={(e) => patch({ originCountry: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Bank Name
          </label>
          <input
            type="text"
            value={formData.bankName || ""}
            onChange={(e) => patch({ bankName: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Account Number
          </label>
          <input
            type="text"
            value={formData.accountNumber || ""}
            onChange={(e) => patch({ accountNumber: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
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
                else
                  patch({ category: e.target.value as Company["category"] });
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
          <label className="text-[9px] font-black uppercase text-gray-500">
            Payment Terms
          </label>
          <input
            type="text"
            value={formData.paymentTerms || ""}
            onChange={(e) => patch({ paymentTerms: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Opening Debt (AFN)
          </label>
          <input
            type="number"
            value={formData.openingBalance ?? ""}
            onChange={(e) =>
              patch({
                openingBalance:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className={inputCls}
          />
        </div>
        <div className="col-span-2 md:col-span-3 space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Address
          </label>
          <input
            type="text"
            value={formData.address || ""}
            onChange={(e) => patch({ address: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="col-span-2 md:col-span-3 space-y-1">
          <label className="text-[9px] font-black uppercase text-gray-500">
            Notes
          </label>
          <textarea
            value={formData.notes || ""}
            onChange={(e) => patch({ notes: e.target.value })}
            className={`${inputCls} resize-none h-16`}
            placeholder="Past reliability logs..."
          />
        </div>
      </form>
    </LandscapeModal>
  );
}
