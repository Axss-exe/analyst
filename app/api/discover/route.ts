/**
 * ATIS v4 — /api/discover
 * 
 * GET: Returns discovered stories, candidates, and diagnostics.
 * POST: Creates a manual story from selected evidence (v3 preserved).
 * 
 * v4 additions:
 *   - storyCandidates: auto-discovered story candidates with coherence
 *   - rejectedCandidates: candidates that failed validation
 *   - singleDocumentStories: standalone single-document narratives
 *   - diagnostics: pipeline statistics
 *   - edgeExplanations: why documents are connected or rejected
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidence,
  storyCandidates,
  storyCandidateEvidence,
  storyRelationships,
  graphClusters,
  narratives,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import {
  type DiscoverResponseV4,
  type StoryCandidate,
  type StoryItem,
  type GraphCluster,
  type Narrative,
} from "@/types";

// ═════════════════════════════════════════════════════════════════
// GET /api/discover
// ═════════════════════════════════════════════════════════════════

export async function GET(): Promise<NextResponse> {
  try {
    // ── v3: Load clusters ──────────────────────────────────────
    const clusterRows = await db.select()
      .from(graphClusters)
      .orderBy(desc(graphClusters.density))
      .all();

    const clusters: GraphCluster[] = clusterRows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || "",
      density: c.density,
      status: c.status as GraphCluster["status"],
      evidenceCount: c.evidenceCount,
      entityCount: c.entityCount,
      evidenceIds: safeParseJson<number[]>(c.evidenceIds, []),
      entityIds: safeParseJson<number[]>(c.entityIds, []),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // ── v3: Load narratives ────────────────────────────────────
    const narrativeRows = await db.select().from(narratives).all();
    const narrativeList: Narrative[] = narrativeRows.map((n) => ({
      id: n.id,
      title: n.title,
      overview: n.overview || "",
      clusterIds: safeParseJson<number[]>(n.clusterIds, []),
      evidenceIds: safeParseJson<number[]>(n.evidenceIds, []),
      confidence: n.confidence,
      generationType: n.generationType as Narrative["generationType"],
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));

    // ── v4: Load story candidates ──────────────────────────────
    const candidateRows = await db.select().from(storyCandidates).all();

    const storyCandidatesList: StoryCandidate[] = [];
    const rejectedCandidatesList: StoryCandidate[] = [];
    const singleDocumentStoriesList: StoryCandidate[] = [];

    for (const row of candidateRows) {
      // Load evidence for this candidate
      const evidenceRows = await db.select({
        evidenceId: storyCandidateEvidence.evidenceId,
        role: storyCandidateEvidence.role,
      })
        .from(storyCandidateEvidence)
        .where(eq(storyCandidateEvidence.storyCandidateId, row.id))
        .all();

      const evidenceIds = evidenceRows.map((e) => e.evidenceId);
      const seedIds = evidenceRows.filter((e) => e.role === "seed").map((e) => e.evidenceId);
      const contextIds = evidenceRows.filter((e) => e.role === "context").map((e) => e.evidenceId);

      const candidate: StoryCandidate = {
        id: row.id,
        name: row.name,
        description: row.description || "",
        evidenceIds,
        seedEvidenceIds: seedIds,
        contextEvidenceIds: contextIds,
        coherenceScore: row.coherenceScore,
        confidence: row.confidence,
        dominantTheme: row.dominantTheme || "",
        causalChain: safeParseJson(row.causalChain, []),
        reasons: safeParseJson(row.reasons, []),
        status: row.status as StoryCandidate["status"],
        relationshipCounts: safeParseJson(row.relationshipCounts, { strong: 0, medium: 0, weak: 0, total: 0 }),
        diagnostics: safeParseJson(row.diagnostics, {
          programIdentityScore: 0,
          causalContinuityScore: 0,
          problemConsistencyScore: 0,
          eventContinuityScore: 0,
          outcomeConsistencyScore: 0,
          temporalCoherenceScore: 0,
          evidenceDensityScore: 0,
          genericLocationPenalty: 0,
          genericActorPenalty: 0,
          unrelatedSectorPenalty: 0,
          contradictoryProgramPenalty: 0,
        }),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      if (row.status === "rejected") {
        rejectedCandidatesList.push(candidate);
      } else if (evidenceIds.length === 1) {
        singleDocumentStoriesList.push(candidate);
      } else {
        storyCandidatesList.push(candidate);
      }
    }

    // ── v3: Count unlinked ─────────────────────────────────────
    const totalEvidence = await db.select({ count: sql<number>`count(*)` }).from(evidence).get();
    const clusteredCount = new Set(
      candidateRows.flatMap((c) => safeParseJson<number[]>(c.evidenceIds, []))
    ).size;
    const unlinkedCount = (totalEvidence?.count || 0) - clusteredCount;

    // ── v4: Diagnostics ────────────────────────────────────────
    const relCount = await db.select({ count: sql<number>`count(*)` }).from(storyRelationships).get();
    const storyRelCount = await db.select({ count: sql<number>`count(*)` })
      .from(storyRelationships)
      .where(sql`${storyRelationships.weight} >= 0.55`)
      .get();

    const response: DiscoverResponseV4 = {
      // v3 fields
      clusters,
      unlinkedCount,
      clusteredCount,
      totalNarratives: narrativeList.length,
      // v4 fields
      storyCandidates: storyCandidatesList,
      rejectedCandidates: rejectedCandidatesList,
      singleDocumentStories: singleDocumentStoriesList,
      diagnostics: {
        totalRelationshipsEvaluated: relCount?.count || 0,
        storyGraphEdges: storyRelCount?.count || 0,
        contextGraphEdges: (relCount?.count || 0) - (storyRelCount?.count || 0),
        seedsFound: candidateRows.length,
        expansionsPerformed: candidateRows.reduce((sum, c) => {
          const ids = safeParseJson<number[]>(c.evidenceIds, []);
          return sum + Math.max(0, ids.length - 1);
        }, 0),
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/discover] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to load discovery data" },
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
