import { db } from "@/db";
import { prepBatches, salesRecords } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  const rows = await db
    .select()
    .from(salesRecords)
    .where(date ? eq(salesRecords.saleDate, date) : undefined)
    .orderBy(salesRecords.saleDate);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, saleDate, quantitySold, notes, source = "manual", externalRef } = body;

  if (!productId || !saleDate || quantitySold === undefined) {
    return NextResponse.json({ error: "productId, saleDate, quantitySold are required" }, { status: 400 });
  }

  // Upsert: if a record already exists for this product+date+source, update it
  const [existing] = await db
    .select()
    .from(salesRecords)
    .where(
      and(
        eq(salesRecords.productId, Number(productId)),
        eq(salesRecords.saleDate, saleDate),
        eq(salesRecords.source, source)
      )
    )
    .limit(1);

  let record;
  if (existing) {
    [record] = await db
      .update(salesRecords)
      .set({ quantitySold: Number(quantitySold), notes })
      .where(eq(salesRecords.id, existing.id))
      .returning();
  } else {
    [record] = await db
      .insert(salesRecords)
      .values({
        productId: Number(productId),
        saleDate,
        quantitySold: Number(quantitySold),
        source,
        externalRef,
        notes,
      })
      .returning();
  }

  // Deduct from oldest active batches (FIFO)
  await deductFromBatches(Number(productId), Number(quantitySold));

  return NextResponse.json(record, { status: existing ? 200 : 201 });
}

async function deductFromBatches(productId: number, quantitySold: number) {
  const batches = await db
    .select()
    .from(prepBatches)
    .where(and(eq(prepBatches.productId, productId), eq(prepBatches.status, "active")))
    .orderBy(prepBatches.expiryDate, prepBatches.datePrepped);

  let remaining = quantitySold;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(batch.quantityRemaining, remaining);
    const newQty = batch.quantityRemaining - deduct;
    await db
      .update(prepBatches)
      .set({ quantityRemaining: newQty, status: newQty <= 0 ? "depleted" : "active" })
      .where(eq(prepBatches.id, batch.id));
    remaining -= deduct;
  }
}
