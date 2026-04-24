import { db } from "@/db";
import { prepBatches, products, salesRecords } from "@/db/schema";
import { addDays, todayLocal } from "@/lib/dates";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? todayLocal();

  // Mark expired batches first
  await db
    .update(prepBatches)
    .set({ status: "expired" })
    .where(and(eq(prepBatches.status, "active"), lte(prepBatches.expiryDate, date)));

  const tomorrow = addDays(date, 1);
  const in3Days = addDays(date, 3);

  const [todayBatches, expiringBatches, todaySales, allProducts] = await Promise.all([
    db
      .select({ batch: prepBatches, product: products })
      .from(prepBatches)
      .innerJoin(products, eq(prepBatches.productId, products.id))
      .where(eq(prepBatches.datePrepped, date))
      .orderBy(products.category, products.name),

    db
      .select({ batch: prepBatches, product: products })
      .from(prepBatches)
      .innerJoin(products, eq(prepBatches.productId, products.id))
      .where(
        and(
          eq(prepBatches.status, "active"),
          gte(prepBatches.expiryDate, tomorrow),
          lte(prepBatches.expiryDate, in3Days)
        )
      )
      .orderBy(prepBatches.expiryDate),

    db
      .select({ sale: salesRecords, product: products })
      .from(salesRecords)
      .innerJoin(products, eq(salesRecords.productId, products.id))
      .where(eq(salesRecords.saleDate, date)),

    db
      .select({
        product: products,
        totalRemaining: sql<number>`sum(${prepBatches.quantityRemaining})`.as("total_remaining"),
        batchCount: sql<number>`count(${prepBatches.id})`.as("batch_count"),
      })
      .from(products)
      .leftJoin(
        prepBatches,
        and(eq(prepBatches.productId, products.id), eq(prepBatches.status, "active"))
      )
      .groupBy(products.id)
      .orderBy(products.category, products.name),
  ]);

  const prepMap = new Map<number, number>();
  for (const { batch } of todayBatches) {
    prepMap.set(batch.productId, (prepMap.get(batch.productId) ?? 0) + batch.quantityPrepped);
  }
  const salesMap = new Map<number, number>();
  for (const { sale } of todaySales) {
    salesMap.set(sale.productId, (salesMap.get(sale.productId) ?? 0) + sale.quantitySold);
  }

  return NextResponse.json({
    date,
    todayBatches,
    expiringBatches,
    todaySales,
    stockLevels: allProducts,
    eodComparison: Array.from(new Set([...prepMap.keys(), ...salesMap.keys()])).map((pid) => ({
      productId: pid,
      prepped: prepMap.get(pid) ?? 0,
      sold: salesMap.get(pid) ?? 0,
      delta: (prepMap.get(pid) ?? 0) - (salesMap.get(pid) ?? 0),
    })),
  });
}
