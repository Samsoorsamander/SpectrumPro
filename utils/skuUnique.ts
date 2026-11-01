import { db } from "../db";
import type { Product } from "../types";

/**
 * Returns an active (non-deleted) product that already uses this SKU,
 * optionally excluding one id (for edit). Empty/whitespace SKU may repeat
 * (treated as "no SKU"). Comparison is case-insensitive.
 */
export async function findActiveProductBySku(
  skuCode: string | undefined | null,
  excludeId?: number | null
): Promise<Product | null> {
  const sku = String(skuCode || "").trim();
  if (!sku) return null;

  const needle = sku.toLowerCase();

  // Prefer exact match first (fast path).
  let rows = (await db.products.query({
    where: [
      { col: "isDeleted", op: "=", val: 0 },
      { col: "skuCode", op: "=", val: sku },
    ],
  })) as Product[];

  let hit = rows.find(
    (p) =>
      (p.skuCode || "").trim().toLowerCase() === needle &&
      (excludeId == null || p.id !== excludeId)
  );
  if (hit) return hit;

  // Case-insensitive: SQLite LIKE is CI for ASCII.
  rows = (await db.products.query({
    where: [
      { col: "isDeleted", op: "=", val: 0 },
      { col: "skuCode", op: "LIKE", val: sku },
    ],
  })) as Product[];

  hit = rows.find(
    (p) =>
      (p.skuCode || "").trim().toLowerCase() === needle &&
      (excludeId == null || p.id !== excludeId)
  );
  return hit || null;
}

export async function assertUniqueSkuCode(
  skuCode: string | undefined | null,
  excludeId?: number | null
): Promise<void> {
  const existing = await findActiveProductBySku(skuCode, excludeId);
  if (existing) {
    const label = String(skuCode || "").trim();
    throw new Error(
      `SKU "${label}" is already used by "${existing.name}". Choose a unique SKU.`
    );
  }
}
