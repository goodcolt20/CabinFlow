import { db } from "@/db";
import { counts, dailySummaries, prepBatches, products, salesRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(products).orderBy(products.category, products.name);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, unit, category, defaultShelfLifeDays } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(products)
    .values({ name: name.trim(), unit: unit ?? "portions", category: category ?? "uncategorized", defaultShelfLifeDays })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, name, unit, category, defaultShelfLifeDays } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (name !== undefined && !String(name).trim()) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = String(name).trim();
  if (unit !== undefined) update.unit = unit;
  if (category !== undefined) update.category = category;
  if (defaultShelfLifeDays !== undefined) update.defaultShelfLifeDays = defaultShelfLifeDays;

  const [row] = await db
    .update(products)
    .set(update)
    .where(eq(products.id, Number(id)))
    .returning();

  if (!row) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Foreign-key constraints require us to delete dependents first.
  await db.delete(counts).where(eq(counts.productId, id));
  await db.delete(salesRecords).where(eq(salesRecords.productId, id));
  await db.delete(prepBatches).where(eq(prepBatches.productId, id));
  await db.delete(dailySummaries).where(eq(dailySummaries.productId, id));
  await db.delete(products).where(eq(products.id, id));

  return NextResponse.json({ ok: true });
}
