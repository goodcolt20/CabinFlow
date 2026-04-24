import { db } from "@/db";
import { prepBatches, products, salesRecords } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const productId = searchParams.get("productId");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to dates required (YYYY-MM-DD)" }, { status: 400 });
  }

  const [prepTotals, salesTotals, wasteTotals] = await Promise.all([
    // Prep per product per day
    db
      .select({
        productId: prepBatches.productId,
        productName: products.name,
        unit: products.unit,
        date: prepBatches.datePrepped,
        totalPrepped: sql<number>`sum(${prepBatches.quantityPrepped})`.as("total_prepped"),
      })
      .from(prepBatches)
      .innerJoin(products, eq(prepBatches.productId, products.id))
      .where(
        and(
          gte(prepBatches.datePrepped, from),
          lte(prepBatches.datePrepped, to),
          productId ? eq(prepBatches.productId, Number(productId)) : undefined
        )
      )
      .groupBy(prepBatches.productId, prepBatches.datePrepped)
      .orderBy(prepBatches.datePrepped),

    // Sales per product per day
    db
      .select({
        productId: salesRecords.productId,
        productName: products.name,
        unit: products.unit,
        date: salesRecords.saleDate,
        totalSold: sql<number>`sum(${salesRecords.quantitySold})`.as("total_sold"),
      })
      .from(salesRecords)
      .innerJoin(products, eq(salesRecords.productId, products.id))
      .where(
        and(
          gte(salesRecords.saleDate, from),
          lte(salesRecords.saleDate, to),
          productId ? eq(salesRecords.productId, Number(productId)) : undefined
        )
      )
      .groupBy(salesRecords.productId, salesRecords.saleDate)
      .orderBy(salesRecords.saleDate),

    // Expired (wasted) batches in range
    db
      .select({
        productId: prepBatches.productId,
        productName: products.name,
        unit: products.unit,
        date: prepBatches.expiryDate,
        totalWasted: sql<number>`sum(${prepBatches.quantityRemaining})`.as("total_wasted"),
      })
      .from(prepBatches)
      .innerJoin(products, eq(prepBatches.productId, products.id))
      .where(
        and(
          eq(prepBatches.status, "expired"),
          gte(prepBatches.expiryDate, from),
          lte(prepBatches.expiryDate, to),
          productId ? eq(prepBatches.productId, Number(productId)) : undefined
        )
      )
      .groupBy(prepBatches.productId, prepBatches.expiryDate)
      .orderBy(prepBatches.expiryDate),
  ]);

  return NextResponse.json({ from, to, prepTotals, salesTotals, wasteTotals });
}
