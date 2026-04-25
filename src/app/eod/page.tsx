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
}

interface QueueItem {
  key: number;
  productId: string;
  qty: string;
}

interface SummaryRow {
  product: Product;
  prepped: number;
  sold: number;
  diff: number;
  saleId?: number;
}

let keyCounter = 0;
function nextKey() { return ++keyCounter; }

export default function EodPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [date, setDate] = usePersistentDate();
  const [queue, setQueue] = useState<QueueItem[]>([
    { key: nextKey(), productId: "", qty: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<SummaryRow[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const rowRefs = useRef<Record<number, HTMLSelectElement | null>>({});
  const lastAddedKey = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
  }, []);

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
    const dashRes = await fetch(`/api/dashboard?date=${forDate}`).then((r) => r.json());

    const productMap: Record<number, Product> = {};
    for (const p of productList) productMap[p.id] = p;

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

    const allIds = new Set([...Object.keys(prepMap), ...Object.keys(soldMap)].map(Number));
    const rows: SummaryRow[] = [];
    for (const id of allIds) {
      if (!productMap[id]) continue;
      const prepped = prepMap[id] ?? 0;
      const sold = soldMap[id] ?? 0;
      rows.push({
        product: productMap[id],
        prepped,
        sold,
        diff: prepped - sold,
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
    setQueue((prev) =>
      prev.length === 1
        ? [{ key: nextKey(), productId: "", qty: "" }]
        : prev.filter((r) => r.key !== key)
    );
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
    setQueue([{ key: nextKey(), productId: "", qty: "" }]);
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

        <div className="grid grid-cols-[1fr_100px_28px] gap-2 px-0.5">
          <span className="text-xs text-zinc-400">Product</span>
          <span className="text-xs text-zinc-400">Qty sold</span>
          <span />
        </div>

        <div className="space-y-2">
          {queue.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_100px_28px] gap-2 items-center">
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
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
            Day Summary — {date}
          </p>
          {summary.length === 0 ? (
            <p className="text-sm text-zinc-400">No prep or sales recorded for this date yet.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="grid grid-cols-[1fr_64px_80px_64px_auto] gap-2 px-4 py-2 border-b bg-zinc-50">
                  <span className="text-xs font-medium text-zinc-500">Product</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Prepped</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Sold</span>
                  <span className="text-xs font-medium text-zinc-500 text-right">Diff</span>
                  <span />
                </div>
                {summary.map((row, idx) => (
                  <div key={row.product.id} className={idx < summary.length - 1 ? "border-b" : ""}>
                    <div className="grid grid-cols-[1fr_64px_80px_64px_auto] gap-2 px-4 py-3 items-center text-sm">
                      <div>
                        <span className="font-medium text-zinc-900">{row.product.name}</span>
                        <span className="text-xs text-zinc-400 ml-1.5">{row.product.unit}</span>
                      </div>
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
                      <span className={`text-right font-medium ${
                        row.diff < 0 ? "text-red-600" : row.diff === 0 ? "text-green-600" : "text-zinc-700"
                      }`}>
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </span>
                      <div className="flex items-center justify-end">
                        {row.saleId && (
                          <button
                            onClick={() => setConfirmDeleteId(row.saleId!)}
                            className="text-zinc-300 hover:text-red-400 text-xl leading-none"
                            aria-label="Delete sale"
                          >×</button>
                        )}
                      </div>
                    </div>
                    {confirmDeleteId === row.saleId && row.saleId && (
                      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50 border-t border-red-100 text-sm">
                        <span className="text-zinc-500">Delete this sale entry?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteSale(row.saleId!)}
                            className="px-3 py-1 rounded bg-red-500 text-white text-xs font-medium hover:bg-red-600"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1 rounded bg-zinc-100 text-zinc-600 text-xs font-medium hover:bg-zinc-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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
