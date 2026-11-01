import Database from "@tauri-apps/plugin-sql";
import { Dexie, type Table } from "dexie";
import {
  Product,
  Customer,
  Transaction,
  Category,
  UnitType,
  ColorSwatch,
  Company,
  Employee,
  Expense,
  User,
  UserRole,
  SystemSettings,
  ProductBatch,
} from "./types";

// Browser Fallback Database (Dexie) - Useful for development outside Tauri
class BrowserDB extends Dexie {
  products!: Table<Product>;
  customers!: Table<Customer>;
  companies!: Table<Company>;
  employees!: Table<Employee>;
  transactionLogs!: Table<Transaction>;
  customSwatches!: Table<ColorSwatch>;
  expenses!: Table<Expense>;
  users!: Table<User>;
  settings!: Table<SystemSettings>;
  productBatches!: Table<ProductBatch>;

  constructor() {
    super("SpectrumProBrowser");
    this.version(5).stores({
      products: "++id, name, company, category, isDeleted",
      customers: "++id, name, phone, isDeleted",
      companies: "++id, name, isDeleted",
      employees: "++id, name, isDeleted",
      transactionLogs:
        "++id, date, customerId, companyId, employeeId, type, isDeleted",
      customSwatches: "++id, name, company",
      expenses: "++id, date, category",
      users: "++id, username, role",
      settings: "++id",
    });
    this.version(6).stores({
      products: "++id, name, company, category, isDeleted",
      customers: "++id, name, phone, isDeleted",
      companies: "++id, name, isDeleted",
      employees: "++id, name, isDeleted",
      transactionLogs:
        "++id, date, customerId, companyId, employeeId, type, isDeleted",
      customSwatches: "++id, name, company",
      expenses: "++id, date, category",
      users: "++id, username, role",
      settings: "++id",
      productBatches: "++id, productId, batchNumber",
    });
  }
}

class SQLiteDB {
  private tauriDb: any = null;
  private browserDb: BrowserDB | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private isTauri = false;

  // Table Proxies
  public products = this.tableProxy("products");
  public customers = this.tableProxy("customers");
  public companies = this.tableProxy("companies");
  public employees = this.tableProxy("employees");
  public transactionLogs = this.tableProxy("transactionLogs");
  public customSwatches = this.tableProxy("customSwatches");
  public expenses = this.tableProxy("expenses");
  public users = this.tableProxy("users");
  public settings = this.tableProxy("settings");
  public productBatches = this.tableProxy("productBatches");

  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Detect Tauri environment
        this.isTauri = !!(window as any).__TAURI_INTERNALS__;

        if (this.isTauri) {
          console.log(
            "Database: Initiating High-Performance SQLite Registry..."
          );
          const { appConfigDir } = await import("@tauri-apps/api/path");
          const { mkdir } = await import("@tauri-apps/plugin-fs");
          const configDir = await appConfigDir();
          await mkdir(configDir, { recursive: true });
          this.tauriDb = await Database.load("sqlite:spectrum_pro.db");
          await this.createTauriTables();
        } else {
          console.warn(
            "Database: Local Environment Detected - Using Browser Fallback Storage"
          );
          this.browserDb = new BrowserDB();
          await this.browserDb.open();
        }

