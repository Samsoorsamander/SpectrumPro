import { db } from "./db";
import type { ProductBatch, Transaction, TransactionItem } from "./types";

export type FifoAllocation = {
  productId: number;
  batchId: number;
  batchNumber: string;
  quantity: number;
  unitCost: number;
};

export async function getBatchesForProductOrdered(
  productId: number
): Promise<ProductBatch[]> {
  const rows = await db.productBatches.query({
    where: [{ col: "productId", val: productId }],
    orderBy: "receivedAt",
    orderDir: "ASC",
    columns: [
      "id",
      "productId",
      "batchNumber",
      "quantity",
      "unitCost",
      "salePrice",
      "expiryDate",
      "receivedAt",
    ],
  });
  return (rows as ProductBatch[]).sort((a, b) => {
    const ta = new Date(a.receivedAt || 0).getTime();
    const tb = new Date(b.receivedAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    return (a.id || 0) - (b.id || 0);
  });
}

/** One query for many products — avoids N+1 on inventory list. */
export async function getBatchesForProducts(
  productIds: number[]
): Promise<Record<number, ProductBatch[]>> {
  const out: Record<number, ProductBatch[]> = {};
  for (const id of productIds) out[id] = [];
  if (!productIds.length) return out;
  const rows = (await db.productBatches.query({
    where: [{ col: "productId", op: "IN", val: productIds }],
    orderBy: "receivedAt",
    orderDir: "ASC",
    columns: [
      "id",
      "productId",
      "batchNumber",
      "quantity",
      "unitCost",
      "salePrice",
      "expiryDate",
      "receivedAt",
    ],
  })) as ProductBatch[];
  for (const b of rows) {
    const pid = b.productId;
    if (!out[pid]) out[pid] = [];
    out[pid].push(b);
  }
  for (const id of productIds) {
    out[id].sort((a, b) => {
      const ta = new Date(a.receivedAt || 0).getTime();
      const tb = new Date(b.receivedAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return (a.id || 0) - (b.id || 0);
    });
  }
  return out;
}

export async function syncProductStockFromBatches(productId: number) {
  const batches = await getBatchesForProductOrdered(productId);
  const sum = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
  const product = await db.products.get(productId);
  if (product) {
    await db.products.update(productId, { stock: sum });
  }
}

const LEGACY_BATCHES_FLAG = "spectrum_pro_legacy_batches_v1";

/**
 * One-time: create LEGACY batches for products that have stock but no lots.
 * Safe to call repeatedly; skips when already completed.
 */
export async function ensureLegacyBatchesForAllProducts() {
  try {
    if (localStorage.getItem(LEGACY_BATCHES_FLAG) === "1") return;
  } catch {
    /* ignore */
  }
  await db.init();
  const products = (await db.products.query({
    where: [{ col: "isDeleted", op: "=", val: 0 }],
    columns: [
      "id",
      "stock",
      "purchasePrice",
      "salePrice",
      "expiryDate",
      "isDeleted",
    ],
  })) as { id?: number; stock?: number; purchasePrice?: number; salePrice?: number; expiryDate?: string; isDeleted?: boolean }[];

  const existing = (await db.productBatches.query({
    columns: ["productId"],
  })) as { productId: number }[];
  const hasBatch = new Set(existing.map((b) => b.productId));

  for (const p of products) {
    if (!p.id || hasBatch.has(p.id)) continue;
    const stock = Number(p.stock) || 0;
    if (stock <= 0) continue;
    await db.productBatches.add({
      productId: p.id,
      batchNumber: "LEGACY",
      quantity: stock,
      unitCost: Number(p.purchasePrice) || 0,
      salePrice: Number(p.salePrice) || 0,
      expiryDate: p.expiryDate || "",
      receivedAt: new Date(0).toISOString(),
    });
  }
  try {
    localStorage.setItem(LEGACY_BATCHES_FLAG, "1");
  } catch {
    /* ignore */
  }
}

/**
 * FIFO by receivedAt (oldest first). Returns allocations; does not mutate DB.
 */
export async function allocateFifo(
  productId: number,
  quantity: number
): Promise<FifoAllocation[]> {
  const need = Number(quantity) || 0;
  if (need <= 0) return [];
  const batches = await getBatchesForProductOrdered(productId);
  let remaining = need;
  const out: FifoAllocation[] = [];
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = Number(b.quantity) || 0;
    if (avail <= 0) continue;
    const take = Math.min(remaining, avail);
    out.push({
      productId,
      batchId: b.id!,
      batchNumber: b.batchNumber || "",
      quantity: take,
      unitCost: Number(b.unitCost) || 0,
    });
    remaining -= take;
  }
  if (remaining > 0.0001) {
    throw new Error(
      `Insufficient batch stock for product #${productId} (short by ${remaining})`
    );
  }
  return out;
}

export async function applyFifoDeductions(allocations: FifoAllocation[]) {
  const productIds = new Set<number>();
  for (const a of allocations) {
    const take = Number(a.quantity) || 0;
    if (take <= 0) continue;
    const batch = await db.productBatches.get(a.batchId);
    if (!batch) {
      throw new Error(
        `FIFO apply: batch #${a.batchId} missing for product #${a.productId} (cannot deduct ${take})`
      );
    }
    const q = Math.max(0, (Number(batch.quantity) || 0) - take);
    productIds.add(a.productId);
    if (q <= 0.0001) {
      await db.productBatches.delete(a.batchId);
    } else {
      await db.productBatches.update(a.batchId, { quantity: q });
    }
  }
  for (const pid of productIds) {
    await syncProductStockFromBatches(pid);
  }
}

/** Use quantity × unitPrice vs total to avoid FIFO using a wrong qty (e.g. string coercion). */
export function parseSaleLineQty(item: {
  quantity: number | string;
  unitPrice: number | string;
  total: number | string;
}): number {
  const q = Number(item.quantity);
  const up = Number(item.unitPrice) || 0;
  const t = Number(item.total) || 0;
  if (!Number.isFinite(q) || q < 0) return 0;
  if (up > 0 && t >= 0) {
    const implied = t / up;
    const lineCoherent = Math.abs(q * up - t) < 0.02;
    if (lineCoherent) {
      return Math.round(q * 1000) / 1000;
    }
    if (Number.isFinite(implied) && implied >= 0) {
      return Math.round(implied * 1000) / 1000;
    }
  }
  return Math.round(q * 1000) / 1000;
}

/**
 * Scales stored FIFO layers so their sum matches the line qty (fixes bad persisted allocations).
 */
export function normalizeAllocationsToLineQty(
  item: TransactionItem
): NonNullable<TransactionItem["batchAllocations"]> {
  const allocs = item.batchAllocations;
  if (!allocs?.length) return [];
  const lineQty = parseSaleLineQty(item);
  const sum = allocs.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
  if (sum <= 0 || lineQty <= 0) return allocs;
  if (Math.abs(sum - lineQty) < 0.02) return allocs;
  const scale = lineQty / sum;
  return allocs.map((a) => ({
    ...a,
    batchId: a.batchId,
    batchNumber: a.batchNumber,
    unitCost: Number(a.unitCost) || 0,
    quantity: (Number(a.quantity) || 0) * scale,
  }));
}

/** Change to on-hand stock when a transaction line is posted (positive = more inventory). */
export function stockDeltaWhenPosting(
  type: Transaction["type"],
  qty: number
): number {
  const q = Number(qty) || 0;
  if (q <= 0) return 0;
  switch (type) {
    case "SALE":
    case "PURCHASE_RETURN":
      return -q;
    case "PURCHASE":
    case "RETURN":
      return q;
    default:
      return 0;
  }
}

type StoredSaleAlloc = {
  batchId: number;
  batchNumber: string;
  quantity: number;
  unitCost: number;
};

/**
 * Undo one posted SALE line: put quantity back into batches (or legacy stock) so
 * inventory matches reversing that sale before re-posting or deleting the invoice.
 */
export async function undoPostedSaleLine(
  productId: number,
  item: TransactionItem
) {
  const qty = parseSaleLineQty(item);
  if (qty <= 0) return;
  const allocs = item.batchAllocations;
  if (allocs && allocs.length > 0) {
    await restoreSaleBatchAllocations(
      productId,
      normalizeAllocationsToLineQty(item)
    );
    return;
  }

  // No stored layers: never dump into batches[0] (would corrupt multi-lot costs).
  // Create a dedicated RESTORED lot at the best-known unit cost.
  const product = await db.products.get(productId);
  if (!product) return;
  const unitCost =
    Number(item.fifoAvgUnitCost) ||
    Number((item as { unitCost?: number }).unitCost) ||
    Number(product.purchasePrice) ||
    0;
  await db.productBatches.add({
    productId,
    batchNumber: "RESTORED",
    quantity: qty,
    unitCost,
    salePrice: Number(product.salePrice) || 0,
    expiryDate: "",
    receivedAt: new Date().toISOString(),
  });
  await recomputeProductCostsFromBatches(productId);
}

/** Undo a posted sale line using stored FIFO layers (or recreate deleted lots). */
export async function restoreSaleBatchAllocations(
  productId: number,
  allocations: StoredSaleAlloc[] | undefined
) {
  if (!allocations?.length) return;
  for (const a of allocations) {
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) continue;
    const batchId = Number(a.batchId) || 0;
    const batch = batchId > 0 ? await db.productBatches.get(batchId) : undefined;
    if (batch) {
      await db.productBatches.update(batchId, {
        quantity: (Number(batch.quantity) || 0) + qty,
      });
    } else {
      const product = await db.products.get(productId);
      await db.productBatches.add({
        productId,
        batchNumber: a.batchNumber || "RESTORED",
        quantity: qty,
        unitCost: Number(a.unitCost) || 0,
        salePrice: Number(product?.salePrice) || 0,
        expiryDate: "",
        receivedAt: new Date().toISOString(),
      });
    }
  }
  await recomputeProductCostsFromBatches(productId);
}

