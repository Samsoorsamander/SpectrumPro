
export enum UnitType {
  DRUMMY = 'Drummy',
  GALLON = 'Gallon',
  QUARTER = 'Quarter',
  METER = 'Meter',
  POUCH = 'Pouch',
  BUNDLE = 'Bundle',
  PCS = 'pcs',
  TON = 'Ton',
  KG = 'KG',
  LITER = 'Liter'
}

export enum Category {
  PAINT = 'Paint',
  PRIMER = 'Primer',
  HARDWARE = 'Hardware',
  SUPPLIES = 'Supplies',
  THINNER = 'Thinner',
  FILLER = 'Filler'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF'
}

export interface SystemSettings {
  id?: number;
  logo?: string; // Legacy primary logo
  logos?: string[]; // Multiple logo collection
  selectedLogoIndex?: number;
  phone: string;
  address: string;
  representativeName: string;
  companyName: string;
  whatsappNumber?: string;
  dailyBackupEnabled?: boolean;
  lastBackupDate?: string;
  backupEmailEnabled?: boolean;
  backupEmailTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpFrom?: string;
}

export interface User {
  id?: number;
  username: string;
  password?: string;
  role: UserRole;
  fullName: string;
  lastLogin?: Date;
  permissions?: string[]; 
}

export interface Product {
  id?: number;
  skuCode?: string;
  barcode?: string;
  name: string;
  category: Category;
  company: string;
  companyId?: number;
  size: string;
  unit: UnitType | string;
  stock: number;
  purchasePrice: number;
  salePrice: number;
  colorHex?: string;
  minStockLevel: number;
  expiryDate?: string;
  shelfLife?: string;
  location?: string;
  weight?: string;
  description?: string;
  modelNumber?: string;
  isDeleted?: boolean;
}

/** Stock lot for FIFO costing and expiry tracking */
export interface ProductBatch {
  id?: number;
  productId: number;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
  expiryDate?: string;
  /** ISO timestamp — older batches sell first */
  receivedAt?: string;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  address: string;
  totalCredit: number;
  totalDebit: number;
  balance: number;
  openingBalance?: number;
  isDeleted?: boolean;
}

export interface Employee {
  id?: number;
  name: string;
  role: string;
  phone: string;
  salary: number;
  joiningDate: Date;
  companyId?: number;
  companyName?: string;
  isDeleted?: boolean;
}

export interface Company {
  id?: number;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  category: Category;
  openingBalance: number;
  taxId?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  priceCategory?: string;
  website?: string;
  notes?: string;
  originCountry?: string;
  bankName?: string;
  accountNumber?: string;
  paymentTerms?: string;
  isDeleted?: boolean;
}

export interface Transaction {
  id?: number;
  date: Date;
  customerId?: number;
  companyId?: number;
  employeeId?: number;
  customerName?: string;
  companyName?: string;
  employeeName?: string;
  type: 'SALE' | 'PURCHASE' | 'RETURN' | 'PAYMENT' | 'PURCHASE_RETURN' | 'SALARY' | 'CAPITAL_INJECTION';
  totalAmount: number;
  paidAmount: number;
  discount: number;
  items: TransactionItem[];
  notes?: string;
  /** CAPITAL_INJECTION only: OWNER = your money; EXTERNAL = partner/investor/lender */
  capitalKind?: 'OWNER' | 'EXTERNAL';
  isDeleted?: boolean;
  oldBalance?: number;
  newBalance?: number;
}

export interface TransactionItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  itemDiscount: number;
  total: number;
  unit?: string;
  /** Sale: FIFO layers consumed */
  batchAllocations?: {
    batchId: number;
    batchNumber: string;
    quantity: number;
    unitCost: number;
  }[];
  /** Weighted average unit cost for this line (FIFO) */
  fifoAvgUnitCost?: number;
  /** Purchase line: link to batch row */
  batchId?: number;
  batchNumber?: string;
  /** Purchase staging / purchase lines */
  salePrice?: number;
  expiryDate?: string;
}

export interface ColorSwatch {
  id?: number;
  name: string;
  hex: string;
  company: string;
}

export interface Expense {
  id?: number;
  date: Date;
  description: string;
  amount: number;
  category: string;
  paidTo?: string;
  companyId?: number;
  companyName?: string;
}
