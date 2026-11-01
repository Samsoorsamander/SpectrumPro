import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const PIE_COLORS = [
  "#ef4444",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export interface AnalysisChartsProps {
  darkMode: boolean;
  startDate: string;
  endDate: string;
  categoryPieData: Array<{ name: string; value: number }>;
  inventoryBands: {
    rows: Array<{ label: string; value: number; count: number; color: string }>;
    total: number;
  };
  dailyTrend: Array<{ name: string; key: string; revenue: number; profit: number }>;
  productCount: number;
}

export default function AnalysisCharts({
  darkMode,
  startDate,
  endDate,
  categoryPieData,
  inventoryBands,
  dailyTrend,
  productCount,
}: AnalysisChartsProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div
          className={`p-6 rounded-3xl ${darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white shadow-sm border border-gray-200"}`}
        >
          <h3 className={`font-bold mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}>
            Sales by category
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Invoice line totals grouped by product category ({startDate} → {endDate})
          </p>
          <div className="h-[300px]">
            {categoryPieData.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-20">No sales in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                  >
                    {categoryPieData.map((_, index) => (
                      <Cell key={`c-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`AFN ${Number(v).toLocaleString()}`, "Revenue"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "none",
                      background: darkMode ? "#1a1d23" : "#fff",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div
          className={`p-6 rounded-3xl ${darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white shadow-sm border border-gray-200"}`}
        >
          <h3 className={`font-bold mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}>
            Inventory value at cost
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Stock × purchase price — {productCount} SKUs · bands by min stock level
          </p>
          <div className="space-y-6">
            {inventoryBands.rows.map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">
                    {item.label} ({item.count} SKUs)
                  </span>
                  <span className={`font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
                    AFN {Math.round(item.value).toLocaleString()}
                  </span>
                </div>
                <div className={`w-full h-2 rounded-full ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.min(100, (item.value / inventoryBands.total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`p-6 rounded-3xl ${darkMode ? "bg-[#1a1d23] border border-gray-800" : "bg-white shadow-sm border border-gray-200"}`}
      >
        <h3 className={`font-bold mb-2 ${darkMode ? "text-white" : "text-gray-900"}`}>
          Daily revenue & gross profit
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Each day in the selected range: invoiced sales minus returns (revenue) and gross profit
          (revenue − FIFO batch-layer COGS)
        </p>
        <div className="h-[400px]">
          {dailyTrend.length === 0 ? (
            <p className="text-center text-gray-500 py-20">Adjust date range</p>
          ) : dailyTrend.length > 45 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke={darkMode ? "#374151" : "#e5e7eb"}
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    background: darkMode ? "#1a1d23" : "#fff",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue (AFN)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Gross profit (AFN)"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrend}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke={darkMode ? "#374151" : "#e5e7eb"}
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "none",
                    background: darkMode ? "#1a1d23" : "#fff",
                  }}
                />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Gross profit" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
