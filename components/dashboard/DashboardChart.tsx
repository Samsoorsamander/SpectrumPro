import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartPoint {
  name: string;
  sales: number;
}

interface DashboardChartProps {
  chartData: ChartPoint[];
  darkMode: boolean;
}

export default function DashboardChart({ chartData, darkMode }: DashboardChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#333' : '#eee'} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#888" />
        <YAxis tick={{ fontSize: 10 }} stroke="#888" />
        <Tooltip />
        <Line type="monotone" dataKey="sales" stroke="#ef4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
