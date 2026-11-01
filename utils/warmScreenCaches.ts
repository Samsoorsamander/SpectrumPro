import { db } from "../db";
import { warmPageCache, readPageCache } from "../hooks/useDbPagination";
import { DEFAULT_PAGE_SIZE } from "../utils/format";
import { TX_LIST_COLUMNS } from "../utils/txListColumns";

/** Warm first-page caches for the heaviest tabs so the first visit is instant. */
export async function warmPrimaryScreenCaches() {
  const invKey = "inventory:All:All:::0";
  if (!readPageCache(invKey)) {
    const where = [{ col: "isDeleted", op: "=" as const, val: 0 }];
    const [rows, total] = await Promise.all([
      db.products.query({
        where,
        orderBy: "name",
        orderDir: "ASC",
        limit: DEFAULT_PAGE_SIZE,
        offset: 0,
        columns: [
          "id",
          "name",
          "skuCode",
          "barcode",
          "company",
          "category",
          "unit",
          "size",
          "stock",
          "purchasePrice",
          "salePrice",
          "minStockLevel",
          "expiryDate",
          "isDeleted",
        ],
      }),
      db.products.countWhere(where),
    ]);
    warmPageCache(invKey, rows, total, DEFAULT_PAGE_SIZE);
  }

  const purKey = "purchases:::All::0";
  if (!readPageCache(purKey)) {
    const where = [
      { col: "isDeleted", op: "=" as const, val: 0 },
      { col: "type", val: "PURCHASE" },
    ];
    const [rows, total] = await Promise.all([
      db.transactionLogs.query({
        where,
        orderBy: "date",
        orderDir: "DESC",
        limit: DEFAULT_PAGE_SIZE,
        offset: 0,
        columns: [...TX_LIST_COLUMNS],
      }),
      db.transactionLogs.countWhere(where),
    ]);
    warmPageCache(purKey, rows, total, DEFAULT_PAGE_SIZE);
  }
}