/**
 * Plan batch restore layers for a customer return of `returnQty` of a product.
 * Walks that customer's SALE lines newest-first and peels FIFO layers (LIFO of
 * consumption). Falls back to a RESTORED lot at product AVCO for any shortfall.
 */
export async function allocateCustomerReturnRestore(
  productId: number,
  returnQty: number,
  customerId: number
): Promise<{ allocations: StoredSaleAlloc[]; avgCost: number }> {
  const need = Number(returnQty) || 0;
  if (need <= 0) return { allocations: [], avgCost: 0 };

  const allLogs = await db.transactionLogs
    .where("customerId")
    .equals(customerId)
    .toArray();
  const sales = allLogs
    .filter((t) => !t.isDeleted && t.type === "SALE")
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

  let remaining = need;
  const out: StoredSaleAlloc[] = [];

  for (const sale of sales) {
    if (remaining <= 0) break;
    const items = [...(sale.items ?? [])].reverse();
    for (const item of items) {
      if (remaining <= 0) break;
      if (item.productId !== productId) continue;

      const layers = normalizeAllocationsToLineQty(item);
      if (layers.length > 0) {
        for (const layer of [...layers].reverse()) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(layer.quantity) || 0);
          if (take <= 0) continue;
          out.push({
            batchId: layer.batchId,
            batchNumber: layer.batchNumber || "",
            quantity: take,
            unitCost: Number(layer.unitCost) || 0,
          });
          remaining -= take;
        }
        continue;
      }

      const lineQty = parseSaleLineQty(item);
      const take = Math.min(remaining, lineQty);
      if (take <= 0) continue;
      const unitCost = Number(item.fifoAvgUnitCost);
      const product = await db.products.get(productId);
      out.push({
        batchId: 0,
        batchNumber: "RESTORED",
        quantity: take,
        unitCost: Number.isFinite(unitCost)
          ? unitCost
          : Number(product?.purchasePrice) || 0,
      });
      remaining -= take;
    }
  }

  if (remaining > 0.0001) {
    const product = await db.products.get(productId);
    out.push({
      batchId: 0,
      batchNumber: "RESTORED",
      quantity: remaining,
      unitCost: Number(product?.purchasePrice) || 0,
    });
  }

  const asFifo: FifoAllocation[] = out.map((a) => ({
    productId,
    batchId: a.batchId,
    batchNumber: a.batchNumber,
    quantity: a.quantity,
    unitCost: a.unitCost,
  }));
  return { allocations: out, avgCost: fifoWeightedAvgCost(asFifo) };
}

