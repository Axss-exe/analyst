import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { narrativeChecks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { checkNarrative } from "@/lib/story-checker";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const [latestCheck] = db
      .select()
      .from(narrativeChecks)
      .where(eq(narrativeChecks.narrativeId, id))
      .orderBy(desc(narrativeChecks.checkedAt))
      .all();
    return NextResponse.json({ check: latestCheck || null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const result = await checkNarrative(id);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[narrative-check] Error:", err);
    return NextResponse.json({ error: err?.message || "Check failed" }, { status: 500 });
  }
}
