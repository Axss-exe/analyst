import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { stories, storyEvidence, narratives } from "@/db/schema";
import { like, or, desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Query manual stories from stories table
    let storyQuery = db.select().from(stories).orderBy(desc(stories.updatedAt)).limit(limit);
    if (search) {
      storyQuery = storyQuery.where(
        or(
          like(stories.title, `%${search}%`),
          like(stories.overview, `%${search}%`)
        )
      ) as typeof storyQuery;
    }
    const storyRows = await storyQuery;

    // Query auto narratives from narratives table
    let narrativeQuery = db.select().from(narratives).orderBy(desc(narratives.createdAt)).limit(limit);
    if (search) {
      narrativeQuery = narrativeQuery.where(
        or(
          like(narratives.title, `%${search}%`),
          like(narratives.overview, `%${search}%`)
        )
      ) as typeof narrativeQuery;
    }
    const narrativeRows = await narrativeQuery;

    // Get evidence counts
    const allLinks = await db.select().from(storyEvidence).all();
    const countMap = new Map<number, number>();
    for (const link of allLinks) {
      countMap.set(link.storyId, (countMap.get(link.storyId) || 0) + 1);
    }

    // Build manual story items
    const manualItems = storyRows.map((s: any) => ({
      id: s.id,
      title: s.title || "Unnamed Story",
      overview: s.overview || "",
      status: s.status || "active",
      confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
      generationType: "manual" as const,
      clusterIds: safeParseJson<number[]>(s.clusterIds, []),
      createdAt: s.createdAt ?? null,
      updatedAt: s.updatedAt ?? null,
      evidenceCount: countMap.get(s.id) ?? 0,
    }));

    // Build auto narrative items
    const autoItems = narrativeRows.map((n: any) => ({
      id: n.id,
      title: n.title || "Unnamed Narrative",
      overview: n.overview || "",
      status: n.status || "active",
      confidence: typeof n.confidence === "number" ? n.confidence : 0.5,
      generationType: "auto" as const,
      clusterIds: safeParseJson<number[]>(n.clusterIds, []),
      createdAt: n.createdAt ?? null,
      updatedAt: n.createdAt ?? null, // narratives has no updatedAt
      evidenceCount: safeParseJson<number[]>(n.evidenceIds, []).length,
    }));

    // Combine and sort by updatedAt desc
    const allItems = [...manualItems, ...autoItems].sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || "";
      const bTime = b.updatedAt || b.createdAt || "";
      return bTime.localeCompare(aTime);
    }).slice(0, limit);

    const manualCount = allItems.filter((s) => s.generationType === "manual").length;
    const autoCount = allItems.filter((s) => s.generationType === "auto").length;

    return NextResponse.json({
      stories: allItems,
      total: allItems.length,
      manualCount,
      autoCount,
    });
  } catch (error) {
    console.error("[api/stories] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 });
  }
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
