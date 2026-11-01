import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { ShoppingCart, Users, DollarSign, Package } from 'lucide-react';
import { StatCard } from '../components/dashboard/StatCard';
import { LowStockAlerts } from '../components/dashboard/LowStockAlerts';
import { db } from '../db';
import { Product, Transaction, Customer } from '../types';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { computePeriodPnL, inventoryValueFromProduct } from '../utils/periodPnL';
import { netCustomerSaleInvoiceAmount } from '../utils/saleAmounts';
import { formatAfn } from '../utils/format';
import { TX_LIST_COLUMNS } from '../utils/txListColumns';
import { useLazyScreenDataSync } from '../utils/dataSync';

const DashboardChart = React.lazy(() => import('../components/dashboard/DashboardChart'));

export default function Dashboard({ darkMode }: { darkMode: boolean }) {
  const { query: headerSearch } = useGlobalSearch();
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const loadData = useCallback(async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const since = sixMonthsAgo.toISOString();

    const [p, t, c] = await Promise.all([
      db.products.query({
        where: [{ col: 'isDeleted', op: '=', val: 0 }],
        columns: [
          'id',
          'name',
          'skuCode',
          'company',
          'stock',
          'purchasePrice',
          'salePrice',
          'minStockLevel',
          'isDeleted',
        ],
      }),
      db.transactionLogs.query({
        where: [
          { col: 'isDeleted', op: '=', val: 0 },
          { col: 'date', op: '>=', val: since },
          {
            col: 'type',
            op: 'IN',
            val: ['SALE', 'RETURN', 'PAYMENT', 'SALARY', 'CAPITAL_INJECTION', 'PURCHASE'],
          },
        ],
        orderBy: 'date',
        orderDir: 'DESC',
        columns: [...TX_LIST_COLUMNS],
      }),
      db.customers.query({
        where: [{ col: 'isDeleted', op: '=', val: 0 }],
        columns: ['id', 'name', 'balance', 'isDeleted'],
      }),
    ]);
    setProducts(p as Product[]);
    setTransactions(t as Transaction[]);
    setCustomers(c as Customer[]);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useLazyScreenDataSync(loadData);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = transactions.filter(t => t.type === 'SALE' && new Date(t.date).toISOString().split('T')[0] === today);
    const pnl = computePeriodPnL(transactions, [], products);
    const inventoryValue = products.reduce((sum, p) => sum + inventoryValueFromProduct(p), 0);

    return {
      totalSales: pnl.netRevenue,
      ordersCount: pnl.saleCount,
      customerCount: customers.length,
      inventoryValue: inventoryValue,
      todaySalesCount: todaySales.length
    };
  }, [transactions, products, customers]);

  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = months[d.getMonth()];
      const monthlySales = transactions
        .filter(t => t.type === 'SALE' && new Date(t.date).getMonth() === d.getMonth() && new Date(t.date).getFullYear() === d.getFullYear())
        .reduce((sum, t) => sum + netCustomerSaleInvoiceAmount(t), 0);
      const monthlyReturns = transactions
        .filter(t => t.type === 'RETURN' && new Date(t.date).getMonth() === d.getMonth() && new Date(t.date).getFullYear() === d.getFullYear())
        .reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);
      result.push({ name: monthName, sales: monthlySales - monthlyReturns });
    }
    return result;
  }, [transactions]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard 
          title="Net Sales" 
          value={formatAfn(stats.totalSales)} 
          change="After returns" 
          isPositive={true} 
          icon={<DollarSign size={20} />} 
          darkMode={darkMode}
        />
        <StatCard 
          title="Active Orders" 
          value={stats.ordersCount.toString()} 
          change={`${stats.todaySalesCount} Today`} 
          isPositive={true} 
          icon={<ShoppingCart size={20} />} 
          darkMode={darkMode}
        />
        <StatCard 
          title="Verified Parties" 
          value={stats.customerCount.toString()} 
          change="In Registry" 
          isPositive={true} 
          icon={<Users size={20} />} 
          darkMode={darkMode}
        />
        <StatCard 
          title="Inventory Worth" 
          value={formatAfn(stats.inventoryValue)} 
          change="At Cost" 
          isPositive={true} 
          icon={<Package size={20} />} 
          darkMode={darkMode}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`lg:col-span-2 p-4 rounded-2xl border ${darkMode ? 'bg-[#1a1d23] border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
          <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Sales trend (6 mo)
          </h3>
          <div className="h-56">
            <Suspense fallback={<div className="h-full w-full rounded-xl bg-gray-500/10 animate-pulse" />}>
              <DashboardChart chartData={chartData} darkMode={darkMode} />
            </Suspense>
          </div>
        </div>
        <LowStockAlerts products={products} darkMode={darkMode} searchFilter={headerSearch} />
      </div>
    </div>
  );
}
