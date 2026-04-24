"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayLocal } from "@/lib/dates";
import { useEffect, useState } from "react";

interface Product {
  id: number;
  name: string;
  unit: string;
  category: string;
}

interface Location {
  id: number;
  name: string;
}

interface CountRow {
  count: { id: number; productId: number; locationId: number; quantity: number; countDate: string };
  product: Product;
  location: Location;
}

interface StockLevel {
  product: { id: number };
  totalRemaining: number | null;
}

interface SummaryRow {
  product: Product;
  counted: number;
  system: number;
  variance: number;
}

export default function MeatCountPage() {
  const [date, setDate] = useState(todayLocal);
  const [products, setProducts] = useState<Product[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});

  // Nested map: inputs[locationId][productId] = quantity string
  const [inputs, setInputs] = useState<Record<number, Record<number, string>>>({});

  // Tracks whether a given cell has been modified since the last save
  const [dirty, setDirty] = useState<Record<number, Record<number, boolean>>>({});

  const [saving, setSaving] = useState(false);

  // Dialog state for adding a location
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [addingLoc, setAddingLoc] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadAll = async (forDate: string) => {
    const [prods, locations, countRows, dash] = await Promise.all([
      fetch("/api/products").then((r) => r.json()) as Promise<Product[]>,
      fetch("/api/locations").then((r) => r.json()) as Promise<Location[]>,
      fetch(`/api/counts?date=${forDate}`).then((r) => r.json()) as Promise<CountRow[]>,
      fetch(`/api/dashboard?date=${forDate}`).then((r) => r.json()),
    ]);

    setProducts(prods);
    setLocs(locations);

    // Stock levels
    const stock: Record<number, number> = {};
    for (const { product, totalRemaining } of (dash.stockLevels ?? []) as StockLevel[]) {
      stock[product.id] = totalRemaining ?? 0;
    }
    setStockMap(stock);

    // Pre-fill inputs from existing counts
    const next: Record<number, Record<number, string>> = {};
    for (const loc of locations) next[loc.id] = {};
    for (const { count } of countRows) {
      if (!next[count.locationId]) next[count.locationId] = {};
      next[count.locationId][count.productId] = String(count.quantity);
    }
    setInputs(next);
    setDirty({});
  };

  useEffect(() => { loadAll(date); }, [date]); // eslint-disable-line

  const setCell = (locId: number, prodId: number, value: string) => {
    setInputs((prev) => ({
      ...prev,
      [locId]: { ...(prev[locId] ?? {}), [prodId]: value },
    }));
    setDirty((prev) => ({
      ...prev,
      [locId]: { ...(prev[locId] ?? {}), [prodId]: true },
    }));
  };

  const saveAll = async () => {
    const payloads: Array<{ locationId: number; productId: number; quantity: number }> = [];
    for (const [locIdStr, row] of Object.entries(inputs)) {
      const locId = Number(locIdStr);
      for (const [prodIdStr, qty] of Object.entries(row)) {
        if (qty === "" || qty === null || qty === undefined) continue;
        if (!dirty[locId]?.[Number(prodIdStr)]) continue;
        const n = Number(resolveExpr(qty));
        if (Number.isNaN(n)) continue;
        payloads.push({ locationId: locId, productId: Number(prodIdStr), quantity: n });
      }
    }
    if (payloads.length === 0) return;

    setSaving(true);
    await Promise.all(
      payloads.map((p) =>
        fetch("/api/counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...p, countDate: date }),
        })
      )
    );
    setSaving(false);
    await loadAll(date);
  };

  const moveLoc = async (locId: number, direction: -1 | 1) => {
    const idx = locs.findIndex((l) => l.id === locId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= locs.length) return;

    // Optimistic swap locally
    const next = [...locs];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setLocs(next);

    await fetch("/api/locations/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((l) => l.id) }),
    });
  };

  const submitNewLoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newLocName.trim();
    if (!name) return;
    setAddingLoc(true);
    setAddError(null);
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setAddingLoc(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Failed to add location" }));
      setAddError(body.error ?? "Failed to add location");
      return;
    }
    setNewLocName("");
    setDialogOpen(false);
    await loadAll(date);
  };

  // Group products by category for consistent ordering within cards
  const sortedProducts = [...products].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  const resolveExpr = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed || !/[+]/.test(trimmed)) return trimmed;
    if (!/^[\d\s.+]+$/.test(trimmed)) return trimmed;
    const parts = trimmed.split("+").map((s) => parseFloat(s.trim()));
    if (parts.some(isNaN)) return trimmed;
    const sum = parts.reduce((a, b) => a + b, 0);
    return String(Math.round(sum * 10000) / 10000);
  };

  // Build summary: sum counted per product, compare against system stock
  const summary: SummaryRow[] = [];
  const countedByProduct: Record<number, number> = {};
  for (const locRow of Object.values(inputs)) {
    for (const [prodIdStr, qty] of Object.entries(locRow)) {
      if (qty === "" || qty === null || qty === undefined) continue;
      const n = Number(resolveExpr(qty));
      if (Number.isNaN(n)) continue;
      const pid = Number(prodIdStr);
      countedByProduct[pid] = (countedByProduct[pid] ?? 0) + n;
    }
  }
  for (const pid of Object.keys(countedByProduct).map(Number)) {
    const product = products.find((p) => p.id === pid);
    if (!product) continue;
    const counted = countedByProduct[pid];
    const system = stockMap[pid] ?? 0;
    summary.push({ product, counted, system, variance: counted - system });
  }
  summary.sort((a, b) => a.product.name.localeCompare(b.product.name));

  const hasDirty = Object.values(dirty).some((row) => Object.values(row).some(Boolean));

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">Meat Count</h1>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm bg-white shadow-sm"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            + Add Location
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Location</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitNewLoc} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="e.g. Walk-in"
                  required
                  autoFocus
                />
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <Button type="submit" disabled={addingLoc} className="w-full">
                {addingLoc ? "Adding..." : "Add Location"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty states */}
      {products.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">
          No products yet — add products in Prep first.
        </p>
      ) : locs.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-8">
          No locations yet — use <span className="font-medium">+ Add Location</span> to create one.
        </p>
      ) : (
        <>
          {/* Location cards */}
          <div className="space-y-3">
            {locs.map((loc, idx) => (
              <Card key={loc.id} className="overflow-hidden">
                <div className="px-4 py-2.5 bg-zinc-50 border-b flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-zinc-900 uppercase tracking-wide">
                    {loc.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveLoc(loc.id, -1)}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLoc(loc.id, 1)}
                      disabled={idx === locs.length - 1}
                      aria-label="Move down"
                      className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <CardContent className="p-0">
                  {sortedProducts.map((product, idx) => (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 ${idx < sortedProducts.length - 1 ? "border-b" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-zinc-900 truncate block">
                          {product.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={inputs[loc.id]?.[product.id] ?? ""}
                          onChange={(e) => setCell(loc.id, product.id, e.target.value)}
                          onBlur={(e) => {
                            const resolved = resolveExpr(e.target.value);
                            if (resolved !== e.target.value) setCell(loc.id, product.id, resolved);
                          }}
                          placeholder="0"
                          className="w-20 text-right py-2"
                        />
                        <span className="text-xs text-zinc-400 w-14">{product.unit}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Save All */}
          <div className="flex">
            <Button onClick={saveAll} disabled={saving || !hasDirty}>
              {saving ? "Saving..." : hasDirty ? "Save All" : "Saved"}
            </Button>
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Summary — {date}
            </p>
            {summary.length === 0 ? (
              <p className="text-sm text-zinc-400">No counts recorded for this date yet.</p>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="grid grid-cols-[1fr_64px_64px_64px] gap-2 px-4 py-2 border-b bg-zinc-50">
                    <span className="text-xs font-medium text-zinc-500">Product</span>
                    <span className="text-xs font-medium text-zinc-500 text-right">Counted</span>
                    <span className="text-xs font-medium text-zinc-500 text-right">System</span>
                    <span className="text-xs font-medium text-zinc-500 text-right">Variance</span>
                  </div>
                  {summary.map((row, idx) => (
                    <div
                      key={row.product.id}
                      className={`grid grid-cols-[1fr_64px_64px_64px] gap-2 px-4 py-3 items-center text-sm ${idx < summary.length - 1 ? "border-b" : ""}`}
                    >
                      <div>
                        <span className="font-medium text-zinc-900">{row.product.name}</span>
                        <span className="text-xs text-zinc-400 ml-1.5">{row.product.unit}</span>
                      </div>
                      <span className="text-right text-zinc-700">{row.counted}</span>
                      <span className="text-right text-zinc-500">{row.system}</span>
                      <span className={`text-right font-medium ${
                        row.variance < 0
                          ? "text-red-600"
                          : row.variance === 0
                          ? "text-green-600"
                          : "text-amber-600"
                      }`}>
                        {row.variance > 0 ? `+${row.variance}` : row.variance}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
