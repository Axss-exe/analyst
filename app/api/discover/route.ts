import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  storyCandidates,
  storyCandidateEvidence,
  narratives,
  graphClusters,
  evidence,
} from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const search = searchParams.get("search") || "";

    // Get story candidates with evidence counts
    const candidates = await db
      .select({
        id: storyCandidates.id,
        name: storyCandidates.name,
        description: storyCandidates.description,
        coherenceScore: storyCandidates.coherenceScore,
        confidence: storyCandidates.confidence,
        status: storyCandidates.status,
        seedType: storyCandidates.seedType,
        evidenceCount: sql<number>`COUNT(DISTINCT ${storyCandidateEvidence.evidenceId})`,
        createdAt: storyCandidates.createdAt,
      })
      .from(storyCandidates)
      .leftJoin(
        storyCandidateEvidence,
        eq(storyCandidates.id, storyCandidateEvidence.storyCandidateId)
      )
      .groupBy(storyCandidates.id)
      .orderBy(desc(storyCandidates.coherenceScore))
      .limit(limit)
      .all();

    // Get narratives
    const narrativeList = await db
      .select()
      .from(narratives)
      .orderBy(desc(narratives.confidence))
      .limit(limit)
      .all();

    // Get clusters
    const clusters = await db
      .select()
      .from(graphClusters)
      .orderBy(desc(graphClusters.density))
      .limit(limit)
      .all();

    // Get unassigned evidence count
    const totalEvidence = (db.select({ count: sql<number>`COUNT(*)` }).from(evidence).get() as any)?.count || 0;

    return NextResponse.json({
      storyCandidates: candidates ?? [],
      narratives: narrativeList ?? [],
      clusters: clusters ?? [],
      totalEvidence,
      totalCandidates: candidates.length,
      totalNarratives: narrativeList.length,
      totalClusters: clusters.length,
    });
  } catch (err: any) {
    console.error("[api/discover] GET failed:", err);
    return NextResponse.json(
      {
        storyCandidates: [],
        narratives: [],
        clusters: [],
        totalEvidence: 0,
        totalCandidates: 0,
        totalNarratives: 0,
        totalClusters: 0,
        error: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

// ═════════════════════════════════════════════════════════════════
// POST /api/discover
// ═════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { evidenceIds, title, description } = body;

    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
      return NextResponse.json(
        { error: "evidenceIds array is required" },
        { status: 400 }
      );
    }

    // v3: Create a manual story
    const result = await db.insert(storyCandidates).values({
      name: title || `Manual Story ${Date.now()}`,
      description: description || "Manually created story",
      coherenceScore: 0.5,
      confidence: 0.5,
      status: "story",
      reasons: JSON.stringify(["Manually created by user"]),
      relationshipCounts: JSON.stringify({ strong: 0, medium: 0, weak: 0, total: 0 }),
    }).returning({ id: storyCandidates.id });

    const candidateId = result[0].id;

    // Link evidence
    for (const eid of evidenceIds) {
      await db.insert(storyCandidateEvidence).values({
        storyCandidateId: candidateId,
        evidenceId: eid,
        role: "member",
        attachmentReason: "Manually added",
      }).onConflictDoNothing();
    }

    return NextResponse.json({
      success: true,
      storyId: candidateId,
      evidenceCount: evidenceIds.length,
    });
  } catch (err) {
    console.error("[api/discover] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to create story" },
      { status: 500 }
    );
  }
}

// ═════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
