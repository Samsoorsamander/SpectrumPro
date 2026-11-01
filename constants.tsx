import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  Settings, 
  HelpCircle, 
  BarChart3, 
  Palette,
  FileText,
  Building2,
  Briefcase,
  RotateCcw,
  ShoppingBag,
  CreditCard,
  Wallet,
  BookOpen,
  History,
  ClipboardList,
  PiggyBank,
  UserPlus,
  PackagePlus,
  Receipt,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import { UserRole } from './types';

/** Primary single-line top tabs (Settings is a dropdown trigger, not listed here).
 *  Order: most-used first; related screens kept adjacent. */
export const TOP_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: <LayoutDashboard size={14} />, path: '/', role: 'ALL' as const },
  { id: 'sales', label: 'Orders', shortLabel: 'Orders', icon: <ShoppingCart size={14} />, path: '/sales', role: 'ALL' as const },
  { id: 'invoices', label: 'Invoices', shortLabel: 'Invoices', icon: <FileText size={14} />, path: '/invoices', role: 'ALL' as const },
  { id: 'daybook', label: 'Day Book', shortLabel: 'Day Book', icon: <BookOpen size={14} />, path: '/daybook', role: UserRole.ADMIN },
  { id: 'customers', label: 'Customers', shortLabel: 'Customers', icon: <Users size={14} />, path: '/customers', role: 'ALL' as const },
  { id: 'inventory', label: 'Products', shortLabel: 'Products', icon: <Package size={14} />, path: '/inventory', role: 'ALL' as const },
  { id: 'purchases', label: 'Purchases', shortLabel: 'Purchases', icon: <ShoppingBag size={14} />, path: '/purchases', role: 'ALL' as const },
  { id: 'companies', label: 'Companies', shortLabel: 'Companies', icon: <Building2 size={14} />, path: '/companies', role: 'ALL' as const },
  { id: 'returns', label: 'Stock Returns', shortLabel: 'Returns', icon: <RotateCcw size={14} />, path: '/returns', role: 'ALL' as const },
  { id: 'payments', label: 'Payments', shortLabel: 'Payments', icon: <CreditCard size={14} />, path: '/payments', role: 'ALL' as const },
  { id: 'expenses', label: 'Expenses', shortLabel: 'Expenses', icon: <Wallet size={14} />, path: '/expenses', role: 'ALL' as const },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: <ClipboardList size={14} />, path: '/reports', role: UserRole.ADMIN },
];

/** Items under the Settings dropdown on the top tab bar. */
export const SETTINGS_MENU_ITEMS = [
  { id: 'settings', label: 'Settings', icon: <Settings size={14} />, path: '/settings', role: 'ALL' as const },
  { id: 'access-control', label: 'Access Control', icon: <ShieldCheck size={14} />, path: '/access-control', role: UserRole.ADMIN },
  { id: 'backup', label: 'Backup & Restore', icon: <HardDrive size={14} />, path: '/backup', role: 'ALL' as const },
  { id: 'employees', label: 'Employees', icon: <Briefcase size={14} />, path: '/employees', role: UserRole.ADMIN },
  { id: 'capital', label: 'External Capital', icon: <PiggyBank size={14} />, path: '/capital', role: 'ALL' as const },
  { id: 'sales-history', label: 'Sales History', icon: <History size={14} />, path: '/sales-history', role: 'ALL' as const },
  { id: 'catalog', label: 'Colors', icon: <Palette size={14} />, path: '/catalog', role: 'ALL' as const },
  { id: 'analysis', label: 'Analysis', icon: <BarChart3 size={14} />, path: '/analysis', role: UserRole.ADMIN },
  { id: 'help', label: 'Help Center', icon: <HelpCircle size={14} />, path: '/help', role: 'ALL' as const },
];

/** Compact quick-create actions under the tab bar. */
export const QUICK_ACTIONS = [
  { id: 'new-customer', label: 'New Customer', icon: <UserPlus size={14} />, path: '/customers?new=1', shortcut: 'Ctrl+1' },
  { id: 'new-product', label: 'New Product', icon: <PackagePlus size={14} />, path: '/inventory?new=1', shortcut: 'Ctrl+2' },
  { id: 'new-company', label: 'New Company', icon: <Building2 size={14} />, path: '/companies?new=1', shortcut: 'Ctrl+3' },
  { id: 'new-purchase', label: 'New Purchase', icon: <ShoppingBag size={14} />, path: '/purchases?new=1', shortcut: 'Ctrl+4' },
  { id: 'new-payment', label: 'New Payment', icon: <CreditCard size={14} />, path: '/payments?new=1', shortcut: 'Ctrl+5' },
  { id: 'new-expense', label: 'New Expense', icon: <Receipt size={14} />, path: '/expenses?new=1', shortcut: 'Ctrl+6' },
  { id: 'new-return', label: 'New Return', icon: <RotateCcw size={14} />, path: '/returns?new=1', shortcut: 'Ctrl+7' },
];

/** Full nav list for Settings permission checkboxes (legacy + menu items). */
export const SIDEBAR_ITEMS = [
  ...TOP_NAV_ITEMS.map(({ id, label, icon, path, role }) => ({ id, label, icon, path, role })),
  { id: 'capital', label: 'External Capital', icon: <PiggyBank size={20} />, path: '/capital', role: 'ALL' as const },
  { id: 'sales-history', label: 'Sales History', icon: <History size={20} />, path: '/sales-history', role: 'ALL' as const },
  { id: 'employees', label: 'Employees', icon: <Briefcase size={20} />, path: '/employees', role: UserRole.ADMIN },
  { id: 'catalog', label: 'Colors', icon: <Palette size={20} />, path: '/catalog', role: 'ALL' as const },
  { id: 'analysis', label: 'Analysis', icon: <BarChart3 size={20} />, path: '/analysis', role: UserRole.ADMIN },
];

export const BOTTOM_SIDEBAR_ITEMS = [
  { id: 'settings', label: 'Settings', icon: <Settings size={20} />, path: '/settings', role: 'ALL' as const },
  { id: 'help', label: 'Help Center', icon: <HelpCircle size={20} />, path: '/help', role: 'ALL' as const },
];

export const COLOR_PALETTE = [
  { name: 'Pure White', hex: '#FFFFFF', company: 'Commander' },
  { name: 'Sky Blue', hex: '#87CEEB', company: 'Shokies' },
  { name: 'Crimson Red', hex: '#DC143C', company: 'National' },
  { name: 'Forest Green', hex: '#228B22', company: 'General' },
  { name: 'Charcoal', hex: '#36454F', company: 'Commander' },
  { name: 'Sunset Orange', hex: '#FF4500', company: 'Shokies' },
  { name: 'Ivory', hex: '#FFFFF0', company: 'National' },
  { name: 'Ocean Depth', hex: '#0077BE', company: 'General' },
  { name: 'Teal Mist', hex: '#008080', company: 'Commander' },
  { name: 'Goldenrod', hex: '#DAA520', company: 'Shokies' },
];
