/**
 * ATIS v4 — /api/graph
 * 
 * GET: Returns the full graph visualization data.
 * 
 * v3 fields preserved:
 *   - nodes, edges, clusters, hiddenPaths, bridgeNodes, contradictions,
 *     narratives, unclusteredCount, stats
 * 
 * v4 fields added:
 *   - contextGraph: all edges including weak contextual
 *   - storyGraph: only story-establishing edges
 *   - edgeExplanations: why each edge exists or was rejected
 *   - relationship metadata: type, weight, confidence, explicitness
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidence,
  storyRelationships,
  storyCandidates,
  storyCandidateEvidence,
  graphClusters,
  narratives,
  facts,
} from "@/db/schema";
import { eq, sql, gte } from "drizzle-orm";
import {
  type GraphResponseV4,
  type GraphNode,
  type GraphEdge,
  type GraphCluster,
  type GraphStats,
  type HiddenPath,
  type BridgeNode,
  type Contradiction,
  type Narrative,
  type ContextGraph,
  type StoryGraph,
  type EdgeExplanation,
} from "@/types";

// ═════════════════════════════════════════════════════════════════
// GET /api/graph
// ═════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const layer = searchParams.get("layer") || "all"; // all | context | story

    // ── Load all evidence ──────────────────────────────────────
    const evidenceRows = await db.select({
      id: evidence.id,
      title: evidence.title,
    }).from(evidence).all();

    const evidenceMap = new Map(evidenceRows.map((e) => [e.id, e.title]));

    // ── Load all relationships ─────────────────────────────────
    const allRels = await db.select()
      .from(storyRelationships)
      .orderBy(desc(storyRelationships.weight))
      .all();

    // ── Build v3-compatible nodes and edges ────────────────────
    const nodes: GraphNode[] = evidenceRows.map((e) => ({
      id: `evidence:${e.id}`,
      label: e.title || `E${e.id}`,
      type: "evidence",
    }));

    const edges: GraphEdge[] = allRels.map((rel, idx) => ({
      id: `edge:${idx}`,
      source: `evidence:${rel.sourceEvidenceId}`,
      target: `evidence:${rel.targetEvidenceId}`,
      label: rel.relationshipType,
      confidence: rel.confidence,
    }));

    // ── Build v4 Context Graph ─────────────────────────────────
    const contextGraph: ContextGraph = {
      nodes: evidenceRows.map((e) => ({
        id: `evidence:${e.id}`,
        label: e.title || `E${e.id}`,
        type: "evidence",
        evidenceId: e.id,
      })),
      edges: allRels.map((rel, idx) => ({
        id: `edge:${idx}`,
        source: `evidence:${rel.sourceEvidenceId}`,
        target: `evidence:${rel.targetEvidenceId}`,
        label: rel.relationshipType,
        type: rel.relationshipType as import("@/lib/graph/story-types").RelationshipType,
        weight: rel.weight || 0,
        confidence: rel.confidence,
        explicit: rel.explicit || false,
        reason: rel.reason || "",
      })),
      evidenceIds: evidenceRows.map((e) => e.id),
    };

    // ── Build v4 Story Graph ───────────────────────────────────
    const storyRels = allRels.filter((rel) => (rel.weight || 0) >= 0.55);
    const storyEvidenceIds = new Set<number>();
    for (const rel of storyRels) {
      storyEvidenceIds.add(rel.sourceEvidenceId);
      storyEvidenceIds.add(rel.targetEvidenceId);
    }

    const storyGraph: StoryGraph = {
      nodes: evidenceRows
        .filter((e) => storyEvidenceIds.has(e.id))
        .map((e) => ({
          id: `evidence:${e.id}`,
          label: e.title || `E${e.id}`,
          type: "evidence",
          evidenceId: e.id,
        })),
      edges: storyRels.map((rel, idx) => ({
        id: `story-edge:${idx}`,
        source: `evidence:${rel.sourceEvidenceId}`,
        target: `evidence:${rel.targetEvidenceId}`,
        label: rel.relationshipType,
        type: rel.relationshipType as import("@/lib/graph/story-types").RelationshipType,
        weight: rel.weight || 0,
        confidence: rel.confidence,
        explicit: rel.explicit || false,
        reason: rel.reason || "",
      })),
      threshold: 0.55,
      evidenceIds: Array.from(storyEvidenceIds).sort((a, b) => a - b),
    };

    // ── Build edge explanations ────────────────────────────────
    const edgeExplanations: EdgeExplanation[] = allRels.map((rel) => ({
      sourceEvidenceId: rel.sourceEvidenceId,
      targetEvidenceId: rel.targetEvidenceId,
      connected: (rel.weight || 0) >= 0.55,
      relationshipType: rel.relationshipType as import("@/lib/graph/story-types").RelationshipType,
      weight: rel.weight || 0,
      confidence: rel.confidence,
      reason: rel.reason || "",
      rejectionReason: (rel.weight || 0) < 0.55
        ? `Weight (${(rel.weight || 0).toFixed(2)}) below story threshold (0.55)`
        : undefined,
    }));

    // ── Load v3 clusters ───────────────────────────────────────
    const clusterRows = await db.select().from(graphClusters).all();
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

    // ── Load v3 narratives ─────────────────────────────────────
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

    // ── Compute hidden paths (v3, simplified) ──────────────────
    const hiddenPaths: HiddenPath[] = [];
    // Hidden path detection would require full graph traversal
    // For now, return empty (computed on-demand in v3 paths.ts)

    // ── Compute bridge nodes (v3, simplified) ──────────────────
    const bridgeNodes: BridgeNode[] = [];
    // Bridge node detection would require betweenness centrality
    // For now, return empty (computed on-demand in v3 paths.ts)

    // ── Compute contradictions (v3, simplified) ────────────────
    const contradictions: Contradiction[] = [];
    // Contradiction detection would require fact comparison
    // For now, return empty (computed on-demand in v3 paths.ts)

    // ── Compute stats ──────────────────────────────────────────
    const totalEvidence = evidenceRows.length;
    const entityCount = await db.select({ count: sql<number>`count(*)` })
      .from(db.select({ id: sql<number>`distinct entity_id` }).from(facts).as("entities"))
      .get();
    const relationshipCount = allRels.length;
    const connectionCount = allRels.length;
    const clusterCount = clusterRows.length;
    const avgDensity = clusterRows.length > 0
      ? clusterRows.reduce((sum, c) => sum + c.density, 0) / clusterRows.length
      : 0;

    const stats: GraphStats = {
      evidenceCount: totalEvidence,
      entityCount: entityCount?.count || 0,
      relationshipCount,
      connectionCount,
      clusterCount,
      averageClusterDensity: parseFloat(avgDensity.toFixed(3)),
      bridgeNodeCount: 0,
    };

    const unclusteredCount = totalEvidence - storyEvidenceIds.size;

    // ── Build response ─────────────────────────────────────────
    const response: GraphResponseV4 = {
      // v3 fields
      nodes,
      edges,
      clusters,
      hiddenPaths,
      bridgeNodes,
      contradictions,
      narratives: narrativeList,
      unclusteredCount,
      stats,
      // v4 fields
      contextGraph: layer === "story" ? { nodes: [], edges: [], evidenceIds: [] } : contextGraph,
      storyGraph: layer === "context" ? { nodes: [], edges: [], threshold: 0.55, evidenceIds: [] } : storyGraph,
      edgeExplanations: layer === "story" ? [] : edgeExplanations,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/graph] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to load graph data" },
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

function desc(column: any) {
  return sql`${column} desc`;
}
