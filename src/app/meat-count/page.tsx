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


const PRODUCT_ORDER_KEY = "cabinflow_meatcount_order";

export default function MeatCountPage() {
  const [date, setDate] = useState(todayLocal);
  const [products, setProducts] = useState<Product[]>([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [productOrder, setProductOrder] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(PRODUCT_ORDER_KEY) ?? "[]") as number[]; }
    catch { return []; }
  });
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
    const [prods, locations, countRows] = await Promise.all([
      fetch("/api/products").then((r) => r.json()) as Promise<Product[]>,
      fetch("/api/locations").then((r) => r.json()) as Promise<Location[]>,
      fetch(`/api/counts?date=${forDate}`).then((r) => r.json()) as Promise<CountRow[]>,
    ]);

    setProducts(prods);
    setLocs(locations);

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

  const sortedProducts = (() => {
    if (productOrder.length === 0) {
      return [...products].sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
    }
    const orderMap = new Map(productOrder.map((id, idx) => [id, idx]));
    return [...products].sort((a, b) => {
      const aIdx = orderMap.get(a.id) ?? Infinity;
      const bIdx = orderMap.get(b.id) ?? Infinity;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.name.localeCompare(b.name);
    });
  })();

  const moveProduct = (id: number, direction: -1 | 1) => {
    const ids = sortedProducts.map((p) => p.id);
    const idx = ids.indexOf(id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    setProductOrder(ids);
    localStorage.setItem(PRODUCT_ORDER_KEY, JSON.stringify(ids));
  };

  const resolveExpr = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed || !/[+\-]/.test(trimmed)) return trimmed;
    if (!/^[\d\s.+\-]+$/.test(trimmed)) return trimmed;
    const matches = trimmed.match(/[+\-]?\s*\d+(\.\d+)?/g);
    if (!matches) return trimmed;
    const sum = matches.reduce((acc, m) => acc + parseFloat(m.replace(/\s/g, "")), 0);
    return String(Math.round(sum * 10000) / 10000);
  };

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
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={inputs[loc.id]?.[product.id] ?? ""}
                          onChange={(e) => setCell(loc.id, product.id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const resolved = resolveExpr(e.target.value);
                            if (resolved !== e.target.value) setCell(loc.id, product.id, resolved);
                          }}
                          placeholder="0"
                          className="w-20 text-right py-2"
                        />
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            const cur = (inputs[loc.id]?.[product.id] ?? "").trim();
                            if (cur.endsWith("+") || cur.endsWith("-")) return;
                            setCell(loc.id, product.id, (cur || "0") + "+");
                          }}
                          className="h-9 w-9 flex items-center justify-center rounded border border-zinc-300 bg-white text-zinc-700 text-base font-semibold active:bg-zinc-100 select-none"
                          aria-label="Add to total"
                        >
                          +
                        </button>
                        <span className="text-xs text-zinc-400 w-10 truncate">{product.unit}</span>
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

          {/* Product Order */}
          {sortedProducts.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Product Order</p>
              <Card>
                <CardContent className="p-0">
                  {sortedProducts.map((product, idx) => (
                    <div
                      key={product.id}
                      className={`flex items-center gap-2 px-4 py-2.5 ${idx < sortedProducts.length - 1 ? "border-b" : ""}`}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveProduct(product.id, -1)}
                          disabled={idx === 0}
                          aria-label="Move up"
                          className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        >↑</button>
                        <button
                          type="button"
                          onClick={() => moveProduct(product.id, 1)}
                          disabled={idx === sortedProducts.length - 1}
                          aria-label="Move down"
                          className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        >↓</button>
                      </div>
                      <span className="flex-1 text-sm font-medium text-zinc-900">{product.name}</span>
                      <span className="text-xs text-zinc-400">{product.unit}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

        </>
      )}
    </div>
  );
}
