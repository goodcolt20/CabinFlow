import { db } from "@/db";
import { prepBatches, products } from "@/db/schema";
import { addDays, todayLocal } from "@/lib/dates";
import { and, eq, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const productId = searchParams.get("productId");
  const activeOnly = searchParams.get("activeOnly") === "true";

  const rows = await db
    .select({ batch: prepBatches, product: products })
    .from(prepBatches)
    .innerJoin(products, eq(prepBatches.productId, products.id))
    .where(
      and(
        date ? eq(prepBatches.datePrepped, date) : undefined,
        productId ? eq(prepBatches.productId, Number(productId)) : undefined,
        activeOnly ? eq(prepBatches.status, "active") : undefined
      )
    )
    .orderBy(prepBatches.expiryDate, prepBatches.datePrepped);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, datePrepped, quantityPrepped, shelfLifeDays, notes } = body;

  if (!productId || !datePrepped || !quantityPrepped || !shelfLifeDays) {
    return NextResponse.json(
      { error: "productId, datePrepped, quantityPrepped, shelfLifeDays are required" },
      { status: 400 }
    );
  }

  const expiryDate = addDays(datePrepped, Number(shelfLifeDays));

  const [row] = await db
    .insert(prepBatches)
    .values({
      productId: Number(productId),
      datePrepped,
      quantityPrepped: Number(quantityPrepped),
      quantityRemaining: Number(quantityPrepped),
      shelfLifeDays: Number(shelfLifeDays),
      expiryDate,
      notes,
      status: "active",
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function PATCH() {
  const today = todayLocal();

  const expired = await db
    .update(prepBatches)
    .set({ status: "expired" })
    .where(and(eq(prepBatches.status, "active"), lte(prepBatches.expiryDate, today)))
    .returning();

  return NextResponse.json({ expired: expired.length });
}

// Delete a single batch — used for correcting mistaken prep entries.
// Does NOT adjust sales records; if sales had already FIFO-deducted from this
// batch those records stay intact (inventory math becomes approximate but the
// user is explicitly undoing their own input).
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(prepBatches).where(eq(prepBatches.id, id));
  return NextResponse.json({ ok: true });
}
