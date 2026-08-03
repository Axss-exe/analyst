import { db } from "@/db/client";
import {
  evidence,
  entities,
  evidenceEntities,
  timelineEvents,
  facts,
  relationships,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type {
  EvidenceNode,
  EntityNode,
  EvidenceGraph,
  GraphStats,
} from "./types";
import type { ConnectionSignal } from "@/types";

export async function buildGraph(): Promise<EvidenceGraph> {
  const allEvidence = db.select().from(evidence).all();
  const allEntities = db.select().from(entities).all();
  const allEvidenceEntities = db.select().from(evidenceEntities).all();
  const allTimelineEvents = db.select().from(timelineEvents).all();
  const allFacts = db.select().from(facts).all();

  // Build entity -> evidence mapping
  const entityToEvidence: Map<number, number[]> = new Map();
  for (const ee of allEvidenceEntities) {
    const list = entityToEvidence.get(ee.entityId) || [];
    list.push(ee.evidenceId);
    entityToEvidence.set(ee.entityId, list);
  }

  // Build evidence -> entity mapping
  const evidenceToEntities: Map<number, number[]> = new Map();
  for (const ee of allEvidenceEntities) {
    const list = evidenceToEntities.get(ee.evidenceId) || [];
    list.push(ee.entityId);
    evidenceToEntities.set(ee.evidenceId, list);
  }

  // Build evidence nodes
  const evidenceNodes: Map<number, EvidenceNode> = new Map();
  for (const ev of allEvidence) {
    const meta = safeParseJson(ev.aiMetadata);
    const evEntityIds = evidenceToEntities.get(ev.id) || [];
    const evTopics: string[] = meta?.topics || [];
    const evLocations: string[] = meta?.locations || [];
    const evDates: string[] = meta?.dates || [];

    evidenceNodes.set(ev.id, {
      id: ev.id,
      title: ev.title,
      summary: ev.summary,
      sourceType: ev.sourceType,
      createdAt: ev.createdAt,
      entityIds: evEntityIds,
      topics: evTopics,
      locations: evLocations,
      dates: evDates,
      confidence: ev.confidence,
    });
  }

  // Build entity nodes
  const entityNodes: Map<number, EntityNode> = new Map();
  for (const ent of allEntities) {
    entityNodes.set(ent.id, {
      id: ent.id,
      name: ent.name,
      type: ent.type,
      evidenceIds: entityToEvidence.get(ent.id) || [],
    });
  }

  // Build adjacency: evidence connected via shared entities
  const adjacency: Map<number, Set<number>> = new Map();
  for (const [eid, entIds] of evidenceToEntities) {
    const neighbors = new Set<number>();
    for (const entId of entIds) {
      const linkedEvidence = entityToEvidence.get(entId) || [];
      for (const otherEid of linkedEvidence) {
        if (otherEid !== eid) neighbors.add(otherEid);
      }
    }
    adjacency.set(eid, neighbors);
  }

  // Initialize signal matrix
  const signalMatrix: Map<string, ConnectionSignal[]> = new Map();

  return {
    evidenceNodes,
    entityNodes,
    adjacency,
    signalMatrix,
  };
}

export function getGraphStats(graph: EvidenceGraph): GraphStats {
  let connectionCount = 0;
  for (const neighbors of graph.adjacency.values()) {
    connectionCount += neighbors.size;
  }
  // Each connection counted twice (A->B and B->A), so divide by 2
  connectionCount = Math.floor(connectionCount / 2);

  return {
    evidenceCount: graph.evidenceNodes.size,
    entityCount: graph.entityNodes.size,
    relationshipCount: 0, // populated by caller if needed
    connectionCount,
    clusterCount: 0,
    averageClusterDensity: 0,
    bridgeNodeCount: 0,
  };
}

export function getEntityNeighbors(
  graph: EvidenceGraph,
  entityId: number,
): number[] {
  const entity = graph.entityNodes.get(entityId);
  if (!entity) return [];
  return entity.evidenceIds;
}

export function getEvidenceNeighbors(
  graph: EvidenceGraph,
  evidenceId: number,
): number[] {
  const neighbors = graph.adjacency.get(evidenceId);
  if (!neighbors) return [];
  return Array.from(neighbors);
}

function safeParseJson(str: string | null): Record<string, unknown> | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}
