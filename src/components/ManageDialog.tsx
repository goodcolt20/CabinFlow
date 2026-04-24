"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";

interface Product {
  id: number;
  name: string;
  unit: string;
  category: string;
  defaultShelfLifeDays: number | null;
}

interface Option {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onEditProduct: (p: Product) => void;
  /** Called after any change (product/category/unit created or deleted). */
  onChanged: () => void;
}

export default function ManageDialog({
  open,
  onOpenChange,
  products,
  onEditProduct,
  onChanged,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="products" className="mt-2">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="pt-3">
            <ProductsTab
              products={products}
              onEdit={onEditProduct}
              onChanged={onChanged}
            />
          </TabsContent>

          <TabsContent value="categories" className="pt-3">
            <OptionsTab endpoint="categories" label="category" onChanged={onChanged} />
          </TabsContent>

          <TabsContent value="units" className="pt-3">
            <OptionsTab endpoint="units" label="unit" onChanged={onChanged} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProductsTab({
  products,
  onEdit,
  onChanged,
}: {
  products: Product[];
  onEdit: (p: Product) => void;
  onChanged: () => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async (id: number) => {
    setDeleting(true);
    await fetch(`/api/products?id=${id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmId(null);
    onChanged();
  };

  if (products.length === 0) {
    return (
      <p className="py-6 text-sm text-zinc-400 text-center">No products yet.</p>
    );
  }

  return (
    <div className="divide-y max-h-[55vh] overflow-y-auto">
      {products.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p>
            <p className="text-xs text-zinc-400">
              {p.category} · {p.unit}
              {p.defaultShelfLifeDays != null && ` · ${p.defaultShelfLifeDays}d shelf`}
            </p>
          </div>
          {confirmId === p.id ? (
            <div className="flex gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => remove(p.id)}
                disabled={deleting}
              >
                {deleting ? "..." : "Confirm"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-1.5 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:border-red-300"
                onClick={() => setConfirmId(p.id)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function OptionsTab({
  endpoint,
  label,
  onChanged,
}: {
  endpoint: "categories" | "units";
  label: string;
  onChanged: () => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/${endpoint}`).then((r) => r.json()).then(setOptions);

  useEffect(() => { load(); }, [endpoint]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newValue.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setAdding(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Failed to add" }));
      setError(body.error ?? "Failed to add");
      return;
    }
    setNewValue("");
    await load();
    onChanged();
  };

  const remove = async (id: number) => {
    await fetch(`/api/${endpoint}?id=${id}`, { method: "DELETE" });
    await load();
    onChanged();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={`Add ${label}…`}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={adding || !newValue.trim()}>
          {adding ? "..." : "Add"}
        </Button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {options.length === 0 ? (
        <p className="py-6 text-sm text-zinc-400 text-center">
          No {label} options yet.
        </p>
      ) : (
        <div className="divide-y max-h-[45vh] overflow-y-auto">
          {options.map((opt) => (
            <div
              key={opt.id}
              className="flex items-center justify-between py-2.5"
            >
              <span className="text-sm text-zinc-900">{opt.name}</span>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:border-red-300"
                onClick={() => remove(opt.id)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-400">
        Deleting a {label} only removes it from the dropdown — existing products keep their current {label} value.
      </p>
    </div>
  );
}
