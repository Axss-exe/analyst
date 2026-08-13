import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { stories, evidence } from "@/db/schema";
import { eq, like, or, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Fetch stories
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

    // Fetch ALL evidence and count per story in JS (avoids Drizzle aggregate issues)
    const allEvidence = await db
      .select({ storyId: evidence.storyId })
      .from(evidence)
      .all();

    const countMap = new Map<number, number>();
    for (const ev of allEvidence) {
      if (ev.storyId != null) {
        countMap.set(ev.storyId, (countMap.get(ev.storyId) || 0) + 1);
      }
    }

    const result = storyRows.map((row: any) => ({
      id: row.id,
      title: row.title ?? "Untitled",
      description: row.description ?? null,
      status: row.status ?? "draft",
      confidence: typeof row.confidence === "number" ? row.confidence : 0.5,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
      evidenceCount: countMap.get(row.id) ?? 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/stories] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch stories" },
      { status: 500 }
    );
  }
}