export function fifoWeightedAvgCost(allocations: FifoAllocation[]): number {
  if (allocations.length === 0) return 0;
  const qty = allocations.reduce((s, a) => s + a.quantity, 0);
  if (qty <= 0) return 0;
  return cogsFromAllocations(allocations) / qty;
}

/** Total COGS from FIFO layers: Σ(qty × unitCost). */
export function cogsFromAllocations(
  allocations: Array<{ quantity?: number; unitCost?: number }> | undefined
): number {
  if (!allocations?.length) return 0;
  return allocations.reduce(
    (s, a) => s + (Number(a.quantity) || 0) * (Number(a.unitCost) || 0),
    0
  );
}

/** After batch changes: sync product.stock and weighted cost / latest sale price */
export async function recomputeProductCostsFromBatches(productId: number) {
  const batches = await getBatchesForProductOrdered(productId);
  let sumQty = 0;
  let sumCost = 0;
  for (const b of batches) {
    const q = Number(b.quantity) || 0;
    if (q <= 0) continue;
    sumQty += q;
    sumCost += q * (Number(b.unitCost) || 0);
  }
  const avgCost = sumQty > 0 ? sumCost / sumQty : 0;
  const byNewest = [...batches].sort(
    (a, b) =>
      new Date(b.receivedAt || 0).getTime() -
      new Date(a.receivedAt || 0).getTime()
  );
  const latestSale = byNewest[0]
    ? Number(byNewest[0].salePrice) || 0
    : 0;
  const product = await db.products.get(productId);
  if (!product) return;
  await db.products.update(productId, {
    stock: sumQty,
    purchasePrice: avgCost,
    salePrice: latestSale > 0 ? latestSale : Number(product.salePrice) || 0,
  });
}

/** Remove stock for a purchase line when no batch id (legacy documents) */
export async function revertPurchaseQuantityLegacy(
  productId: number,
  qty: number
) {
  let remaining = Number(qty) || 0;
  if (remaining <= 0) return;
  const batches = await getBatchesForProductOrdered(productId);
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = Number(b.quantity) || 0;
    if (avail <= 0) continue;
    const take = Math.min(remaining, avail);
    const newQ = avail - take;
    remaining -= take;
    if (newQ <= 0.0001) await db.productBatches.delete(b.id!);
    else await db.productBatches.update(b.id!, { quantity: newQ });
  }
  await recomputeProductCostsFromBatches(productId);
}
