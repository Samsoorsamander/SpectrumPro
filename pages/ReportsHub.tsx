import React from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Calendar,
  FileText,
  Landmark,
  Package,
  Users,
  CreditCard,
  Wallet,
  Briefcase,
  PieChart,
  LayoutDashboard,
  ArrowRight,
  Scale,
  Moon,
} from "lucide-react";
import {
  REPORT_TYPES,
  REPORT_NAMES,
  REPORT_DESCRIPTIONS,
  ReportType,
} from "../utils/reportCatalog";

const REPORT_ICONS: Record<ReportType, React.ReactNode> = {
  PROFIT_LOSS: <TrendingUp size={22} />,
  MONTHLY_OPERATIONS: <Calendar size={22} />,
  INVOICE_PROFIT: <FileText size={22} />,
  ENTERPRISE_OVERVIEW: <PieChart size={22} />,
  PRODUCT_AUDIT: <Package size={22} />,
  CUSTOMER_AUDIT: <Users size={22} />,
  SUPPLIER_DUES: <Landmark size={22} />,
  PAYMENT_JOURNAL: <CreditCard size={22} />,
  EXPENSE_REGISTRY: <Wallet size={22} />,
  EMPLOYEE_PAYROLL: <Briefcase size={22} />,
  EMPLOYEE_SALES: <LayoutDashboard size={22} />,
  CAPITAL_POSITION: <Scale size={22} />,
  ZAKAT: <Moon size={22} />,
};

const REPORT_ACCENTS: Record<ReportType, string> = {
  PROFIT_LOSS: "text-emerald-500 bg-emerald-500/10",
  MONTHLY_OPERATIONS: "text-cyan-500 bg-cyan-500/10",
  INVOICE_PROFIT: "text-indigo-500 bg-indigo-500/10",
  ENTERPRISE_OVERVIEW: "text-violet-500 bg-violet-500/10",
  PRODUCT_AUDIT: "text-amber-500 bg-amber-500/10",
  CUSTOMER_AUDIT: "text-blue-500 bg-blue-500/10",
  SUPPLIER_DUES: "text-red-500 bg-red-500/10",
  PAYMENT_JOURNAL: "text-teal-500 bg-teal-500/10",
  EXPENSE_REGISTRY: "text-orange-500 bg-orange-500/10",
  EMPLOYEE_PAYROLL: "text-pink-500 bg-pink-500/10",
  EMPLOYEE_SALES: "text-lime-500 bg-lime-500/10",
  CAPITAL_POSITION: "text-sky-500 bg-sky-500/10",
  ZAKAT: "text-emerald-600 bg-emerald-600/10",
};

export default function ReportsHub({ darkMode }: { darkMode: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="w-full space-y-3 pb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {REPORT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => navigate(`/reports/${type}`)}
            className={`group text-left p-4 sm:p-5 rounded-2xl border transition-all ${
              darkMode
                ? "bg-[#1a1d23] border-gray-800 hover:border-red-500/40 hover:bg-[#1e2229]"
                : "bg-white border-gray-100 shadow-sm hover:border-red-300 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div
                className={`p-2.5 rounded-xl ${REPORT_ACCENTS[type]}`}
                aria-hidden
              >
                {REPORT_ICONS[type]}
              </div>
              <ArrowRight
                size={16}
                className={`mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                  darkMode ? "text-gray-400" : "text-gray-400"
                }`}
              />
            </div>
            <h3
              className={`text-sm font-black uppercase tracking-tight mb-1.5 ${
                darkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {REPORT_NAMES[type]}
            </h3>
            <p
              className={`text-[11px] font-medium leading-snug ${
                darkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              {REPORT_DESCRIPTIONS[type]}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
