#!/usr/bin/env python3
"""Generate a SpectrumPro SQLite restore file with ~10k rows per major screen/table."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

N = 10_000
CATEGORIES = ["Paint", "Primer", "Hardware", "Supplies", "Thinner", "Filler"]
UNITS = ["Gallon", "Drummy", "Quarter", "Liter", "KG", "pcs"]
EXPENSE_CATS = ["General", "Utilities", "Maintenance", "Supplies"]
HEXES = [
    "#FFFFFF",
    "#000000",
    "#FF0000",
    "#00A86B",
    "#1E90FF",
    "#FFD700",
    "#8B4513",
    "#708090",
]


def iso_days_ago(i: int, span_days: int = 730) -> str:
    """Spread records over ~2 years."""
    day = i % span_days
    dt = datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(
        days=day, hours=(i % 24), minutes=(i % 60)
    )
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def create_schema(conn: sqlite3.Connection) -> None:
    c = conn.cursor()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          skuCode TEXT, barcode TEXT, name TEXT, category TEXT, company TEXT,
          companyId INTEGER, size TEXT, unit TEXT, stock REAL, purchasePrice REAL,
          salePrice REAL, colorHex TEXT, minStockLevel REAL, expiryDate TEXT,
          modelNumber TEXT, location TEXT, shelfLife TEXT, weight TEXT,
          description TEXT, isDeleted INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT, phone TEXT, address TEXT, totalCredit REAL, totalDebit REAL,
          balance REAL, openingBalance REAL, isDeleted INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS companies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT, contactPerson TEXT, phone TEXT, email TEXT, address TEXT,
          category TEXT, openingBalance REAL, taxId TEXT, licenseNumber TEXT,
          licenseExpiry TEXT, priceCategory TEXT, website TEXT, notes TEXT,
          originCountry TEXT, bankName TEXT, accountNumber TEXT, paymentTerms TEXT,
          isDeleted INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT, role TEXT, phone TEXT, salary REAL, joiningDate TEXT,
          isDeleted INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS transactionLogs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT, customerId INTEGER, companyId INTEGER, employeeId INTEGER,
          customerName TEXT, companyName TEXT, employeeName TEXT, type TEXT,
          totalAmount REAL, paidAmount REAL, discount REAL, items TEXT, notes TEXT,
          oldBalance REAL, newBalance REAL, isDeleted INTEGER DEFAULT 0,
          capitalKind TEXT
        );
        CREATE TABLE IF NOT EXISTS customSwatches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT, hex TEXT, company TEXT
        );
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT, description TEXT, amount REAL, category TEXT, paidTo TEXT,
          companyId INTEGER, companyName TEXT
        );
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE, password TEXT, role TEXT, fullName TEXT,
          permissions TEXT, lastLogin TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          logo TEXT, logos TEXT, selectedLogoIndex INTEGER DEFAULT 0,
          phone TEXT, address TEXT, representativeName TEXT, companyName TEXT,
          whatsappNumber TEXT, dailyBackupEnabled INTEGER DEFAULT 0,
          lastBackupDate TEXT, backupEmailEnabled INTEGER DEFAULT 0,
          backupEmailTo TEXT, smtpHost TEXT, smtpPort INTEGER,
          smtpUsername TEXT, smtpPassword TEXT, smtpFrom TEXT
        );
        CREATE TABLE IF NOT EXISTS productBatches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          productId INTEGER NOT NULL, batchNumber TEXT, quantity REAL,
          unitCost REAL, salePrice REAL, expiryDate TEXT, receivedAt TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_products_sku ON products(skuCode);
        CREATE INDEX IF NOT EXISTS idx_products_active ON products(isDeleted, name);
        CREATE INDEX IF NOT EXISTS idx_products_company ON products(company);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(isDeleted, name);
        CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(isDeleted, name);
        CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(isDeleted, name);
        CREATE INDEX IF NOT EXISTS idx_tx_date ON transactionLogs(date);
        CREATE INDEX IF NOT EXISTS idx_tx_type_deleted ON transactionLogs(type, isDeleted);
        CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactionLogs(customerId, isDeleted);
        CREATE INDEX IF NOT EXISTS idx_tx_company ON transactionLogs(companyId, isDeleted);
        CREATE INDEX IF NOT EXISTS idx_tx_employee ON transactionLogs(employeeId, isDeleted);
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
        CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
        CREATE INDEX IF NOT EXISTS idx_batches_product ON productBatches(productId, receivedAt);
        """
    )


