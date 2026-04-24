import { db } from "@/db";
import { prepBatches, salesRecords } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
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

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, quantitySold, notes } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(salesRecords)
    .where(eq(salesRecords.id, Number(id)))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: { quantitySold?: number; notes?: string } = {};
  if (quantitySold !== undefined) updates.quantitySold = Number(quantitySold);
  if (notes !== undefined) updates.notes = notes;

  const [record] = await db
    .update(salesRecords)
    .set(updates)
    .where(eq(salesRecords.id, Number(id)))
    .returning();

  if (quantitySold !== undefined) {
    const delta = Number(quantitySold) - existing.quantitySold;
    if (delta > 0) await deductFromBatches(existing.productId, delta);
    else if (delta < 0) await restoreToBatches(existing.productId, -delta);
  }

  return NextResponse.json(record);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const [existing] = await db
    .select()
    .from(salesRecords)
    .where(eq(salesRecords.id, Number(id)))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(salesRecords).where(eq(salesRecords.id, Number(id)));
  await restoreToBatches(existing.productId, existing.quantitySold);

  return NextResponse.json({ ok: true });
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

async function restoreToBatches(productId: number, quantity: number) {
  const batches = await db
    .select()
    .from(prepBatches)
    .where(eq(prepBatches.productId, productId))
    .orderBy(desc(prepBatches.expiryDate), desc(prepBatches.datePrepped));

  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    if (batch.status === "expired") continue;
    const canRestore = batch.quantityPrepped - batch.quantityRemaining;
    if (canRestore <= 0) continue;
    const restore = Math.min(canRestore, remaining);
    await db
      .update(prepBatches)
      .set({ quantityRemaining: batch.quantityRemaining + restore, status: "active" })
      .where(eq(prepBatches.id, batch.id));
    remaining -= restore;
  }
}
