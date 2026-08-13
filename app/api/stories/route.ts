import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { storyCandidates, narratives, storyCandidateEvidence } from "@/db/schema";
import { like, or, desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Query storyCandidates (where the actual data lives)
    let query = db.select().from(storyCandidates).orderBy(desc(storyCandidates.id)).limit(limit);

    if (search) {
      query = query.where(
        or(
          like(storyCandidates.name, `%${search}%`),
          like(storyCandidates.description, `%${search}%`)
        )
      ) as typeof query;
    }

    const candidates = await query;

    // Fetch all narratives
    const allNarratives = await db.select().from(narratives).all();
    const narrativeMap = new Map<number, (typeof allNarratives)[0]>();
    for (const n of allNarratives) {
      try {
        const clusterIds = n.clusterIds ? JSON.parse(n.clusterIds) : [];
        if (Array.isArray(clusterIds) && clusterIds.length > 0) {
          narrativeMap.set(clusterIds[0], n);
        }
      } catch { /* ignore parse errors */ }
    }

    // Fetch evidence counts per candidate
    const allLinks = await db.select().from(storyCandidateEvidence).all();
    const countMap = new Map<number, number>();
    for (const link of allLinks) {
      countMap.set(link.candidateId, (countMap.get(link.candidateId) || 0) + 1);
    }

    // Build response in the shape the frontend expects
    const result = candidates.map((c: any) => {
      const narrative = narrativeMap.get(c.id);
      return {
        id: c.id,
        title: c.name || "Unnamed Story",
        description: c.description || narrative?.overview || null,
        status: c.status || "candidate",
        confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
        createdAt: c.createdAt ?? null,
        updatedAt: c.updatedAt ?? null,
        evidenceCount: countMap.get(c.id) ?? 0,
        narrativeTitle: narrative?.title || null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/stories] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 });
  }
}
