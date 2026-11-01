import React from "react";
import {
  BookOpen,
  ShoppingCart,
  Package,
  FileText,
  CreditCard,
  RotateCcw,
  BarChart3,
  Search,
  Database,
  HelpCircle,
} from "lucide-react";

type Block = { title: string; body: string[] };

const SECTIONS: { heading: string; icon: React.ReactNode; blocks: Block[] }[] = [
  {
    heading: "Overview",
    icon: <HelpCircle size={22} className="text-red-500" />,
    blocks: [
      {
        title: "What Spectrum Pro is",
        body: [
          "Spectrum Pro is an offline-first paint and inventory management app: products, batches (FIFO costing), sales, purchases, customers, suppliers, expenses, and printable vouchers.",
          "Data is stored locally in your browser (IndexedDB). Use Settings to understand backups if your deployment exposes export tools.",
        ],
      },
    ],
  },
  {
    heading: "Orders",
    icon: <ShoppingCart size={22} className="text-red-500" />,
    blocks: [
      {
        title: "Sales terminal",
        body: [
          "Add lines to the cart, set quantity and unit price, choose a customer (or walking sale), and confirm checkout.",
          "Stock and cost use FIFO from product batches: oldest received stock is consumed first. The cart shows an estimated FIFO unit cost per line.",
          "If checkout fails with insufficient batch stock, receive stock via Purchases or fix batches on the product.",
        ],
      },
    ],
  },
  {
    heading: "Inventory",
    icon: <Package size={22} className="text-emerald-500" />,
    blocks: [
      {
        title: "Products & batches",
        body: [
          "Each product can have multiple batches (quantity, unit cost, received date). On-hand stock is synchronized from batch totals.",
          "Purchases create or update batches; sales deduct from batches in FIFO order.",
        ],
      },
    ],
  },
  {
    heading: "Documents",
    icon: <FileText size={22} className="text-indigo-500" />,
    blocks: [
      {
        title: "Invoices hub",
        body: [
          "Lists sales, purchases, returns, and related vouchers. You can open a document, print or save PDF, and edit certain types where enabled.",
          "Editing an invoice may adjust stock through the same FIFO rules as the sales screen.",
        ],
      },
    ],
  },
  {
    heading: "Returns",
    icon: <RotateCcw size={22} className="text-amber-500" />,
    blocks: [
      {
        title: "Stock returns",
        body: [
          "Customer returns credit the customer and increase stock; supplier returns decrease stock.",
          "Pick a customer or supplier from the list (use search in the modal) and only return quantities that exist in net history.",
        ],
      },
    ],
  },
  {
    heading: "Money & ledger",
    icon: <CreditCard size={22} className="text-blue-500" />,
    blocks: [
      {
        title: "Payments, expenses, capital",
        body: [
          "Record customer payments, supplier payments, salaries, and day-to-day expenses in their respective screens.",
          "Day Book and Reports aggregate these with sales and purchases for trading profit, pure profit, and cash flow style summaries.",
        ],
      },
    ],
  },
  {
    heading: "Day Book & Reports",
    icon: <BookOpen size={22} className="text-violet-500" />,
    blocks: [
      {
        title: "How to read the Day Book",
        body: [
          "Pick a date range (and optional brand filter). Trading profit is margin after FIFO COGS and returns; pure profit also subtracts expenses and salaries. Cash collected sums sale receipts and customer payments in the range.",
          "Reports Hub: detailed financial statements and audit-style exports for admins.",
        ],
      },
    ],
  },
  {
    heading: "Analysis",
    icon: <BarChart3 size={22} className="text-cyan-500" />,
    blocks: [
      {
        title: "Charts",
        body: [
          "Charts use live registry data: sales by category, inventory value bands, and daily revenue vs gross profit for the selected period.",
          "Gross profit uses FIFO batch-layer cost from each sale line (sum of qty × lot cost across all batches consumed). Product purchase price is only a fallback for legacy lines without stored allocations.",
        ],
      },
    ],
  },
  {
    heading: "Search & settings",
    icon: <Search size={22} className="text-gray-500" />,
    blocks: [
      {
        title: "Global search",
        body: [
          "Press Ctrl+F (or click Search in the header) to open global search. It finds customers, products, companies, invoices, and expenses, and also filters content on many list screens.",
        ],
      },
      {
        title: "Settings & access",
        body: [
          "Company profile, logos, and preferences live under Settings. Staff permissions may hide admin areas such as Analysis or Day Book.",
        ],
      },
    ],
  },
  {
    heading: "Data safety",
    icon: <Database size={22} className="text-gray-500" />,
    blocks: [
      {
        title: "Local storage",
        body: [
          "This app keeps data on this device. Clearing browser storage without a backup can remove your registry. Follow your IT policy for Tauri/desktop backups if applicable.",
        ],
      },
    ],
  },
];

export default function Help({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="space-y-3 w-full pb-4">
      <div>
        <h1 className={`text-lg font-black uppercase tracking-tight ${darkMode ? "text-white" : "text-gray-900"}`}>
          Help Center
        </h1>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((sec) => (
          <section
            key={sec.heading}
            className={`rounded-xl border p-3 ${darkMode ? "bg-[#1a1d23] border-gray-800" : "bg-white border-gray-200 shadow-sm"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {sec.icon}
              <h2 className={`text-sm font-black uppercase tracking-widest ${darkMode ? "text-white" : "text-gray-900"}`}>
                {sec.heading}
              </h2>
            </div>
            <div className="space-y-3">
              {sec.blocks.map((b) => (
                <div key={b.title}>
                  <h3 className={`text-xs font-black uppercase tracking-wide mb-1.5 ${darkMode ? "text-gray-300" : "text-gray-800"}`}>
                    {b.title}
                  </h3>
                  <ul className={`space-y-1.5 text-xs leading-relaxed ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {b.body.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-red-500 font-black shrink-0">·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
