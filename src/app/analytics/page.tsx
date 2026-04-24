"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addDays, daysUntil, todayLocal } from "@/lib/dates";
import { useEffect, useState } from "react";

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface ExpiringBatch {
  batch: {
    id: number;
    quantityRemaining: number;
    expiryDate: string;
    datePrepped: string;
  };
  product: Product;
}

interface SummaryRow {
  name: string;
  unit: string;
  prepped: number;
  sold: number;
  wasted: number;
  sellThrough: number;
}

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate);
  if (days <= 0) return <Badge variant="destructive">Expired</Badge>;
  if (days === 1) return <Badge variant="destructive">Expires tomorrow</Badge>;
  if (days <= 3) return <Badge className="bg-amber-500 text-white hover:bg-amber-500">{days}d left</Badge>;
  return <Badge variant="secondary">{days}d left</Badge>;
}

function SellThroughBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right ${
        pct >= 90 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600"
      }`}>
        {pct}%
      </span>
    </div>
  );
}

export default function AnalyticsPage() {
  const today = todayLocal();
  const [from, setFrom] = useState(() => addDays(today, -7));
  const [to, setTo] = useState(today);
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);

    const [batchRes, analyticsRes] = await Promise.all([
      fetch("/api/batches?activeOnly=true").then((r) => r.json()),
      fetch(`/api/analytics?from=${from}&to=${to}`).then((r) => r.json()),
    ]);

    // Expiring soon — always relative to today's actual date
    const expiring = (batchRes as ExpiringBatch[]).filter(({ batch }) => daysUntil(batch.expiryDate) <= 3);
    expiring.sort((a, b) => new Date(a.batch.expiryDate).getTime() - new Date(b.batch.expiryDate).getTime());
    setExpiringBatches(expiring);

    // Build sell-through summary
    const map: Record<number, { name: string; unit: string; prepped: number; sold: number; wasted: number }> = {};
    for (const row of analyticsRes.prepTotals ?? []) {
      if (!map[row.productId]) map[row.productId] = { name: row.productName, unit: row.unit, prepped: 0, sold: 0, wasted: 0 };
      map[row.productId].prepped += row.totalPrepped;
    }
    for (const row of analyticsRes.salesTotals ?? []) {
      if (!map[row.productId]) map[row.productId] = { name: row.productName, unit: row.unit, prepped: 0, sold: 0, wasted: 0 };
      map[row.productId].sold += row.totalSold;
    }
    for (const row of analyticsRes.wasteTotals ?? []) {
      if (!map[row.productId]) map[row.productId] = { name: row.productName, unit: row.unit, prepped: 0, sold: 0, wasted: 0 };
      map[row.productId].wasted += row.totalWasted;
    }

    setSummary(
      Object.values(map)
        .map((r) => ({ ...r, sellThrough: r.prepped > 0 ? Math.round((r.sold / r.prepped) * 100) : 0 }))
        .sort((a, b) => b.prepped - a.prepped)
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-xl font-bold text-zinc-900">Analysis</h1>

      {/* Expiring soon — always current */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Expiring Soon</p>
        {expiringBatches.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing expiring in the next 3 days.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              {expiringBatches.map(({ batch, product }, idx) => (
                <div
                  key={batch.id}
                  className={`flex items-center justify-between px-4 py-3 text-sm ${idx < expiringBatches.length - 1 ? "border-b" : ""}`}
                >
                  <div>
                    <p className="font-medium text-zinc-900">{product.name}</p>
                    <p className="text-xs text-zinc-400">
                      Prepped {batch.datePrepped} · {batch.quantityRemaining} {product.unit} remaining
                    </p>
                  </div>
                  <ExpiryBadge expiryDate={batch.expiryDate} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sell-through */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Sell-Through</p>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm bg-white block"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm bg-white block"
            />
          </div>
          <Button size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </Button>
        </div>

        {summary.length === 0 ? (
          <p className="text-sm text-zinc-400">No data for this range yet.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              {summary.map((row, idx) => (
                <div key={row.name} className={`px-4 py-3 ${idx < summary.length - 1 ? "border-b" : ""}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-zinc-900">{row.name}</span>
                    <span className="text-xs text-zinc-400">
                      {row.sold.toFixed(1)} / {row.prepped.toFixed(1)} {row.unit}
                      {row.wasted > 0 && <span className="text-red-500 ml-1.5">· {row.wasted.toFixed(1)} wasted</span>}
                    </span>
                  </div>
                  <SellThroughBar pct={row.sellThrough} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
