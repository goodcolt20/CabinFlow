"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePersistentDate } from "@/lib/usePersistentDate";
import { useEffect, useRef, useState } from "react";

interface Product {
  id: number;
  name: string;
  unit: string;
  category: string;
  defaultShelfLifeDays: number | null;
}

interface QueueItem {
  key: number;
  productId: string;
  qty: string;
}

interface CountRow {
  count: { productId: number; quantity: number };
}

interface SummaryRow {
  product: Product;
  total: number;
  prepped: number;
  sold: number;
  counted: number;
  variance: number;
  saleId?: number;
}

let keyCounter = 0;
function nextKey() { return ++keyCounter; }

const TEMPLATE_KEY = "cabinflow_eod_template";

function loadTemplate(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

function initQueue(): QueueItem[] {
  const ids = loadTemplate();
  if (ids.length === 0) return [{ key: nextKey(), productId: "", qty: "" }];
  return ids.map((pid) => ({ key: nextKey(), productId: pid, qty: "" }));
}

export default function EodPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [date, setDate] = usePersistentDate();
  const [queue, setQueue] = useState<QueueItem[]>(initQueue);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [savingPrepIds, setSavingPrepIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const rowRefs = useRef<Record<number, HTMLSelectElement | null>>({});
  const lastAddedKey = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
  }, []);

  // Persist queue product selections as template
  useEffect(() => {
    const ids = queue.filter((r) => r.productId).map((r) => r.productId);
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  }, [queue]);

  // Re-fetch summary whenever date or products change
  useEffect(() => {
    if (products.length > 0) loadSummary(products, date);
  }, [date, products]); // eslint-disable-line

  // Focus the product select of a newly added row
  useEffect(() => {
    if (lastAddedKey.current !== null) {
      rowRefs.current[lastAddedKey.current]?.focus();
      lastAddedKey.current = null;
    }
  }, [queue]);

  const loadSummary = async (productList: Product[], forDate: string) => {
    const [dashRes, countRows] = await Promise.all([
      fetch(`/api/dashboard?date=${forDate}`).then((r) => r.json()),
      fetch(`/api/counts?date=${forDate}`).then((r) => r.json()) as Promise<CountRow[]>,
    ]);

    const productMap: Record<number, Product> = {};
    for (const p of productList) productMap[p.id] = p;

    const totalMap: Record<number, number> = {};
    for (const { product, totalRemaining } of dashRes.stockLevels ?? []) {
      totalMap[product.id] = totalRemaining ?? 0;
    }
    const prepMap: Record<number, number> = {};
    for (const { batch, product } of dashRes.todayBatches ?? []) {
      prepMap[product.id] = (prepMap[product.id] ?? 0) + batch.quantityPrepped;
    }
    const soldMap: Record<number, number> = {};
    const saleIdMap: Record<number, number> = {};
    for (const { sale } of dashRes.todaySales ?? []) {
      soldMap[sale.productId] = (soldMap[sale.productId] ?? 0) + sale.quantitySold;
      saleIdMap[sale.productId] = sale.id;
    }
    const countedMap: Record<number, number> = {};
    for (const { count } of countRows ?? []) {
      countedMap[count.productId] = (countedMap[count.productId] ?? 0) + count.quantity;
    }

    const allIds = new Set([
      ...Object.keys(prepMap),
      ...Object.keys(soldMap),
      ...Object.keys(countedMap),
    ].map(Number));
    const rows: SummaryRow[] = [];
    for (const id of allIds) {
      if (!productMap[id]) continue;
      const prepped = prepMap[id] ?? 0;
      const total = totalMap[id] ?? 0;
      const sold = soldMap[id] ?? 0;
      const counted = countedMap[id] ?? 0;
      rows.push({
        product: productMap[id],
        total,
        prepped,
        sold,
        counted,
        variance: counted - total,
        saleId: saleIdMap[id],
      });
    }
    rows.sort((a, b) => a.product.name.localeCompare(b.product.name));
    setSummary(rows);
  };

  const updateRow = (key: number, field: keyof QueueItem, value: string) => {
    setQueue((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    const key = nextKey();
    lastAddedKey.current = key;
    setQueue((prev) => [...prev, { key, productId: "", qty: "" }]);
  };

  const removeRow = (key: number) => {
    setQueue((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length === 0 ? [{ key: nextKey(), productId: "", qty: "" }] : next;
    });
  };

  const moveQueueRow = (key: number, direction: -1 | 1) => {
    setQueue((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addRow(); }
  };

  const submitAll = async () => {
    const valid = queue.filter((r) => r.productId && r.qty);
    if (valid.length === 0) return;
    setSubmitting(true);
    await Promise.all(
      valid.map((row) =>
        fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: Number(row.productId),
            saleDate: date,
            quantitySold: Number(row.qty),
            source: "manual",
          }),
        })
      )
    );
    setQueue((prev) => prev.map((r) => ({ ...r, qty: "" })));
    setSubmitting(false);
    await loadSummary(products, date);
  };

  const startEdit = (id: number, currentQty: number) => {
    setEditingId(id);
    setEditingQty(String(currentQty));
    setConfirmDeleteId(null);
  };

  const saveSaleEdit = async (id: number, qty: string) => {
    setEditingId(null);
    const qtyNum = parseFloat(qty);
    if (isNaN(qtyNum) || qtyNum < 0) return;
    await fetch("/api/sales", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, quantitySold: qtyNum }),
    });
    await loadSummary(products, date);
  };

  const deleteSale = async (id: number) => {
    setConfirmDeleteId(null);
    await fetch(`/api/sales?id=${id}`, { method: "DELETE" });
    await loadSummary(products, date);
  };

  const saveOverflowAsPrep = async (row: SummaryRow) => {
    setSavingPrepIds((prev) => new Set(prev).add(row.product.id));
    await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: row.product.id,
        datePrepped: date,
        quantityPrepped: row.variance,
        shelfLifeDays: row.product.defaultShelfLifeDays ?? 1,
      }),
    });
    setSavingPrepIds((prev) => { const s = new Set(prev); s.delete(row.product.id); return s; });
    await loadSummary(products, date);
  };

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] ?? []).push(p);
    return acc;
  }, {});

  const readyCount = queue.filter((r) => r.productId && r.qty).length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-zinc-900">End of Day</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white shadow-sm"
        />
      </div>

      {/* Sales input queue */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Sales Entry</p>

        <div className="grid grid-cols-[20px_1fr_100px_28px] gap-2 px-0.5">
          <span />
          <span className="text-xs text-zinc-400">Product</span>
          <span className="text-xs text-zinc-400">Qty sold</span>
          <span />
        </div>

        <div className="space-y-2">
          {queue.map((row, idx) => (
            <div key={row.key} className="grid grid-cols-[20px_1fr_100px_28px] gap-2 items-center">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => moveQueueRow(row.key, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="h-[18px] flex items-center justify-center text-zinc-300 hover:text-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs"
                >↑</button>
                <button
                  type="button"
                  onClick={() => moveQueueRow(row.key, 1)}
                  disabled={idx === queue.length - 1}
                  aria-label="Move down"
                  className="h-[18px] flex items-center justify-center text-zinc-300 hover:text-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs"
                >↓</button>
              </div>

              <select
                ref={(el) => { rowRefs.current[row.key] = el; }}
                value={row.productId}
                onChange={(e) => updateRow(row.key, "productId", e.target.value)}
                onKeyDown={handleEnter}
                className="border rounded px-3 py-2.5 text-sm bg-white w-full min-w-0"
              >
                <option value="">Product...</option>
                {Object.entries(grouped).map(([cat, prods]) => (
                  <optgroup key={cat} label={cat}>
                    {prods.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <Input
                type="number"
                min={0}
                step={0.1}
                value={row.qty}
                onChange={(e) => updateRow(row.key, "qty", e.target.value)}
                onKeyDown={handleEnter}
                placeholder="0"
                className="py-2.5"
              />

              <button
                type="button"
                onClick={() => removeRow(row.key)}
                className="text-zinc-300 hover:text-red-400 text-xl leading-none flex items-center justify-center h-9 w-7"
                aria-label="Remove row"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={addRow} type="button">+ Add Row</Button>
          <Button size="sm" onClick={submitAll} disabled={submitting || readyCount === 0}>
            {submitting ? "Submitting..." : readyCount > 0 ? `Submit ${readyCount} Sale${readyCount > 1 ? "s" : ""}` : "Submit"}
          </Button>
        </div>
      </div>

      {/* EOD Summary */}
      {summary !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Day Summary — {date}
            </p>
            {summary.length > 0 && (
              <button
                onClick={() => { setEditingSummary((v) => !v); setConfirmDeleteId(null); }}
                className="text-xs text-zinc-400 hover:text-zinc-700 font-medium"
              >
                {editingSummary ? "Done" : "Edit"}
              </button>
            )}
          </div>
          {summary.length === 0 ? (
            <p className="text-sm text-zinc-400">No prep, sales, or counts recorded for this date yet.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* Header */}
                <div className="grid grid-cols-[1fr_40px_36px_36px_40px_52px] sm:grid-cols-[1fr_52px_48px_52px_52px_68px] gap-1 sm:gap-2 px-2 sm:px-4 py-2 border-b bg-zinc-50">
                  <span className="text-xs font-medium text-zinc-500">Product</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Total</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Prep</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Sold</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Count</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Variance</span>
                </div>
                {summary.map((row, idx) => (
                  <div key={row.product.id} className={idx < summary.length - 1 ? "border-b" : ""}>
                    {/* Name row */}
                    <div className="flex items-start justify-between gap-2 px-2 sm:px-4 pt-3 pb-0.5">
                      <span className="font-medium text-zinc-900 text-sm max-w-[75%] sm:max-w-[65%]">
                        {row.product.name}
                      </span>
                      {editingSummary && row.saleId && (
                        <button
                          onClick={() => setConfirmDeleteId(row.saleId!)}
                          className="text-zinc-300 hover:text-red-400 text-xl leading-none flex-shrink-0 mt-0.5"
                          aria-label="Delete sale"
                        >×</button>
                      )}
                    </div>
                    {/* Numbers row — same grid as header */}
                    <div className="grid grid-cols-[1fr_40px_36px_36px_40px_52px] sm:grid-cols-[1fr_52px_48px_52px_52px_68px] gap-1 sm:gap-2 px-2 sm:px-4 pb-3 items-center text-sm">
                      <span className="text-xs text-zinc-400">{row.product.unit}</span>
                      <span className="text-right text-zinc-600">{row.total}</span>
                      <span className="text-right text-zinc-600">{row.prepped}</span>
                      <div className="text-right">
                        {editingId === row.saleId && row.saleId ? (
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={editingQty}
                            autoFocus
                            onChange={(e) => setEditingQty(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveSaleEdit(row.saleId!, editingQty);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onBlur={() => saveSaleEdit(row.saleId!, editingQty)}
                            className="w-full text-right border rounded px-1 py-0.5 text-sm"
                          />
                        ) : (
                          <button
                            onClick={() => row.saleId && startEdit(row.saleId, row.sold)}
                            className={`w-full text-right text-zinc-600 ${row.saleId ? "hover:text-blue-600 cursor-pointer" : ""}`}
                          >
                            {row.sold}
                          </button>
                        )}
                      </div>
                      <span className="text-right text-zinc-600">{row.counted}</span>
                      <span className={`text-right font-medium ${
                        row.variance < 0 ? "text-red-600" : row.variance === 0 ? "text-green-600" : "text-blue-600"
                      }`}>
                        {row.variance > 0 ? `+${row.variance}` : row.variance}
                      </span>
                    </div>
                    {confirmDeleteId === row.saleId && row.saleId && (
                      <div className="flex items-center justify-between gap-3 px-2 sm:px-4 py-2 bg-red-50 border-t border-red-100 text-sm">
                        <span className="text-zinc-500">Delete this sale entry?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteSale(row.saleId!)}
                            className="px-3 py-1 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                          >Delete</button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1 rounded bg-zinc-100 text-zinc-600 text-xs font-medium hover:bg-zinc-200"
                          >Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {/* Surplus card — shown when any row has variance > 0 */}
          {summary !== null && summary.some((r) => r.variance > 0) && (
            <Card className="border-amber-200">
              <CardContent className="p-0">
                <div className="px-3 py-2 border-b bg-amber-50">
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                    Unaccounted Surplus
                  </p>
                </div>
                {summary.filter((r) => r.variance > 0).map((row) => (
                  <div key={row.product.id} className="flex items-center justify-between gap-3 px-3 py-2.5 border-b last:border-b-0">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{row.product.name}</p>
                      <p className="text-xs text-zinc-400">
                        +{row.variance} {row.product.unit} over system total
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs shrink-0"
                      disabled={savingPrepIds.has(row.product.id)}
                      onClick={() => saveOverflowAsPrep(row)}
                    >
                      {savingPrepIds.has(row.product.id) ? "Saving…" : "Save as prep"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
