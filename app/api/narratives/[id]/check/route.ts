import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { narrativeChecks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { checkNarrative } from "@/lib/story-checker";

function parseIssues(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  return [];
}

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

    const check = latestCheck || null;
    if (check && check.issues) {
      check.issues = parseIssues(check.issues);
    }
    return NextResponse.json({ check });
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
