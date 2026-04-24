import { db } from "@/db";
import { counts, locations, products } from "@/db/schema";
import { todayLocal } from "@/lib/dates";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const productId = searchParams.get("productId");
  const locationId = searchParams.get("locationId");

  const rows = await db
    .select({ count: counts, product: products, location: locations })
    .from(counts)
    .innerJoin(products, eq(counts.productId, products.id))
    .innerJoin(locations, eq(counts.locationId, locations.id))
    .where(
      and(
        date ? eq(counts.countDate, date) : undefined,
        productId ? eq(counts.productId, Number(productId)) : undefined,
        locationId ? eq(counts.locationId, Number(locationId)) : undefined
      )
    )
    .orderBy(locations.name, products.name);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, locationId, countDate, quantity, notes } = body;

  if (!productId || !locationId || !countDate || quantity === undefined || quantity === null) {
    return NextResponse.json(
      { error: "productId, locationId, countDate, quantity are required" },
      { status: 400 }
    );
  }

  // Upsert on (productId, locationId, countDate) — a re-count overwrites
  const [existing] = await db
    .select()
    .from(counts)
    .where(
      and(
        eq(counts.productId, Number(productId)),
        eq(counts.locationId, Number(locationId)),
        eq(counts.countDate, countDate)
      )
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(counts)
      .set({
        quantity: Number(quantity),
        notes: notes ?? existing.notes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(counts.id, existing.id))
      .returning();
    return NextResponse.json(row, { status: 200 });
  }

  const [row] = await db
    .insert(counts)
    .values({
      productId: Number(productId),
      locationId: Number(locationId),
      countDate: countDate || todayLocal(),
      quantity: Number(quantity),
      notes: notes ?? null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(counts).where(eq(counts.id, id));
  return NextResponse.json({ ok: true });
}
