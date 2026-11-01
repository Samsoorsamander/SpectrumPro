
import React, { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, Edit2, Trash2, Building2, Download, 
  Printer, AlertTriangle, RefreshCw, Box, Search
} from 'lucide-react';
import { db } from '../db';
import { Product, Category, Company, SystemSettings, ProductBatch } from '../types';
import { getBatchesForProductOrdered, getBatchesForProducts } from '../batchFifo';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useFeedback } from '../contexts/FeedbackContext';
import { SimpleBookReportPage, book } from '../components/SimpleBookReport';
import PrintMountPortal from '../components/PrintMountPortal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { InventoryProductModal } from '../components/inventory/InventoryProductModal';
import { useOpenNewFromQuery } from '../hooks/useOpenNewFromQuery';
import { useDbPagination, DbWhere } from '../hooks/useDbPagination';
import { useIsOverlayMount } from '../contexts/ScreenOverlayContext';
import { useScreenActive } from '../contexts/ScreenActiveContext';
import { useInventorySync, notifyInventoryChanged, useInventoryEpoch, useDirectoryEpoch } from '../utils/dataSync';

/** Lots with remaining stock, already expected in FIFO (oldest-first) order. */
function activeLots(lots: ProductBatch[]): ProductBatch[] {
  return lots.filter((l) => (Number(l.quantity) || 0) > 0.00001);
}

/** Unit cost of the FIFO head lot (next to sell); falls back to product AVCO. */
function fifoHeadUnitCost(lots: ProductBatch[], fallback: number): number {
  const head = activeLots(lots)[0];
  if (head) return Number(head.unitCost) || 0;
  return Number(fallback) || 0;
}

