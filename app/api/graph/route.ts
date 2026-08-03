import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { entities, relationships, evidenceConnections } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import {
  buildGraph,
  getGraphStats,
  findClusters,
  findHiddenPaths,
  findContradictions,
  detectNarratives,
} from "@/lib/graph";
import type { ConnectionSignal } from "@/types";

export async function GET() {
  try {
    const user = await requireAuth();

    // Legacy node/edge dump for visualization
    const allEntities = db.select().from(entities).all();
    const allRelationships = db.select().from(relationships).all();

    const nodes = allEntities.map((e) => ({
      id: String(e.id),
      label: e.name,
      type: e.type,
      data: e,
    }));

    const edges = allRelationships.map((r) => ({
      id: String(r.id),
      source: String(r.sourceId),
      target: String(r.targetId),
      label: r.type,
      confidence: r.confidence,
    }));

    // Graph reasoning
    const graph = await buildGraph();

    // Load persisted signals into graph (avoids O(n²) recomputation)
    const signalRows = db.select().from(evidenceConnections).all();
    for (const row of signalRows) {
      const key =
        row.evidenceIdA < row.evidenceIdB
          ? `${row.evidenceIdA}:${row.evidenceIdB}`
          : `${row.evidenceIdB}:${row.evidenceIdA}`;
      const existing = graph.signalMatrix.get(key) || [];
      existing.push({
        evidenceIdA: row.evidenceIdA,
        evidenceIdB: row.evidenceIdB,
        signalType: row.signalType as ConnectionSignal["signalType"],
        strength: row.strength,
        reason: row.reason,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      });
      graph.signalMatrix.set(key, existing);
    }

    const clusterResult = findClusters(graph);
    const pathResult = findHiddenPaths(graph);
    const contradictionResult = await findContradictions(graph);
    const narrativeResult = detectNarratives(graph, clusterResult.clusters);

    const stats = getGraphStats(graph);
    stats.relationshipCount = allRelationships.length;
    stats.clusterCount = clusterResult.clusters.length;
    stats.averageClusterDensity =
      clusterResult.clusters.length > 0
        ? Math.round(
            (clusterResult.clusters.reduce((sum, c) => sum + c.density, 0) /
              clusterResult.clusters.length) *
              100,
          ) / 100
        : 0;
    stats.bridgeNodeCount = pathResult.bridgeNodes.length;

    return NextResponse.json({
      nodes,
      edges,
      clusters: clusterResult.clusters,
      hiddenPaths: pathResult.hiddenPaths,
      bridgeNodes: pathResult.bridgeNodes,
      contradictions: contradictionResult,
      narratives: narrativeResult.narratives,
      unclusteredCount: clusterResult.unclusteredEvidenceIds.length,
      stats,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Graph error:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph data" },
      { status: 500 },
    );
  }
}
