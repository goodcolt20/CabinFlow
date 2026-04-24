"use client";

import ManageDialog from "@/components/ManageDialog";
import ProductDialog, { ProductFormValues } from "@/components/ProductDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { daysUntil, todayLocal } from "@/lib/dates";
import { useEffect, useRef, useState } from "react";

interface Product {
  id: number;
  name: string;
  unit: string;
  category: string;
  defaultShelfLifeDays: number | null;
}

interface Batch {
  id: number;
  productId: number;
  datePrepped: string;
  quantityPrepped: number;
  quantityRemaining: number;
  shelfLifeDays: number;
  expiryDate: string;
  notes: string | null;
  status: string;
}

interface QueueItem {
  key: number;
  productId: string;
  qty: string;
  shelfLife: string;
  notes: string;
}

function ShelfBadge({ expiryDate, asOf }: { expiryDate: string; asOf: string }) {
  const days = daysUntil(expiryDate, asOf);
  if (days <= 0) return <Badge variant="destructive">Expired</Badge>;
  if (days === 1) return <Badge variant="destructive">1 day left</Badge>;
  if (days <= 3) return <Badge className="bg-amber-500 text-white hover:bg-amber-500">{days}d left</Badge>;
  return <Badge variant="secondary">{days}d left</Badge>;
}

let keyCounter = 0;
function nextKey() { return ++keyCounter; }

