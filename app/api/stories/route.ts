import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { stories, evidence } from "@/db/schema";
import { eq, like, or, desc, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Fetch stories with a simple select — no sql expressions, no subqueries
    let query = db.select().from(stories).orderBy(desc(stories.id)).limit(limit);

    if (search) {
      query = query.where(
        or(
          like(stories.title, `%${search}%`),
          like(stories.description, `%${search}%`)
        )
      ) as typeof query;
    }

    const storyRows = await query;

    // Count evidence per story separately
    const evidenceCounts = await db
      .select({ storyId: evidence.storyId, count: count() })
      .from(evidence)
      .groupBy(evidence.storyId)
      .all();

    const countMap = new Map<number, number>();
    for (const row of evidenceCounts) {
      if (row.storyId != null) {
        countMap.set(row.storyId, row.count);
      }
    }

    // Build safe response
    const result = storyRows.map((row: any) => {
      const safeDate = (val: any): string | null => {
        if (!val) return null;
        if (typeof val === "string") return val;
        if (val instanceof Date) return val.toISOString();
        try {
          return new Date(val).toISOString();
        } catch {
          return String(val);
        }
      };

      return {
        id: row.id,
        title: row.title ?? "Untitled",
        description: row.description ?? null,
        status: row.status ?? "draft",
        confidence: typeof row.confidence === "number" ? row.confidence : 0.5,
        createdAt: safeDate(row.createdAt),
        updatedAt: safeDate(row.updatedAt),
        evidenceCount: countMap.get(row.id) ?? 0,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/stories] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch stories" },
      { status: 500 }
    );
  }
}
