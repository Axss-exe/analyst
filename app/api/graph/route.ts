/**
 * ATIS v4 — /api/graph
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidence,
  storyRelationships,
  storyCandidates,
  graphClusters,
  narratives,
  facts,
} from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import {
  type GraphNode,
  type GraphEdge,
  type GraphCluster,
  type HiddenPath,
  type BridgeNode,
  type Contradiction,
  type Narrative,
  type StoryGraphEdge,
  type ContextGraphEdge,
} from "@/types";

// Inline types not exported from @/types
interface GraphStats {
  evidenceCount: number;
  entityCount: number;
  relationshipCount: number;
  connectionCount: number;
  clusterCount: number;
  averageClusterDensity: number;
  bridgeNodeCount: number;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  hiddenPaths: HiddenPath[];
  bridgeNodes: BridgeNode[];
  contradictions: Contradiction[];
  narratives: Narrative[];
  unclusteredCount: number;
  stats: GraphStats;
  contextGraph: {
    nodes: GraphNode[];
    edges: any[];
    evidenceIds: number[];
  };
  storyGraph: {
    nodes: GraphNode[];
    edges: any[];
    threshold: number;
    evidenceIds: number[];
  };
  edgeExplanations: any[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const layer = searchParams.get("layer") || "all";

    // Load all evidence
    const evidenceRows = await db.select({
      id: evidence.id,
      title: evidence.title,
    }).from(evidence).all();

    // Load all relationships
    const allRels = await db.select()
      .from(storyRelationships)
      .orderBy(desc(storyRelationships.weight))
      .all();

    // Build nodes
    const nodes: GraphNode[] = evidenceRows.map((e) => ({
      id: `evidence:${e.id}`,
      label: e.title || `E${e.id}`,
      type: "evidence",
      data: {},
    }));

    // Build edges
    const edges: GraphEdge[] = allRels.map((rel, idx) => ({
      id: `edge:${idx}`,
      source: `evidence:${rel.sourceEvidenceId}`,
      target: `evidence:${rel.targetEvidenceId}`,
      label: rel.relationshipType,
      confidence: rel.confidence,
    }));

    // Build v4 Context Graph
    const contextGraph = {
      nodes: evidenceRows.map((e) => ({
        id: `evidence:${e.id}`,
        label: e.title || `E${e.id}`,
        type: "evidence",
        data: {},
      })),
      edges: allRels.map((rel) => ({
        sourceEvidenceId: rel.sourceEvidenceId,
        targetEvidenceId: rel.targetEvidenceId,
        relationshipType: rel.relationshipType,
        weight: rel.weight || 0,
        confidence: rel.confidence,
        explicit: rel.explicit || false,
        explanation: rel.reason || "",
        sourceEvidence: "",
      })),
      evidenceIds: evidenceRows.map((e) => e.id),
    };

    // Build v4 Story Graph
    const storyRels = allRels.filter((rel) => (rel.weight || 0) >= 0.55);
    const storyEvidenceIds = new Set<number>();
    for (const rel of storyRels) {
      storyEvidenceIds.add(rel.sourceEvidenceId);
      storyEvidenceIds.add(rel.targetEvidenceId);
    }

    const storyGraph = {
      nodes: evidenceRows
        .filter((e) => storyEvidenceIds.has(e.id))
        .map((e) => ({
          id: `evidence:${e.id}`,
          label: e.title || `E${e.id}`,
          type: "evidence",
          data: {},
        })),
      edges: storyRels.map((rel) => ({
        sourceEvidenceId: rel.sourceEvidenceId,
        targetEvidenceId: rel.targetEvidenceId,
        relationshipType: rel.relationshipType,
        weight: rel.weight || 0,
        confidence: rel.confidence,
        explicit: rel.explicit || false,
        explanation: rel.reason || "",
        sourceEvidence: "",
        inferred: false,
      })),
      threshold: 0.55,
      evidenceIds: Array.from(storyEvidenceIds).sort((a, b) => a - b),
    };

    // Build edge explanations
    const edgeExplanations = allRels.map((rel) => ({
      sourceEvidenceId: rel.sourceEvidenceId,
      targetEvidenceId: rel.targetEvidenceId,
      connected: (rel.weight || 0) >= 0.55,
      relationshipType: rel.relationshipType,
      weight: rel.weight || 0,
      confidence: rel.confidence,
      reason: rel.reason || "",
      rejectionReason: (rel.weight || 0) < 0.55
        ? `Weight (${(rel.weight || 0).toFixed(2)}) below story threshold (0.55)`
        : undefined,
    }));

    // Load clusters
    const clusterRows = await db.select().from(graphClusters).all();
    const clusters: GraphCluster[] = clusterRows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || "",
      density: c.density,
      status: c.status as GraphCluster["status"],
      evidenceIds: safeParseJson<number[]>(c.evidenceIds, []),
      entityIds: safeParseJson<number[]>(c.entityIds, []),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // Load narratives
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
    }));

    // Stats
    const totalEvidence = evidenceRows.length;
    const entityCount = await db.select({ count: sql<number>`count(*)` })
      .from(db.select({ id: sql<number>`distinct entity_id` }).from(facts).as("entities"))
      .get();

    const stats: GraphStats = {
      evidenceCount: totalEvidence,
      entityCount: entityCount?.count || 0,
      relationshipCount: allRels.length,
      connectionCount: allRels.length,
      clusterCount: clusterRows.length,
      averageClusterDensity: clusterRows.length > 0
        ? parseFloat((clusterRows.reduce((sum, c) => sum + c.density, 0) / clusterRows.length).toFixed(3))
        : 0,
      bridgeNodeCount: 0,
    };

    const unclusteredCount = totalEvidence - storyEvidenceIds.size;

    const response: GraphResponse = {
      nodes,
      edges,
      clusters,
      hiddenPaths: [],
      bridgeNodes: [],
      contradictions: [],
      narratives: narrativeList,
      unclusteredCount,
      stats,
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

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}