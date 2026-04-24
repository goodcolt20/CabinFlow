import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(locations).orderBy(locations.sortOrder, locations.name);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Put new locations at the end of the list
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${locations.sortOrder}), -1)`.as("max") })
    .from(locations);

  try {
    const [row] = await db
      .insert(locations)
      .values({ name, sortOrder: (max ?? -1) + 1 })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "A location with that name already exists" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(locations).where(eq(locations.id, id));
  return NextResponse.json({ ok: true });
}