        this.isInitialized = true;
      } catch (error: any) {
        console.error("CRITICAL: Database Initialization Failed:", error);
        this.initPromise = null;
        throw new Error(
          error?.message ||
            "Failed to establish registry connection. Check disk permissions."
        );
      }
    })();

    return this.initPromise;
  }

  private async createTauriTables() {
    if (!this.tauriDb) return;
    const queries = [
      `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, skuCode TEXT, barcode TEXT, name TEXT, category TEXT, company TEXT, companyId INTEGER, size TEXT, unit TEXT, stock REAL, purchasePrice REAL, salePrice REAL, colorHex TEXT, minStockLevel REAL, expiryDate TEXT, modelNumber TEXT, location TEXT, shelfLife TEXT, weight TEXT, description TEXT, isDeleted INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, totalCredit REAL, totalDebit REAL, balance REAL, openingBalance REAL, isDeleted INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, contactPerson TEXT, phone TEXT, email TEXT, address TEXT, category TEXT, openingBalance REAL, taxId TEXT, licenseNumber TEXT, licenseExpiry TEXT, priceCategory TEXT, website TEXT, notes TEXT, originCountry TEXT, bankName TEXT, accountNumber TEXT, paymentTerms TEXT, isDeleted INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, role TEXT, phone TEXT, salary REAL, joiningDate TEXT, isDeleted INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS transactionLogs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, customerId INTEGER, companyId INTEGER, employeeId INTEGER, customerName TEXT, companyName TEXT, employeeName TEXT, type TEXT, totalAmount REAL, paidAmount REAL, discount REAL, items TEXT, notes TEXT, oldBalance REAL, newBalance REAL, isDeleted INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS customSwatches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, hex TEXT, company TEXT)`,
      `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, description TEXT, amount REAL, category TEXT, paidTo TEXT, companyId INTEGER, companyName TEXT)`,
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, role TEXT, fullName TEXT, permissions TEXT, lastLogin TEXT)`,
      `CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, logo TEXT, logos TEXT, selectedLogoIndex INTEGER DEFAULT 0, phone TEXT, address TEXT, representativeName TEXT, companyName TEXT, whatsappNumber TEXT, dailyBackupEnabled INTEGER DEFAULT 0, lastBackupDate TEXT, backupEmailEnabled INTEGER DEFAULT 0, backupEmailTo TEXT, smtpHost TEXT, smtpPort INTEGER, smtpUsername TEXT, smtpPassword TEXT, smtpFrom TEXT)`,
      `CREATE TABLE IF NOT EXISTS productBatches (id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER NOT NULL, batchNumber TEXT, quantity REAL, unitCost REAL, salePrice REAL, expiryDate TEXT, receivedAt TEXT)`,
    ];
    for (const q of queries) {
      await this.tauriDb.execute(q);
    }
    // Lightweight forward schema migration for existing installs.
    const maybeAdd = async (stmt: string) => {
      try {
        await this.tauriDb.execute(stmt);
      } catch {
        /* column may already exist */
      }
    };
    await maybeAdd(`ALTER TABLE settings ADD COLUMN backupEmailEnabled INTEGER DEFAULT 0`);
    await maybeAdd(`ALTER TABLE settings ADD COLUMN backupEmailTo TEXT`);
    await maybeAdd(`ALTER TABLE settings ADD COLUMN smtpHost TEXT`);
    await maybeAdd(`ALTER TABLE settings ADD COLUMN smtpPort INTEGER`);
    await maybeAdd(`ALTER TABLE settings ADD COLUMN smtpUsername TEXT`);
    await maybeAdd(`ALTER TABLE settings ADD COLUMN smtpPassword TEXT`);
    await maybeAdd(`ALTER TABLE settings ADD COLUMN smtpFrom TEXT`);
    await maybeAdd(`ALTER TABLE transactionLogs ADD COLUMN capitalKind TEXT`);

    // Performance indexes for large registries (IF NOT EXISTS is safe to re-run).
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(skuCode)`,
      `CREATE INDEX IF NOT EXISTS idx_products_active ON products(isDeleted, name)`,
      `CREATE INDEX IF NOT EXISTS idx_products_company ON products(company)`,
      `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`,
      `CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(isDeleted, name)`,
      `CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(isDeleted, name)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(isDeleted, name)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactionLogs(date)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_type_deleted ON transactionLogs(type, isDeleted)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactionLogs(customerId, isDeleted)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_company ON transactionLogs(companyId, isDeleted)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_employee ON transactionLogs(employeeId, isDeleted)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)`,
      `CREATE INDEX IF NOT EXISTS idx_batches_product ON productBatches(productId, receivedAt)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_type_deleted_date ON transactionLogs(type, isDeleted, date)`,
    ];
    for (const idx of indexes) {
      try {
        await this.tauriDb.execute(idx);
      } catch {
        /* ignore */
      }
    }

    try {
      await this.tauriDb.execute("PRAGMA journal_mode=WAL");
      await this.tauriDb.execute("PRAGMA synchronous=NORMAL");
      await this.tauriDb.execute("PRAGMA temp_store=MEMORY");
      await this.tauriDb.execute("PRAGMA cache_size=-8000");
    } catch {
      /* older SQLite builds may ignore some pragmas */
    }
  }

  /** Flush SQLite WAL so copying spectrum_pro.db from disk is consistent (Tauri only). */
  async checkpointSqliteForFileCopy() {
    await this.init();
    if (!this.isTauri || !this.tauriDb?.execute) return;
    try {
      await this.tauriDb.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
  }

  /**
   * Fully release the live SQLite file lock so restore can replace spectrum_pro.db on Windows.
   * After this, call init() again (or reload) before using the DB.
   */
  async closeSqliteForRestore() {
    if (!this.isTauri) return;
    await this.init();
    if (!this.tauriDb) return;
    try {
      await this.tauriDb.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
    try {
      await this.tauriDb.close();
    } catch {
      try {
        await this.tauriDb.close("sqlite:spectrum_pro.db");
      } catch {
        /* ignore */
      }
    }
    this.tauriDb = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  async transaction(
    mode: "r" | "rw",
    tables: string[],
    callback: () => Promise<void>
  ) {
    await this.init();
    if (this.isTauri) {
      // Tauri plugin's execute() may run each statement in its own transaction.
      // Wrapping in BEGIN/COMMIT here causes "cannot start transaction within transaction".
      // Run callback without explicit BEGIN/COMMIT; each add/update runs as its own statement.
      // For atomic multi-statement batches, use runSqlTransaction() instead.
      await callback();
    } else {
      await (this.browserDb as any).transaction(
        mode,
        tables.map((t) => (this.browserDb as any)[t]),
        callback
      );
    }
  }

  /**
   * Atomic SQL batch via Rust rusqlite (Tauri only).
   * Each step: { sql: "UPDATE ...", args?: unknown[] }
   */
  async runSqlTransaction(
    steps: { sql: string; args?: unknown[] }[]
  ): Promise<void> {
    if (!this.isTauri) {
      throw new Error("runSqlTransaction requires the desktop app.");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("run_sqlite_transaction", { steps });
  }

  private tableProxy(tableName: string) {
    const self = this;

    const processRows = (rows: any[], opts?: { parseItems?: boolean }) => {
      if (!rows) return [];
      const parseItems = opts?.parseItems !== false;
      return rows.map((row: any) => {
        const obj: any = { ...row };
        Object.keys(obj).forEach((col) => {
          let val = obj[col];
          if (
            (col === "items" || col === "permissions" || col === "logos") &&
            typeof val === "string"
          ) {
            if (col === "items" && !parseItems) {
              // Leave raw / omit heavy parse for slim list queries.
              val = undefined;
            } else {
              try {
                val = JSON.parse(val);
              } catch (e) {
                val = col === "logos" ? [] : [];
              }
            }
          }
          if (col === "isDeleted" || col === "dailyBackupEnabled") val = !!val;
          if (
            val &&
            (col === "date" || col === "joiningDate" || col === "receivedAt")
          )
            val = new Date(val);
          obj[col] = val;
        });
        return obj;
      });
    };

    return {
      toArray: async () => {
        await self.init();
        if (self.isTauri) {
          const rows = await self.tauriDb.select(`SELECT * FROM ${tableName}`);
          return processRows(rows);
        } else {
          return (self.browserDb as any)[tableName].toArray();
        }
      },
      get: async (id: number) => {
        await self.init();
        if (self.isTauri) {
          const rows = await self.tauriDb.select(
            `SELECT * FROM ${tableName} WHERE id = $1`,
            [id]
          );
          return rows.length ? processRows(rows)[0] : null;
        } else {
          return (self.browserDb as any)[tableName].get(id);
        }
      },
      add: async (item: any) => {
        await self.init();
        if (self.isTauri) {
          const data = { ...item };
          delete data.id;
          if (data.isDeleted !== undefined)
            data.isDeleted = data.isDeleted ? 1 : 0;
          if (data.dailyBackupEnabled !== undefined)
            data.dailyBackupEnabled = data.dailyBackupEnabled ? 1 : 0;
          const keys = Object.keys(data);
          const cols = keys.map((k) => `"${k}"`).join(", ");
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
          const vals = keys.map((k) => {
            let v = data[k];
            if (v instanceof Date) return v.toISOString();
            if (typeof v === "object" && v !== null) return JSON.stringify(v);
            if (typeof v === "number" && Number.isNaN(v)) return null;
            return v ?? null;
          });
          const result = await self.tauriDb.execute(
            `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`,
            vals
          );
          return result.lastInsertId;
        } else {
          return (self.browserDb as any)[tableName].add(item);
        }
      },
      update: async (id: number, updates: any) => {
        await self.init();
        if (self.isTauri) {
          const data = { ...updates };
          delete data.id;
          if (data.isDeleted !== undefined)
            data.isDeleted = data.isDeleted ? 1 : 0;
          if (data.dailyBackupEnabled !== undefined)
            data.dailyBackupEnabled = data.dailyBackupEnabled ? 1 : 0;
          const keys = Object.keys(data);
          if (keys.length === 0) return;
          const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
          const vals = [
            ...keys.map((k) => {
              let v = data[k];
              if (v instanceof Date) return v.toISOString();
              if (typeof v === "object" && v !== null) return JSON.stringify(v);
              if (typeof v === "number" && Number.isNaN(v)) return null;
              return v ?? null;
            }),
            id,
          ];
          await self.tauriDb.execute(
            `UPDATE ${tableName} SET ${sets} WHERE id = $${keys.length + 1}`,
            vals
          );
        } else {
          return (self.browserDb as any)[tableName].update(id, updates);
        }
      },
      delete: async (id: number) => {
        await self.init();
        if (self.isTauri) {
          await self.tauriDb.execute(`DELETE FROM ${tableName} WHERE id = $1`, [
            id,
          ]);
        } else {
          return (self.browserDb as any)[tableName].delete(id);
        }
      },
      count: async () => {
        await self.init();
        if (self.isTauri) {
          const rows = await self.tauriDb.select(
            `SELECT COUNT(*) as count FROM ${tableName}`
          );
          return rows[0].count;
        } else {
          return (self.browserDb as any)[tableName].count();
        }
      },
      where: (col: string) => ({
        equals: (val: any) => ({
          first: async () => {
            await self.init();
            if (self.isTauri) {
              const rows = await self.tauriDb.select(
                `SELECT * FROM ${tableName} WHERE "${col}" = $1 LIMIT 1`,
                [val]
              );
              return rows.length ? processRows(rows)[0] : null;
            } else {
              return (self.browserDb as any)[tableName]
                .where(col)
                .equals(val)
                .first();
            }
          },
          toArray: async () => {
            await self.init();
            if (self.isTauri) {
              const rows = await self.tauriDb.select(
                `SELECT * FROM ${tableName} WHERE "${col}" = $1`,
                [val]
              );
              return processRows(rows);
            } else {
              return (self.browserDb as any)[tableName]
                .where(col)
                .equals(val)
                .toArray();
            }
          },
        }),
      }),
      reverse: () => ({
        toArray: async () => {
          await self.init();
          if (self.isTauri) {
            const rows = await self.tauriDb.select(
              `SELECT * FROM ${tableName} ORDER BY id DESC`
            );
            return processRows(rows);
          } else {
            return (self.browserDb as any)[tableName].reverse().toArray();
          }
        },
      }),
      /**
       * Indexed-friendly query for large tables.
       * `orWhere` clauses are OR'd together and AND'd with `where`.
       * Example: where active + (name LIKE q OR skuCode LIKE q)
       */
      query: async (opts: {
        where?: Array<{
          col: string;
          op?: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN";
          val: any;
        }>;
        orWhere?: Array<{
          col: string;
          op?: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN";
          val: any;
        }>;
        orderBy?: string;
        orderDir?: "ASC" | "DESC";
        limit?: number;
        offset?: number;
        /** When set, SELECT only these columns. Default SELECT *. */
        columns?: string[];
      } = {}) => {
        await self.init();
        const where = opts.where ?? [];
        const orWhere = opts.orWhere ?? [];
        const orderBy = opts.orderBy ?? "id";
        const orderDir = opts.orderDir === "ASC" ? "ASC" : "DESC";
        const limit = opts.limit;
        const offset = opts.offset ?? 0;
        const columns = opts.columns?.filter(Boolean);
        const parseItems = !columns || columns.includes("items");

        const matchRow = (row: any, w: { col: string; op?: string; val: any }) => {
          const op = w.op || "=";
          let left = row[w.col];
          let right = w.val;
          if (left instanceof Date) left = left.toISOString();
          if (right instanceof Date) right = right.toISOString();
          if (typeof left === "boolean") left = left ? 1 : 0;
          if (typeof right === "boolean") right = right ? 1 : 0;
          switch (op) {
            case "!=":
              return left != right;
            case ">":
              return left > right;
            case ">=":
              return left >= right;
            case "<":
              return left < right;
            case "<=":
              return left <= right;
            case "LIKE":
              return String(left ?? "")
                .toLowerCase()
                .includes(String(right ?? "").replace(/%/g, "").toLowerCase());
            case "IN": {
              const arr = Array.isArray(right) ? right : [right];
              return arr.some((x) => x == left);
            }
            default:
              return left == right;
          }
        };

        const pushClause = (
          clauses: string[],
          vals: any[],
          w: { col: string; op?: string; val: any }
        ) => {
          const op = w.op || "=";
          if (op === "IN") {
            const arr = Array.isArray(w.val) ? w.val : [w.val];
            if (!arr.length) {
              clauses.push("1=0");
              return;
            }
            const ph = arr.map((item) => {
              vals.push(item);
              return `$${vals.length}`;
            });
            clauses.push(`"${w.col}" IN (${ph.join(", ")})`);
            return;
          }
          let v = w.val;
          if (v instanceof Date) v = v.toISOString();
          if (typeof v === "boolean") v = v ? 1 : 0;
          vals.push(v);
          clauses.push(`"${w.col}" ${op} $${vals.length}`);
        };

        if (self.isTauri) {
          const clauses: string[] = [];
          const vals: any[] = [];
          where.forEach((w) => pushClause(clauses, vals, w));
          if (orWhere.length) {
            const orParts: string[] = [];
            orWhere.forEach((w) => pushClause(orParts, vals, w));
            clauses.push(`(${orParts.join(" OR ")})`);
          }
          let sql = `SELECT ${
            columns && columns.length
              ? columns.map((c) => `"${c}"`).join(", ")
              : "*"
          } FROM ${tableName}`;
          if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
          sql += ` ORDER BY "${orderBy}" ${orderDir}`;
          if (limit != null) {
            vals.push(limit);
            sql += ` LIMIT $${vals.length}`;
            if (offset) {
              vals.push(offset);
              sql += ` OFFSET $${vals.length}`;
            }
          }
          const rows = await self.tauriDb.select(sql, vals);
          return processRows(rows, { parseItems });
        }

        // Browser Dexie fallback: filter in memory (dev only).
        let rows: any[] = await (self.browserDb as any)[tableName].toArray();
        for (const w of where) {
          rows = rows.filter((row) => matchRow(row, w));
        }
        if (orWhere.length) {
          rows = rows.filter((row) => orWhere.some((w) => matchRow(row, w)));
        }
        rows.sort((a, b) => {
          const av = a[orderBy];
          const bv = b[orderBy];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp = av > bv ? 1 : -1;
          return orderDir === "ASC" ? cmp : -cmp;
        });
        if (limit != null) rows = rows.slice(offset, offset + limit);
        if (columns && columns.length) {
          rows = rows.map((row) => {
            const slim: any = {};
            for (const c of columns) slim[c] = row[c];
            return slim;
          });
        }
        return processRows(rows, { parseItems });
      },
      countWhere: async (
        where: Array<{
          col: string;
          op?: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN";
          val: any;
        }> = [],
        orWhere: Array<{
          col: string;
          op?: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN";
          val: any;
        }> = []
      ) => {
        await self.init();
        if (self.isTauri) {
          const clauses: string[] = [];
          const vals: any[] = [];
          where.forEach((w) => {
            const op = w.op || "=";
            if (op === "IN") {
              const arr = Array.isArray(w.val) ? w.val : [w.val];
              if (!arr.length) {
                clauses.push("1=0");
                return;
              }
              const ph = arr.map((item) => {
                vals.push(item);
                return `$${vals.length}`;
              });
              clauses.push(`"${w.col}" IN (${ph.join(", ")})`);
              return;
            }
            let v = w.val;
            if (v instanceof Date) v = v.toISOString();
            if (typeof v === "boolean") v = v ? 1 : 0;
            vals.push(v);
            clauses.push(`"${w.col}" ${op} $${vals.length}`);
          });
          if (orWhere.length) {
            const orParts: string[] = [];
            orWhere.forEach((w) => {
              const op = w.op || "=";
              let v = w.val;
              if (v instanceof Date) v = v.toISOString();
              if (typeof v === "boolean") v = v ? 1 : 0;
              vals.push(v);
              orParts.push(`"${w.col}" ${op} $${vals.length}`);
            });
            clauses.push(`(${orParts.join(" OR ")})`);
          }
          let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
          if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
          const rows = await self.tauriDb.select(sql, vals);
          return rows[0]?.count ?? 0;
        }

        // Browser fallback
        let rows: any[] = await (self.browserDb as any)[tableName].toArray();
        const matchRow = (row: any, w: { col: string; op?: string; val: any }) => {
          const op = w.op || "=";
          let left = row[w.col];
          let right = w.val;
          if (op === "LIKE") {
            return String(left ?? "")
              .toLowerCase()
              .includes(String(right ?? "").replace(/%/g, "").toLowerCase());
          }
          return left == right;
        };
        for (const w of where) rows = rows.filter((row) => matchRow(row, w));
        if (orWhere.length) {
          rows = rows.filter((row) => orWhere.some((w) => matchRow(row, w)));
        }
        return rows.length;
      },
    };
  }
}

export const db = new SQLiteDB();

export const seedInitialData = async () => {
  await db.init();
  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.add({
      username: "Samsoor",
      password: "Samsoor@@spectumPro",
      role: UserRole.ADMIN,
      fullName: "System Administrator",
      permissions: [
        "dashboard",
        "inventory",
        "companies",
        "purchases",
        "customers",
        "sales",
        "sales-history",
        "invoices",
        "expenses",
        "payments",
        "capital",
        "returns",
        "catalog",
        "analysis",
        "settings",
        "help",
        "daybook",
        "reports",
        "employees",
        "backup",
        "access-control",
      ],
    });
  }

  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.add({
      companyName: "Spectrum Pro Paint",
      phone: "+93 XX XXX XXXX",
      address: "Kabul, Afghanistan",
      representativeName: "Manager Name",
      logo: "",
      logos: [],
      selectedLogoIndex: 0,
      whatsappNumber: "",
      dailyBackupEnabled: true,
      backupEmailEnabled: false,
      backupEmailTo: "",
      smtpHost: "",
      smtpPort: 587,
      smtpUsername: "",
      smtpPassword: "",
      smtpFrom: "",
    });
  }

  // Do not block first paint — legacy lot backfill runs in the background once.
  void import("./batchFifo")
    .then(({ ensureLegacyBatchesForAllProducts }) =>
      ensureLegacyBatchesForAllProducts()
    )
    .catch((err) => console.warn("Legacy batch backfill skipped:", err));
};
