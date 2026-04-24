"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

export interface ProductFormValues {
  id?: number;
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
  /** If provided, dialog opens in edit mode. */
  product?: ProductFormValues | null;
  /** Called after a successful save — parent should reload data. */
  onSaved: () => void;
}

const ADD_NEW_SENTINEL = "__add_new__";

/**
 * OptionSelect — a <select> backed by /api/{endpoint}.
 * Last option is "+ Add new…" which swaps the control into an inline text input.
 */
function OptionSelect({
  value,
  onChange,
  endpoint,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  endpoint: "categories" | "units";
  label: string;
  placeholder: string;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => fetch(`/api/${endpoint}`).then((r) => r.json()).then(setOptions);
  useEffect(() => { load(); }, [endpoint]);

  // If the current value isn't in the list (legacy data), surface it as a leading option
  const hasCurrent = !value || options.some((o) => o.name === value);
  const allOptions = hasCurrent ? options : [{ id: -1, name: value }, ...options];

  const handleSelect = (v: string) => {
    if (v === ADD_NEW_SENTINEL) {
      setAdding(true);
      setNewValue("");
      setError(null);
    } else {
      onChange(v);
    }
  };

  const submitNew = async () => {
    const name = newValue.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Failed to add" }));
      setError(body.error ?? "Failed to add");
      return;
    }
    onChange(name);
    await load();
    setAdding(false);
    setNewValue("");
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewValue("");
    setError(null);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {adding ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitNew(); }
                if (e.key === "Escape") cancelAdd();
              }}
              placeholder={`New ${label.toLowerCase()}`}
              autoFocus
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={submitNew} disabled={saving}>
              {saving ? "..." : "Add"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelAdd}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm bg-white"
        >
          <option value="">{placeholder}</option>
          {allOptions.map((opt) => (
            <option key={opt.name} value={opt.name}>
              {opt.name}
            </option>
          ))}
          <option value={ADD_NEW_SENTINEL}>+ Add new {label.toLowerCase()}…</option>
        </select>
      )}
    </div>
  );
}

export default function ProductDialog({ open, onOpenChange, product, onSaved }: Props) {
  const isEdit = !!product?.id;

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [shelfLife, setShelfLife] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when the dialog opens or target product changes
  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name ?? "");
      setUnit(product.unit ?? "");
      setCategory(product.category ?? "");
      setShelfLife(product.defaultShelfLifeDays != null ? String(product.defaultShelfLifeDays) : "");
    } else {
      setName("");
      setUnit("");
      setCategory("");
      setShelfLife("");
    }
    setError(null);
  }, [open, product]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      unit: unit || "portions",
      category: category || "uncategorized",
      defaultShelfLifeDays: shelfLife ? Number(shelfLife) : null,
    };

    const res = await fetch("/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { ...payload, id: product!.id } : payload),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Failed to save" }));
      setError(body.error ?? "Failed to save");
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lamb Chops"
              required
              autoFocus={!isEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <OptionSelect
              value={unit}
              onChange={setUnit}
              endpoint="units"
              label="Unit"
              placeholder="Select unit..."
            />
            <OptionSelect
              value={category}
              onChange={setCategory}
              endpoint="categories"
              label="Category"
              placeholder="Select category..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default Shelf Life (days)</Label>
            <Input
              type="number"
              min={1}
              value={shelfLife}
              onChange={(e) => setShelfLife(e.target.value)}
              placeholder="Pre-fills on every prep entry"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