def bulk(conn: sqlite3.Connection, sql: str, rows: list, label: str) -> None:
    print(f"  inserting {len(rows):,} {label}...", flush=True)
    conn.executemany(sql, rows)
    conn.commit()


def main() -> int:
    out_dir = Path(__file__).resolve().parents[1] / "perf-seed"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "spectrum_pro_perf_10k.db"
    if out_path.exists():
        out_path.unlink()

    print(f"Creating {out_path}", flush=True)
    conn = sqlite3.connect(str(out_path))
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    conn.execute("PRAGMA temp_store=MEMORY")
    create_schema(conn)

    # --- settings + admin user (login works after restore) ---
    perms = json.dumps(
        [
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
        ]
    )
    conn.execute(
        """
        INSERT INTO users (username, password, role, fullName, permissions, lastLogin)
        VALUES (?, ?, 'ADMIN', 'System Administrator', ?, NULL)
        """,
        ("Samsoor", "Samsoor@@spectumPro", perms),
    )
    conn.execute(
        """
        INSERT INTO settings (
          logo, logos, selectedLogoIndex, phone, address, representativeName,
          companyName, whatsappNumber, dailyBackupEnabled, lastBackupDate,
          backupEmailEnabled, backupEmailTo, smtpHost, smtpPort,
          smtpUsername, smtpPassword, smtpFrom
        ) VALUES (
          '', '[]', 0, '+93 700 000 000', 'Kabul, Afghanistan', 'Perf Test Manager',
          'Spectrum Pro Perf Seed', '', 1, NULL,
          0, '', '', 587, '', '', ''
        )
        """
    )
    conn.commit()

    # --- companies ---
    companies = [
        (
            f"Supplier {i:05d}",
            f"Contact {i:05d}",
            f"070{i:07d}"[-10:],
            f"supplier{i:05d}@example.com",
            f"Address {i % 500}, Kabul",
            CATEGORIES[i % len(CATEGORIES)],
            float(i % 1000),
            f"TAX-{i:05d}",
            f"LIC-{i:05d}",
            None,
            "General",
            None,
            f"Perf seed company {i}",
            "AF",
            None,
            None,
            "Net 30",
            0,
        )
        for i in range(1, N + 1)
    ]
    bulk(
        conn,
        """INSERT INTO companies (
          name, contactPerson, phone, email, address, category, openingBalance,
          taxId, licenseNumber, licenseExpiry, priceCategory, website, notes,
          originCountry, bankName, accountNumber, paymentTerms, isDeleted
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        companies,
        "companies",
    )

    # --- customers ---
    customers = [
        (
            f"Customer {i:05d}",
            f"079{i:07d}"[-10:],
            f"Street {i % 800}, Kabul",
            float((i * 11) % 5000),
            float((i * 7) % 4000),
            float((i * 3) % 2000 - 1000),
            float(i % 500),
            0,
        )
        for i in range(1, N + 1)
    ]
    bulk(
        conn,
        """INSERT INTO customers (
          name, phone, address, totalCredit, totalDebit, balance, openingBalance, isDeleted
        ) VALUES (?,?,?,?,?,?,?,?)""",
        customers,
        "customers",
    )

    # --- employees ---
    employees = [
        (
            f"Employee {i:05d}",
            "Sales" if i % 3 else "Warehouse",
            f"078{i:07d}"[-10:],
            float(8000 + (i % 50) * 100),
            iso_days_ago(i, 1000),
            0,
        )
        for i in range(1, N + 1)
    ]
    bulk(
        conn,
        """INSERT INTO employees (name, role, phone, salary, joiningDate, isDeleted)
           VALUES (?,?,?,?,?,?)""",
        employees,
        "employees",
    )

    # --- products ---
    products = []
    for i in range(1, N + 1):
        company_id = ((i - 1) % N) + 1
        cat = CATEGORIES[i % len(CATEGORIES)]
        unit = UNITS[i % len(UNITS)]
        purchase = float(100 + (i % 900))
        sale = purchase * 1.35
        stock = float(50 + (i % 200))
        products.append(
            (
                f"SKU-{i:05d}",
                f"BC{i:012d}",
                f"Product {i:05d} {cat}",
                cat,
                f"Supplier {company_id:05d}",
                company_id,
                "1 Gal" if unit == "Gallon" else "Std",
                unit,
                stock,
                purchase,
                sale,
                HEXES[i % len(HEXES)],
                10.0,
                None,
                f"MDL-{i:05d}",
                f"R{(i % 20) + 1}-S{(i % 10) + 1}",
                "24 months",
                None,
                f"Perf seed product {i}",
                0,
            )
        )
    bulk(
        conn,
        """INSERT INTO products (
          skuCode, barcode, name, category, company, companyId, size, unit, stock,
          purchasePrice, salePrice, colorHex, minStockLevel, expiryDate, modelNumber,
          location, shelfLife, weight, description, isDeleted
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        products,
        "products",
    )

    # --- productBatches (1:1 with products; stock matches) ---
    batches = []
    for i in range(1, N + 1):
        purchase = float(100 + (i % 900))
        sale = purchase * 1.35
        stock = float(50 + (i % 200))
        batches.append(
            (
                i,
                f"OPENING-{i:05d}",
                stock,
                purchase,
                sale,
                "",
                iso_days_ago(i, 700),
            )
        )
    bulk(
        conn,
        """INSERT INTO productBatches (
          productId, batchNumber, quantity, unitCost, salePrice, expiryDate, receivedAt
        ) VALUES (?,?,?,?,?,?,?)""",
        batches,
        "productBatches",
    )

    # --- customSwatches (Catalog) ---
    swatches = [
        (
            f"Color {i:05d}",
            HEXES[i % len(HEXES)],
            f"Supplier {((i - 1) % N) + 1:05d}",
        )
        for i in range(1, N + 1)
    ]
    bulk(
        conn,
        "INSERT INTO customSwatches (name, hex, company) VALUES (?,?,?)",
        swatches,
        "customSwatches",
    )

    # --- expenses ---
    expenses = [
        (
            iso_days_ago(i),
            f"Expense entry {i:05d}",
            float(50 + (i % 500)),
            EXPENSE_CATS[i % len(EXPENSE_CATS)],
            f"Vendor {(i % 200) + 1}",
            ((i - 1) % N) + 1 if i % 4 == 0 else None,
            f"Supplier {((i - 1) % N) + 1:05d}" if i % 4 == 0 else None,
        )
        for i in range(1, N + 1)
    ]
    bulk(
        conn,
        """INSERT INTO expenses (
          date, description, amount, category, paidTo, companyId, companyName
        ) VALUES (?,?,?,?,?,?,?)""",
        expenses,
        "expenses",
    )

    # --- transactionLogs: 10k per type that backs major screens ---
    tx_sql = """INSERT INTO transactionLogs (
      date, customerId, companyId, employeeId, customerName, companyName, employeeName,
      type, totalAmount, paidAmount, discount, items, notes, oldBalance, newBalance,
      isDeleted, capitalKind
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""

    def sale_items(i: int) -> str:
        pid = ((i - 1) % N) + 1
        price = float(100 + (pid % 900)) * 1.35
        qty = 1 + (i % 3)
        total = round(price * qty, 2)
        batch_id = pid
        return json.dumps(
            [
                {
                    "productId": pid,
                    "productName": f"Product {pid:05d}",
                    "quantity": qty,
                    "unitPrice": price,
                    "itemDiscount": 0,
                    "total": total,
                    "unit": UNITS[pid % len(UNITS)],
                    "batchAllocations": [
                        {
                            "batchId": batch_id,
                            "batchNumber": f"OPENING-{pid:05d}",
                            "quantity": qty,
                            "unitCost": float(100 + (pid % 900)),
                        }
                    ],
                    "fifoAvgUnitCost": float(100 + (pid % 900)),
                }
            ]
        )

    def purchase_items(i: int) -> str:
        pid = ((i - 1) % N) + 1
        cost = float(100 + (pid % 900))
        qty = 2 + (i % 5)
        return json.dumps(
            [
                {
                    "productId": pid,
                    "productName": f"Product {pid:05d}",
                    "quantity": qty,
                    "unitPrice": cost,
                    "itemDiscount": 0,
                    "total": round(cost * qty, 2),
                    "unit": UNITS[pid % len(UNITS)],
                }
            ]
        )

    # SALE
    sales = []
    for i in range(1, N + 1):
        cust = ((i - 1) % N) + 1
        emp = ((i - 1) % N) + 1
        items = sale_items(i)
        total = json.loads(items)[0]["total"]
        paid = round(total * (0.5 if i % 2 else 1.0), 2)
        sales.append(
            (
                iso_days_ago(i),
                cust,
                None,
                emp,
                f"Customer {cust:05d}",
                "",
                f"Employee {emp:05d}",
                "SALE",
                total,
                paid,
                0.0,
                items,
                f"Perf SALE #{i:05d}",
                0.0,
                total - paid,
                0,
                None,
            )
        )
    bulk(conn, tx_sql, sales, "SALE transactions")

    # PURCHASE
    purchases = []
    for i in range(1, N + 1):
        company = ((i - 1) % N) + 1
        emp = ((i - 1) % N) + 1
        items = purchase_items(i)
        total = json.loads(items)[0]["total"]
        paid = round(total * (0.6 if i % 3 else 1.0), 2)
        purchases.append(
            (
                iso_days_ago(i + 3),
                None,
                company,
                emp,
                "",
                f"Supplier {company:05d}",
                f"Employee {emp:05d}",
                "PURCHASE",
                total,
                paid,
                0.0,
                items,
                f"Perf PURCHASE #{i:05d}",
                0.0,
                total - paid,
                0,
                None,
            )
        )
    bulk(conn, tx_sql, purchases, "PURCHASE transactions")

    # RETURN
    returns = []
    for i in range(1, N + 1):
        cust = ((i - 1) % N) + 1
        items = sale_items(i)
        total = json.loads(items)[0]["total"] * 0.5
        returns.append(
            (
                iso_days_ago(i + 7),
                cust,
                None,
                ((i - 1) % N) + 1,
                f"Customer {cust:05d}",
                "",
                f"Employee {((i - 1) % N) + 1:05d}",
                "RETURN",
                round(total, 2),
                0.0,
                0.0,
                items,
                f"Perf RETURN #{i:05d}",
                0.0,
                0.0,
                0,
                None,
            )
        )
    bulk(conn, tx_sql, returns, "RETURN transactions")

    # PURCHASE_RETURN
    purch_returns = []
    for i in range(1, N + 1):
        company = ((i - 1) % N) + 1
        items = purchase_items(i)
        total = json.loads(items)[0]["total"] * 0.4
        purch_returns.append(
            (
                iso_days_ago(i + 11),
                None,
                company,
                ((i - 1) % N) + 1,
                "",
                f"Supplier {company:05d}",
                f"Employee {((i - 1) % N) + 1:05d}",
                "PURCHASE_RETURN",
                round(total, 2),
                0.0,
                0.0,
                items,
                f"Perf PURCHASE_RETURN #{i:05d}",
                0.0,
                0.0,
                0,
                None,
            )
        )
    bulk(conn, tx_sql, purch_returns, "PURCHASE_RETURN transactions")

    # PAYMENT (customer receipts + company pays)
    payments = []
    for i in range(1, N + 1):
        amount = float(100 + (i % 900))
        if i % 2:
            cust = ((i - 1) % N) + 1
            payments.append(
                (
                    iso_days_ago(i + 13),
                    cust,
                    None,
                    ((i - 1) % N) + 1,
                    f"Customer {cust:05d}",
                    "",
                    f"Employee {((i - 1) % N) + 1:05d}",
                    "PAYMENT",
                    amount,
                    amount,
                    0.0,
                    "[]",
                    f"Perf RECEIPT #{i:05d}",
                    amount,
                    0.0,
                    0,
                    None,
                )
            )
        else:
            company = ((i - 1) % N) + 1
            payments.append(
                (
                    iso_days_ago(i + 13),
                    None,
                    company,
                    ((i - 1) % N) + 1,
                    "",
                    f"Supplier {company:05d}",
                    f"Employee {((i - 1) % N) + 1:05d}",
                    "PAYMENT",
                    amount,
                    amount,
                    0.0,
                    "[]",
                    f"Perf SUPPLIER PAY #{i:05d}",
                    amount,
                    0.0,
                    0,
                    None,
                )
            )
    bulk(conn, tx_sql, payments, "PAYMENT transactions")

    # SALARY
    salaries = []
    for i in range(1, N + 1):
        emp = ((i - 1) % N) + 1
        amount = float(8000 + (i % 50) * 100)
        salaries.append(
            (
                iso_days_ago(i + 17),
                None,
                None,
                emp,
                "",
                "",
                f"Employee {emp:05d}",
                "SALARY",
                amount,
                amount,
                0.0,
                "[]",
                f"Perf SALARY #{i:05d}",
                None,
                None,
                0,
                None,
            )
        )
    bulk(conn, tx_sql, salaries, "SALARY transactions")

    # CAPITAL_INJECTION
    capitals = []
    for i in range(1, N + 1):
        kind = "OWNER" if i % 2 else "EXTERNAL"
        amount = float(10000 + (i % 100) * 500)
        capitals.append(
            (
                iso_days_ago(i + 19),
                None,
                None,
                None,
                f"Investor {(i % 50) + 1}" if kind == "EXTERNAL" else "Owner",
                "",
                "",
                "CAPITAL_INJECTION",
                amount,
                amount,
                0.0,
                "[]",
                f"Capital injection — {kind} #{i:05d}",
                None,
                None,
                0,
                kind,
            )
        )
    bulk(conn, tx_sql, capitals, "CAPITAL_INJECTION transactions")

    # Verify counts
    print("\nCounts:", flush=True)
    for table in [
        "products",
        "customers",
        "companies",
        "employees",
        "productBatches",
        "customSwatches",
        "expenses",
        "users",
        "settings",
    ]:
        n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {n:,}", flush=True)
    for t in [
        "SALE",
        "PURCHASE",
        "RETURN",
        "PURCHASE_RETURN",
        "PAYMENT",
        "SALARY",
        "CAPITAL_INJECTION",
    ]:
        n = conn.execute(
            "SELECT COUNT(*) FROM transactionLogs WHERE type=?", (t,)
        ).fetchone()[0]
        print(f"  transactionLogs[{t}]: {n:,}", flush=True)

    # Integrity
    ok = conn.execute("PRAGMA integrity_check").fetchone()[0]
    print(f"\nintegrity_check: {ok}", flush=True)
    if ok != "ok":
        print("ERROR: integrity check failed", file=sys.stderr)
        return 1

    conn.execute("VACUUM")
    conn.close()

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nWrote {out_path} ({size_mb:.1f} MB)", flush=True)

    # Copy into app backups folder so it appears in Backup & Restore
    appdata = os.environ.get("APPDATA")
    copied = []
    if appdata:
        backups = (
            Path(appdata)
            / "com.spectrumpro.management.system"
            / "backups"
        )
        backups.mkdir(parents=True, exist_ok=True)
        dest = backups / out_path.name
        dest.write_bytes(out_path.read_bytes())
        copied.append(dest)

    # Also mirror to C:\SpectrumProBackups if C: is writable
    try:
        drive_dir = Path("C:/SpectrumProBackups")
        drive_dir.mkdir(parents=True, exist_ok=True)
        dest = drive_dir / out_path.name
        dest.write_bytes(out_path.read_bytes())
        copied.append(dest)
    except OSError as e:
        print(f"Skip C:\\SpectrumProBackups copy: {e}", flush=True)

    for p in copied:
        print(f"Copied to {p}", flush=True)

    print(
        "\nRestore in app: Backup & Restore → select spectrum_pro_perf_10k.db\n"
        "Login after restore: Samsoor / Samsoor@@spectumPro",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