export default function Inventory({ darkMode }: { darkMode: boolean }) {
  const { showError } = useFeedback();
  const overlayMount = useIsOverlayMount();
  const screenActive = useScreenActive();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [bizSettings, setBizSettings] = useState<SystemSettings | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [productToDelete, setProductToDelete] = useState<number | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [listVersion, setListVersion] = useState(0);
    const refreshList = useCallback(() => {
      setBatchesByProduct({});
      setListVersion((v) => v + 1);
    }, []);
    useInventorySync(refreshList);
    const inventoryEpoch = useInventoryEpoch();
    const { query: searchQuery, setQuery: setSearchQuery } = useGlobalSearch();
    const [listSearch, setListSearch] = useState('');
    const [filterCompany, setFilterCompany] = useState('All');
    const [filterCategory, setFilterCategory] = useState('All');
    const [batchesByProduct, setBatchesByProduct] = useState<Record<number, ProductBatch[]>>({});
    const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
    /** Full matching set for PDF/print only (loaded on demand). */
    const [printRows, setPrintRows] = useState<Product[]>([]);
    const bookRef = useRef<HTMLDivElement>(null);
    const directoryEpoch = useDirectoryEpoch();
    const lookupsLoadedRef = useRef(false);
    useEffect(() => {
    if (!screenActive) return;
    const companiesOnly = lookupsLoadedRef.current;
    let cancelled = false;
    const run = () => {
      (async () => {
        const [c, s] = await Promise.all([
          db.companies.query({
            where: [{ col: 'isDeleted', op: '=', val: 0 }],
            orderBy: 'name',
            orderDir: 'ASC',
            columns: ['id', 'name', 'isDeleted'],
          }),
          overlayMount ? Promise.resolve([]) : db.settings.toArray()
        ]);
        if (cancelled) return;
        lookupsLoadedRef.current = true;
        setCompanies(c as Company[]);
        if (!companiesOnly && s.length > 0) setBizSettings(s[0]);
      })();
    };
    if (overlayMount) {
      run();
      return () => { cancelled = true; };
    }
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(run);
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }
    const t = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    }, [overlayMount, screenActive, directoryEpoch]);
    const {
    pageItems,
    pageSize,
    setPageSize,
    total,
    shown,
    from,
    reload,
    hasMore,
    loadMore,
    loading,
  } = useDbPagination<Product>(
    async ({ pageSize: size, offset }) => {
      if (overlayMount) return { rows: [] as Product[], total: 0 };
      const where: DbWhere = [{ col: 'isDeleted', op: '=', val: 0 }];
      if (filterCompany !== 'All') where.push({ col: 'company', val: filterCompany });
      if (filterCategory !== 'All') where.push({ col: 'category', val: filterCategory });
      const q = (listSearch || searchQuery).trim();
      const orWhere: DbWhere = q
        ? [
            { col: 'name', op: 'LIKE', val: `%${q}%` },
            { col: 'skuCode', op: 'LIKE', val: `%${q}%` },
          ]
        : [];
      const [rows, count] = await Promise.all([
        db.products.query({
          where,
          orWhere,
          orderBy: 'name',
          orderDir: 'ASC',
          limit: size,
          offset,
          columns: [
            'id',
            'name',
            'skuCode',
            'barcode',
            'company',
            'category',
            'unit',
            'size',
            'stock',
            'purchasePrice',
            'salePrice',
            'minStockLevel',
            'expiryDate',
            'isDeleted',
          ],
        }),
        db.products.countWhere(where, orWhere),
      ]);
      return { rows: rows as Product[], total: count };
    },
    [filterCompany, filterCategory, listSearch, searchQuery, listVersion, overlayMount, inventoryEpoch],
    undefined,
    `inventory:${filterCompany}:${filterCategory}:${listSearch}:${searchQuery}:${listVersion}:e${inventoryEpoch}`
  );

  const loadBatchesForProduct = async (productId: number) => {
    const bs = await getBatchesForProductOrdered(productId);
    setBatchesByProduct((prev) => ({ ...prev, [productId]: bs }));
  };

  // One IN-query for visible rows (not N+1). Skip while modal is open / tab hidden.
  useEffect(() => {
    if (overlayMount || !screenActive || showModal) return;
    let cancelled = false;
    const ids = pageItems
      .map((p) => p.id)
      .filter((id): id is number => typeof id === "number")
      .filter((id) => batchesByProduct[id] === undefined);
    if (ids.length === 0) return;

    const timer = window.setTimeout(() => {
      (async () => {
        const updates = await getBatchesForProducts(ids);
        if (!cancelled) {
          setBatchesByProduct((prev) => ({ ...prev, ...updates }));
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // batchesByProduct intentionally omitted — only fill missing ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageItems, overlayMount, screenActive, showModal]);

  const confirmDelete = (prod: Product) => {
    if ((prod.stock || 0) > 0) {
      showError(
        "Cannot delete product",
        `This product has ${prod.stock} units in stock. Clear stock before deleting.`
      );
      return;
    }
    setProductToDelete(prod.id!);
    setShowDeleteConfirm(true);
  };

  const handleDeleteProduct = async () => {
    if (productToDelete) {
      try {
        const bs = await db.productBatches.where('productId').equals(productToDelete).toArray();
        for (const b of bs) {
          if (b.id) await db.productBatches.delete(b.id);
        }
        await db.products.update(productToDelete, { isDeleted: true });
        setShowDeleteConfirm(false);
        setProductToDelete(null);
        refreshList();
        notifyInventoryChanged();
      } catch (err: any) {
        console.error("Product delete error:", err);
        showError("Could not delete product", err?.message || String(err));
      }
    }
  };

  const uniqueCategories = useMemo(() => {
    return ['All', ...Object.values(Category)];
  }, []);

  const loadPrintRows = async () => {
    const where: DbWhere = [{ col: 'isDeleted', op: '=', val: 0 }];
    if (filterCompany !== 'All') where.push({ col: 'company', val: filterCompany });
    if (filterCategory !== 'All') where.push({ col: 'category', val: filterCategory });
    const q = (listSearch || searchQuery).trim();
    const orWhere: DbWhere = q
      ? [
          { col: 'name', op: 'LIKE', val: `%${q}%` },
          { col: 'skuCode', op: 'LIKE', val: `%${q}%` },
        ]
      : [];
    const rows = await db.products.query({
      where,
      orWhere,
      orderBy: 'name',
      orderDir: 'ASC',
    });
    setPrintRows(rows as Product[]);
    return rows as Product[];
  };

  const handleDownloadPDF = async () => {
    if (!bookRef.current) return;
    setIsExporting(true);
    try {
      await loadPrintRows();
      await new Promise((r) => setTimeout(r, 50));
      const { exportElementToPdf } = await import("../utils/pdfExport");
      await exportElementToPdf(
        bookRef.current,
        `Stock_Report_${new Date().toISOString().split("T")[0]}`,
        {
          scale: 2,
          backgroundColor: "#ffffff",
        }
      );
    } catch (err) {
      console.error(err);
      showError("Export failed", "Report generation failed. Try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const stickyTableClass = `flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar print:max-h-none print:overflow-visible rounded-b-none border-t ${
    darkMode ? 'bg-[#0f1115] border-gray-800/40' : 'bg-gray-50 border-gray-100'
  }`;

  const openAdd = () => {
    setEditProduct(null);
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    setEditProduct(product);
    setShowModal(true);
  };

  useOpenNewFromQuery(openAdd);

  return (
    <div className="space-y-3 w-full flex flex-col pb-3 h-full min-h-0">
      {!overlayMount && (
      <>
      <div className="no-print flex items-center justify-end gap-3 px-1 shrink-0">
        <div className="relative flex-1 min-w-[240px] max-w-xl mr-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search by name or SKU…"
            className={`w-full pl-8 pr-3 py-2 rounded-lg text-xs font-bold outline-none border-none ring-1 ${
              darkMode
                ? 'bg-gray-900 text-white ring-gray-800 placeholder:text-gray-600'
                : 'bg-gray-50 text-gray-900 ring-gray-200 placeholder:text-gray-400'
            }`}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className={`border-none rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none ${darkMode ? 'bg-gray-900 text-white ring-1 ring-gray-800' : 'bg-gray-50 text-gray-900 ring-1 ring-gray-200'}`}>
            <option value="All">All Brands</option>
            {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={`border-none rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none ${darkMode ? 'bg-gray-900 text-white ring-1 ring-gray-800' : 'bg-gray-50 text-gray-900 ring-1 ring-gray-200'}`}>
            {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <button onClick={() => { setFilterCompany('All'); setFilterCategory('All'); setListSearch(''); setSearchQuery(''); refreshList(); }} className={`p-2 rounded-lg transition-all ${darkMode ? 'bg-gray-800 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-400 hover:text-red-500'}`}><RefreshCw size={14} /></button>
          <button type="button" onClick={async () => { await loadPrintRows(); requestAnimationFrame(() => { requestAnimationFrame(() => window.print()); }); }} className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase flex items-center gap-1.5 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}><Printer size={14} /> Print</button>
          <button type="button" onClick={handleDownloadPDF} disabled={isExporting} className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase flex items-center gap-1.5 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 border border-gray-200'} ${isExporting ? 'opacity-50' : ''}`}>{isExporting ? <RefreshCw className="animate-spin" size={14} /> : <Download size={14} />} PDF</button>
          <button onClick={openAdd} className="px-4 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 shadow-lg"><Plus size={14} /> New SKU</button>
        </div>
      </div>

      <div className={`print:hidden rounded-[40px] border overflow-hidden relative flex flex-col flex-1 min-h-0 ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
        <div className={`${stickyTableClass} p-3`}>
          <table className="w-full text-left border-separate border-spacing-y-3 px-2">
            <thead className="sticky top-0 z-10">
              <tr className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'bg-[#0f1115] text-gray-500' : 'bg-gray-50 text-gray-400'}`}>
                <th className="py-4 px-6 rounded-l-2xl">S/N</th>
                <th className="py-4 px-4">Item Identity</th>
                <th className="py-4 px-4">Origin Brand</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4 text-right">In Stock</th>
                <th className="py-4 px-4 text-right">FIFO Cost</th>
                <th className="py-4 px-4 text-right">Market Rate</th>
                <th className="py-4 px-4 text-right">Expiry</th>
                <th className="py-4 px-4 text-center">Batches</th>
                <th className="py-4 px-8 text-right rounded-r-2xl">Actions</th>
              </tr>
            </thead>
            <tbody className="mt-4">
              {pageItems.map((p, index) => {
                const isLowStock = p.stock <= p.minStockLevel;
                const isCritical = p.stock <= 2;
                const lotsLoaded = p.id != null && batchesByProduct[p.id] !== undefined;
                const lots = (p.id != null ? batchesByProduct[p.id] : undefined) || [];
                const onHandLots = activeLots(lots);
                const displayCost = fifoHeadUnitCost(lots, p.purchasePrice);
                
                return (
                  <Fragment key={p.id}>
                  <tr
                    className={`group transition-all rounded-3xl ${darkMode ? 'bg-[#1a1d23] hover:bg-gray-800/50' : 'bg-white shadow-sm hover:shadow-md'}`}
                  >
                    <td className="py-6 px-6 font-black text-xs text-gray-500 rounded-l-[32px] border-y border-l border-transparent group-hover:border-gray-800/30">
                      {String(from + index).padStart(2, '0')}
                    </td>
                    <td className="py-6 px-4 border-y border-transparent group-hover:border-gray-800/30">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-[18px] flex items-center justify-center font-black text-sm shadow-inner ${darkMode ? 'bg-gray-900 text-red-500 border border-gray-800' : 'bg-red-50 text-red-500 border border-red-100'}`}>
                          {p.name[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <p className={`text-sm font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.name}</p>
                             {p.skuCode && <span className="text-[10px] font-bold text-red-500 bg-red-500/5 px-1.5 rounded-md border border-red-500/10">#{p.skuCode}</span>}
                          </div>
                          <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest px-2 py-0.5 rounded bg-gray-500/10 mt-1 inline-block">{p.category}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 px-4 border-y border-transparent group-hover:border-gray-800/30">
                      <div className="flex items-center gap-2">
                        <Building2 size={12} className="text-gray-500" />
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-tighter">{p.company}</span>
                      </div>
                    </td>
                    <td className="py-6 px-4 text-center border-y border-transparent group-hover:border-gray-800/30">
                      <span className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border ${
                        isCritical 
                          ? 'bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
                          : isLowStock 
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                            : 'bg-green-500/10 text-green-500 border-green-500/20'
                      }`}>
                        {isCritical ? 'CRITICAL' : isLowStock ? 'LOW SUPPLY' : 'HEALTHY'}
                      </span>
                    </td>
                    <td className="py-6 px-4 text-right border-y border-transparent group-hover:border-gray-800/30">
                      <p className={`text-sm font-black ${isLowStock ? 'text-red-500' : (darkMode ? 'text-gray-200' : 'text-gray-700')}`}>
                        {p.stock} <span className="text-[9px] font-bold uppercase opacity-50">{p.unit}</span>
                      </p>
                    </td>
                    <td className={`py-6 px-4 text-right font-bold text-xs border-y border-transparent group-hover:border-gray-800/30 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} title="Cost of the oldest on-hand batch (FIFO)">
                      {lotsLoaded ? displayCost.toLocaleString() : '…'}
                    </td>
                    <td className="py-6 px-4 text-right font-black text-sm text-indigo-500 border-y border-transparent group-hover:border-gray-800/30">
                      {p.salePrice.toLocaleString()}
                    </td>
                    <td className={`py-6 px-4 text-right text-[10px] font-bold border-y border-transparent group-hover:border-gray-800/30 ${darkMode ? 'text-amber-400/90' : 'text-amber-700'}`}>
                      {(() => {
                        const dated = onHandLots.filter((l) => (l.expiryDate || '').trim());
                        if (dated.length > 0) {
                          const sorted = [...dated].sort((a, b) =>
                            String(a.expiryDate || '').localeCompare(String(b.expiryDate || ''))
                          );
                          return sorted[0].expiryDate || '—';
                        }
                        return (p.expiryDate || '').trim() || '—';
                      })()}
                    </td>
                    <td className="py-6 px-4 text-center border-y border-transparent group-hover:border-gray-800/30">
                      <button
                        type="button"
                        onClick={() => {
                          const id = p.id!;
                          if (expandedProductId === id) {
                            setExpandedProductId(null);
                          } else {
                            setExpandedProductId(id);
                            loadBatchesForProduct(id);
                          }
                        }}
                        className="text-[10px] font-black text-blue-500 hover:underline uppercase"
                      >
                        {lotsLoaded
                          ? `${onHandLots.length} lot${onHandLots.length === 1 ? '' : 's'}`
                          : '…'}
                      </button>
                    </td>
                    <td className="py-6 px-8 text-right rounded-r-[32px] border-y border-r border-transparent group-hover:border-gray-800/30">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => openEdit(p)} 
                          className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => confirmDelete(p)} 
                          className="p-2.5 rounded-xl bg-gray-500/5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedProductId === p.id && lotsLoaded && (
                    <tr className={darkMode ? 'bg-black/30' : 'bg-gray-100/80'}>
                      <td colSpan={10} className="px-6 py-4 rounded-b-3xl">
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">
                          Stock lots (FIFO — list cost uses the oldest on-hand lot)
                        </p>
                        {onHandLots.length === 0 ? (
                          <p className="text-[10px] font-bold text-gray-500">No on-hand lots</p>
                        ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[10px]">
                            <thead>
                              <tr className="text-gray-500 font-black uppercase border-b border-gray-800/20">
                                <th className="py-2 pr-4">Batch #</th>
                                <th className="py-2 pr-4 text-right">Qty</th>
                                <th className="py-2 pr-4 text-right">Unit cost</th>
                                <th className="py-2 pr-4 text-right">Sell</th>
                                <th className="py-2 text-right">Expiry</th>
                              </tr>
                            </thead>
                            <tbody>
                              {onHandLots.map((lot, lotIdx) => (
                                <tr
                                  key={lot.id}
                                  className={`border-b border-gray-800/10 font-bold ${
                                    lotIdx === 0 ? (darkMode ? 'text-amber-300' : 'text-amber-700') : ''
                                  }`}
                                >
                                  <td className="py-2 pr-4">
                                    {lot.batchNumber}
                                    {lotIdx === 0 ? (
                                      <span className="ml-2 text-[8px] uppercase tracking-widest text-amber-500">
                                        FIFO
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="py-2 pr-4 text-right">{lot.quantity}</td>
                                  <td className="py-2 pr-4 text-right">{Number(lot.unitCost).toLocaleString()}</td>
                                  <td className="py-2 pr-4 text-right text-indigo-400">{Number(lot.salePrice).toLocaleString()}</td>
                                  <td className="py-2 text-right text-gray-500">{lot.expiryDate || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {total === 0 && (
                <tr>
                  <td colSpan={10} className="py-40 text-center">
                    <div className="flex flex-col items-center justify-center opacity-20 grayscale gap-4">
                      <Box size={100} strokeWidth={1} />
                      <p className="font-black uppercase text-sm tracking-[0.5em]">No matching records found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          darkMode={darkMode}
          total={total}
          shown={shown}
          hasMore={hasMore}
          onLoadMore={loadMore}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          loading={loading}
        />
      </div>
      </>
      )}

      <PrintMountPortal>
        {(isExporting || printRows.length > 0) ? (
        <SimpleBookReportPage
          ref={bookRef}
          companyName={bizSettings?.companyName || "Spectrum Pro"}
          logoSrc={bizSettings?.logo}
          reportTitle="Inventory stock register"
          periodLine={`Brand: ${filterCompany} · Category: ${filterCategory} · Printed ${new Date().toLocaleDateString()}`}
        >
          <table style={book.table}>
            <thead>
              <tr>
                <th style={{ ...book.th, width: "3%" }}>#</th>
                <th style={book.th}>Product</th>
                <th style={book.th}>SKU</th>
                <th style={book.th}>Brand</th>
                <th style={book.th}>Category</th>
                <th style={{ ...book.th, ...book.thRight }}>Qty</th>
                <th style={book.th}>Unit</th>
                <th style={{ ...book.th, ...book.thRight }}>Cost</th>
                <th style={{ ...book.th, ...book.thRight }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((p, index) => (
                <tr key={p.id}>
                  <td style={book.td}>{index + 1}</td>
                  <td style={book.td}>{p.name}</td>
                  <td style={book.td}>{p.skuCode || "—"}</td>
                  <td style={book.td}>{p.company}</td>
                  <td style={book.td}>{String(p.category)}</td>
                  <td style={{ ...book.td, ...book.tdRight }}>{p.stock}</td>
                  <td style={book.td}>{String(p.unit)}</td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {Number(p.purchasePrice).toLocaleString()}
                  </td>
                  <td style={{ ...book.td, ...book.tdRight }}>
                    {Number(p.salePrice).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...book.tag, marginTop: "6px" }}>Row count: {printRows.length}</p>
        </SimpleBookReportPage>
        ) : null}
      </PrintMountPortal>

      <InventoryProductModal
        darkMode={darkMode}
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditProduct(null);
        }}
        companies={companies}
        editProduct={editProduct}
        onSaved={() => {
          refreshList();
          notifyInventoryChanged();
        }}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(false)} className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={`relative w-full max-w-sm p-6 rounded-2xl text-center shadow-2xl ${darkMode ? 'bg-[#1a1d23] border border-gray-800' : 'bg-white'}`}>
             <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center mx-auto mb-4"><AlertTriangle size={24} /></div>
             <h3 className={`text-base font-black mb-2 uppercase ${darkMode ? 'text-white' : 'text-gray-900'}`}>Purge Registry?</h3>
             <p className="text-gray-500 font-bold uppercase text-[9px] tracking-widest mb-5 leading-relaxed">This will archive the product SKU from the active registry (soft delete).</p>
             <div className="flex gap-3">
               <button onClick={() => setShowDeleteConfirm(false)} className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase text-gray-500 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>Cancel</button>
               <button onClick={handleDeleteProduct} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">Archive</button>
             </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
