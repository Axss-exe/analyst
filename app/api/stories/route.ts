/**
 * ATIS v4 — /api/stories
 * 
 * GET: Returns all stories (manual + auto-discovered) with v4
 * provenance metadata: relationship counts, causal chains,
 * diagnostics, and why-documents-belong explanations.
 * 
 * v3 fields preserved for backward compatibility.
 * v4 fields are additive.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  stories,
  storyCandidates,
  storyCandidateEvidence,
  storyRelationships,
  evidence,
  programs,
  problems,
} from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import {
  type StoriesResponse,
  type StoryItem,
  type StoryItemV4,
} from "@/types";

// ═════════════════════════════════════════════════════════════════
// GET /api/stories
// ═════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all"; // all | manual | auto | validated | rejected

    const storyItems: StoryItemV4[] = [];

    // ── Load manual stories (v3 table) ─────────────────────────
    const manualRows = await db.select().from(stories).orderBy(desc(stories.updatedAt)).all();

    for (const row of manualRows) {
      const evidenceIds = safeParseJson<number[]>(row.clusterIds, []); // v3 used clusterIds for evidence
      const evidenceCount = evidenceIds.length;

      const item: StoryItemV4 = {
        id: row.id,
        title: row.title,
        overview: row.overview || "",
        status: row.status,
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString(),
        evidenceCount,
        generationType: row.generationType as StoryItem["generationType"],
        confidence: row.confidence || undefined,
        clusterIds: safeParseJson<number[]>(row.clusterIds, []),
        // v4 fields (not available for manual stories)
        dominantProgram: undefined,
        dominantProblem: undefined,
        dominantTheme: undefined,
        causalChain: undefined,
        relationshipCounts: undefined,
        diagnostics: undefined,
        reasons: undefined,
        whyDocumentsBelong: undefined,
        whyNearbyDocumentsRejected: undefined,
      };

      storyItems.push(item);
    }

    // ── Load auto-discovered stories (v4 table) ────────────────
    let candidateQuery = db.select().from(storyCandidates);

    if (filter === "validated") {
      candidateQuery = candidateQuery.where(eq(storyCandidates.status, "validated"));
    } else if (filter === "rejected") {
      candidateQuery = candidateQuery.where(eq(storyCandidates.status, "rejected"));
    } else if (filter === "auto") {
      candidateQuery = candidateQuery.where(sql`${storyCandidates.status} != 'story'`);
    }

    const candidateRows = await candidateQuery.orderBy(desc(storyCandidates.coherenceScore)).all();

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

      // Load dominant program name if available
      let dominantProgram: string | undefined;
      if (row.dominantProgramId) {
        const prog = await db.select({ name: programs.name })
          .from(programs)
          .where(eq(programs.id, row.dominantProgramId))
          .get();
        dominantProgram = prog?.name;
      }

      // Load dominant problem name if available
      let dominantProblem: string | undefined;
      if (row.dominantProblemId) {
        const prob = await db.select({ name: problems.name })
          .from(problems)
          .where(eq(problems.id, row.dominantProblemId))
          .get();
        dominantProblem = prob?.name;
      }

      // Load relationships for this candidate
      const relCounts = safeParseJson<{
        strong: number;
        medium: number;
        weak: number;
        total: number;
      }>(row.relationshipCounts, { strong: 0, medium: 0, weak: 0, total: 0 });

      // Build why-documents-belong explanations
      const whyBelong: string[] = [];
      if (evidenceIds.length > 0) {
        const rels = await db.select()
          .from(storyRelationships)
          .where(inArray(storyRelationships.sourceEvidenceId, evidenceIds))
          .where(inArray(storyRelationships.targetEvidenceId, evidenceIds))
          .where(sql`${storyRelationships.weight} >= 0.55`)
          .all();

        const seenPairs = new Set<string>();
        for (const rel of rels) {
          const pair = [rel.sourceEvidenceId, rel.targetEvidenceId].sort((a, b) => a - b).join(":");
          if (seenPairs.has(pair)) continue;
          seenPairs.add(pair);
          whyBelong.push(`E${rel.sourceEvidenceId} ↔ E${rel.targetEvidenceId}: ${rel.relationshipType} (weight ${rel.weight?.toFixed(2) || "?"})`);
        }
      }

      const item: StoryItemV4 = {
        id: row.id,
        title: row.name,
        overview: row.description || "",
        status: row.status,
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString(),
        evidenceCount: evidenceIds.length,
        generationType: row.status === "story" ? "manual" : "auto",
        confidence: row.confidence,
        clusterIds: [row.id],
        // v4 fields
        dominantProgram,
        dominantProblem,
        dominantTheme: row.dominantTheme || undefined,
        causalChain: safeParseJson(row.causalChain, []),
        relationshipCounts: relCounts,
        diagnostics: safeParseJson(row.diagnostics, undefined),
        reasons: safeParseJson(row.reasons, []),
        whyDocumentsBelong: whyBelong.slice(0, 5),
        whyNearbyDocumentsRejected: [], // Would need edge explanations from graph build
      };

      storyItems.push(item);
    }

    // Apply filter
    const filtered = filter === "all"
      ? storyItems
      : filter === "manual"
        ? storyItems.filter((s) => s.generationType === "manual")
        : filter === "auto"
          ? storyItems.filter((s) => s.generationType === "auto")
          : filter === "validated"
            ? storyItems.filter((s) => s.status === "validated" || s.generationType === "manual")
            : filter === "rejected"
              ? storyItems.filter((s) => s.status === "rejected")
              : storyItems;

    const manualCount = filtered.filter((s) => s.generationType === "manual").length;
    const autoCount = filtered.filter((s) => s.generationType === "auto").length;

    const response: StoriesResponse = {
      stories: filtered,
      total: filtered.length,
      manualCount,
      autoCount,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/stories] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to load stories" },
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
