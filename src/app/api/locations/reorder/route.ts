import { db } from "@/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== "number")) {
    return NextResponse.json(
      { error: "ids must be an array of numbers" },
      { status: 400 }
    );
  }

  // Rewrite sortOrder in a single transaction so clients never observe a partial state.
  db.transaction(() => {
    (ids as number[]).forEach((id, idx) => {
      db.update(locations).set({ sortOrder: idx }).where(eq(locations.id, id)).run();
    });
  });

  return NextResponse.json({ ok: true });
}