export default function PrepPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeBatches, setActiveBatches] = useState<{ batch: Batch; product: Product }[]>([]);
  const [date, setDate] = useState(todayLocal);

  const [queue, setQueue] = useState<QueueItem[]>([
    { key: nextKey(), productId: "", qty: "", shelfLife: "", notes: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Product dialog state (shared for create + edit)
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormValues | null>(null);

  // Manage-products dialog
  const [manageOpen, setManageOpen] = useState(false);

  // Tracks which batch is in "confirm delete?" state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  // Ref map for focusing newly added rows
  const rowRefs = useRef<Record<number, HTMLSelectElement | null>>({});
  const lastAddedKey = useRef<number | null>(null);

  const loadData = () => {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/batches?activeOnly=true").then((r) => r.json()),
    ]).then(([prods, batches]) => {
      setProducts(prods);
      setActiveBatches(batches);
    });
  };

  useEffect(loadData, [date]); // eslint-disable-line

  // Focus the product select of a newly added row
  useEffect(() => {
    if (lastAddedKey.current !== null) {
      rowRefs.current[lastAddedKey.current]?.focus();
      lastAddedKey.current = null;
    }
  }, [queue]);

  const updateRow = (key: number, field: keyof QueueItem, value: string) => {
    setQueue((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const updated = { ...row, [field]: value };
        if (field === "productId") {
          const prod = products.find((p) => String(p.id) === value);
          if (prod?.defaultShelfLifeDays)
            updated.shelfLife = String(prod.defaultShelfLifeDays);
        }
        return updated;
      })
    );
  };

  const addRow = () => {
    const key = nextKey();
    lastAddedKey.current = key;
    setQueue((prev) => [...prev, { key, productId: "", qty: "", shelfLife: "", notes: "" }]);
  };

  const removeRow = (key: number) => {
    setQueue((prev) => {
      if (prev.length === 1) {
        // Clear instead of remove when it's the only row
        return [{ key: nextKey(), productId: "", qty: "", shelfLife: "", notes: "" }];
      }
      return prev.filter((r) => r.key !== key);
    });
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRow();
    }
  };

  const submitAll = async () => {
    const valid = queue.filter((r) => r.productId && r.qty && r.shelfLife);
    if (valid.length === 0) return;
    setSubmitting(true);
    await Promise.all(
      valid.map((row) =>
        fetch("/api/batches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: Number(row.productId),
            datePrepped: date,
            quantityPrepped: Number(row.qty),
            shelfLifeDays: Number(row.shelfLife),
            notes: row.notes || null,
          }),
        })
      )
    );
    setQueue([{ key: nextKey(), productId: "", qty: "", shelfLife: "", notes: "" }]);
    setSubmitting(false);
    loadData();
  };

  const deleteBatch = async (id: number) => {
    setDeletingBatch(true);
    await fetch(`/api/batches?id=${id}`, { method: "DELETE" });
    setDeletingBatch(false);
    setConfirmDeleteId(null);
    loadData();
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct({
      id: p.id,
      name: p.name,
      unit: p.unit,
      category: p.category,
      defaultShelfLifeDays: p.defaultShelfLifeDays,
    });
    setProductDialogOpen(true);
    setManageOpen(false);
  };

  const byProduct: Record<number, { product: Product; batches: Batch[] }> = {};
  for (const { batch, product } of activeBatches) {
    if (!byProduct[product.id]) byProduct[product.id] = { product, batches: [] };
    byProduct[product.id].batches.push(batch);
  }

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] ?? []).push(p);
    return acc;
  }, {});

  const readyCount = queue.filter((r) => r.productId && r.qty && r.shelfLife).length;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">Prep</h1>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-white shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openAddProduct}>
            + New
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            Manage
          </Button>
        </div>
      </div>

      {/* Product dialog (add + edit) */}
      <ProductDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        product={editingProduct}
        onSaved={loadData}
      />

      {/* Manage dialog — products / categories / units */}
      <ManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        products={products}
        onEditProduct={openEditProduct}
        onChanged={loadData}
      />

      {/* Total Stock */}
      {Object.keys(byProduct).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Total Stock</p>
          <Card>
            <CardContent className="p-0">
              {Object.values(byProduct)
                .sort((a, b) => a.product.name.localeCompare(b.product.name))
                .map(({ product, batches }, idx, arr) => {
                  const total = batches.reduce((s, b) => s + b.quantityRemaining, 0);
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm ${idx < arr.length - 1 ? "border-b" : ""}`}
                    >
                      <span className="font-medium text-zinc-900">{product.name}</span>
                      <span className="text-zinc-700">
                        {total} <span className="text-zinc-400 text-xs">{product.unit}</span>
                      </span>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Batch input queue */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Log Batches</p>

        {/* Column labels */}
        <div className="grid grid-cols-[1fr_72px_72px_28px] gap-2 px-0.5">
          <span className="text-xs text-zinc-400">Product</span>
          <span className="text-xs text-zinc-400">Qty</span>
          <span className="text-xs text-zinc-400">Days</span>
          <span />
        </div>

        <div className="space-y-2">
          {queue.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_72px_72px_28px] gap-2 items-center">
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
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={row.qty}
                onChange={(e) => updateRow(row.key, "qty", e.target.value)}
                onKeyDown={handleEnter}
                placeholder="Qty"
                className="py-2.5"
              />

              <Input
                type="number"
                min={1}
                value={row.shelfLife}
                onChange={(e) => updateRow(row.key, "shelfLife", e.target.value)}
                onKeyDown={handleEnter}
                placeholder="Days"
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
          <Button variant="outline" size="sm" onClick={addRow} type="button">
            + Add Row
          </Button>
          <Button size="sm" onClick={submitAll} disabled={submitting || readyCount === 0}>
            {submitting ? "Submitting..." : readyCount > 0 ? `Submit ${readyCount} Batch${readyCount > 1 ? "es" : ""}` : "Submit"}
          </Button>
        </div>
      </div>

      {/* Product cards */}
      {Object.keys(byProduct).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Active Stock</p>
          <div className="space-y-3">
            {Object.values(byProduct)
              .sort((a, b) => a.product.name.localeCompare(b.product.name))
              .map(({ product, batches }) => {
                const total = batches.reduce((s, b) => s + b.quantityRemaining, 0);
                const sorted = [...batches].sort(
                  (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
                );
                return (
                  <Card key={product.id} className="overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-b">
                      <span className="font-semibold text-sm text-zinc-900">{product.name}</span>
                      <span className="text-sm text-zinc-500">
                        {total} <span className="text-zinc-400">{product.unit}</span>
                      </span>
                    </div>
                    <CardContent className="p-0">
                      {sorted.map((batch, idx) => {
                        const isConfirming = confirmDeleteId === batch.id;
                        return (
                          <div
                            key={batch.id}
                            className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${idx < sorted.length - 1 ? "border-b" : ""}`}
                          >
                            <div className="text-zinc-500 min-w-0 flex-1 truncate">
                              Prepped {batch.datePrepped}
                              {batch.notes && <span className="text-zinc-400 ml-1.5">· {batch.notes}</span>}
                            </div>
                            {isConfirming ? (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-xs text-zinc-500 mr-1">Delete?</span>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteBatch(batch.id)}
                                  disabled={deletingBatch}
                                  className="h-7 px-2 text-xs"
                                >
                                  {deletingBatch ? "..." : "Yes"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="h-7 px-2 text-xs"
                                >
                                  No
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-zinc-700">
                                  {batch.quantityRemaining}
                                  <span className="text-zinc-400 text-xs ml-1">{product.unit}</span>
                                </span>
                                <ShelfBadge expiryDate={batch.expiryDate} asOf={date} />
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(batch.id)}
                                  aria-label="Delete batch"
                                  className="text-zinc-300 hover:text-red-500 text-lg leading-none h-7 w-7 flex items-center justify-center"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {products.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-8">
          No products yet — add one with the button above.
        </p>
      )}
    </div>
  );
}
