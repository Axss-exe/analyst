import { db } from "@/db/client";
import {
  evidence,
  entities,
  evidenceEntities,
  facts,
  evidenceConnections,
  timelineEvents,
  relationships,
} from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { extractStructuredFacts } from "@/lib/ai/extraction";
import { generateEmbeddings } from "@/lib/ai/similarity";
import {
  buildEvidenceGraph,
  computeSignals,
  detectClusters,
  findHiddenPaths,
  detectContradictions,
  generateNarrativeFromCluster,
} from "@/lib/graph";
import { updateJob, enqueueJob } from "@/lib/jobs";

interface ExtractionEntity {
  name: string;
  type: string;
  metadata?: Record<string, any>;
}

interface ExtractionFact {
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  temporalInfo?: any;
}

interface ExtractionTimelineEvent {
  date?: string;
  event: string;
  entityNames?: string[];
}

interface ExtractionRelationship {
  sourceEntityId?: number;
  targetEntityId?: number;
  source?: string;
  target?: string;
  type: string;
  metadata?: any;
}

interface StructuredExtraction {
  confidence: number;
  entities: ExtractionEntity[];
  facts: ExtractionFact[];
  timeline: ExtractionTimelineEvent[];
  relationships: ExtractionRelationship[];
  topics?: string[];
  summary?: string;
}

// NEW: enqueueEvidenceJob — called by the API route to start background processing
export function enqueueEvidenceJob(
  evidenceId: number,
  content: string,
  userId: number,
): string {
  const jobId = enqueueJob([
    "init",
    "extraction",
    "entities",
    "facts",
    "timeline",
    "relationships",
    "embeddings",
    "connections",
    "clusters",
    "narratives",
    "complete",
  ]);

  // Fire off processing in the background — do NOT await
  processEvidence(evidenceId, jobId).catch((err) => {
    console.error(`[worker] Background job ${jobId} failed:`, err);
  });

  return jobId;
}

export async function processEvidence(evidenceId: number, jobId: string) {
  try {
    await updateJob(jobId, {
      stage: "init",
      progress: 5,
      status: "running",
    });

    // Load evidence
    const [item] = db
      .select()
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
      .all();
    if (!item) throw new Error(`Evidence ${evidenceId} not found`);

    const text = item.content || item.text || item.fullText || "";
    if (!text.trim()) {
      await updateJob(jobId, {
        stage: "complete",
        progress: 100,
        status: "completed",
      });
      return;
    }

    await updateJob(jobId, { stage: "extraction", progress: 15 });

    // Single LLM call for structured extraction
    const extraction: StructuredExtraction = await extractStructuredFacts(text);

    // Write confidence to evidence table (not just aiMetadata)
    const existingMeta =
      typeof item.aiMetadata === "string"
        ? JSON.parse(item.aiMetadata)
        : item.aiMetadata || {};

    db.update(evidence)
      .set({
        confidence: extraction.confidence ?? 0.5,
        aiMetadata: JSON.stringify({
          ...existingMeta,
          extraction,
          processedAt: new Date().toISOString(),
        }),
      })
      .where(eq(evidence.id, evidenceId))
      .run();

    await updateJob(jobId, { stage: "entities", progress: 30 });

    // Save entities with upsert
    const seenEntityIds = new Set<number>();
    for (const ent of extraction.entities || []) {
      let entityId: number;

      const existing = db
        .select()
        .from(entities)
        .where(and(eq(entities.name, ent.name), eq(entities.type, ent.type)))
        .all();

      if (existing.length > 0) {
        entityId = existing[0].id;
        const oldMeta =
          typeof existing[0].metadata === "string"
            ? JSON.parse(existing[0].metadata)
            : existing[0].metadata || {};

        db.update(entities)
          .set({
            metadata: JSON.stringify({
              ...oldMeta,
              ...ent.metadata,
              lastSeen: new Date().toISOString(),
            }),
          })
          .where(eq(entities.id, entityId))
          .run();
      } else {
        const result = db
          .insert(entities)
          .values({
            name: ent.name,
            type: ent.type,
            metadata: JSON.stringify(ent.metadata || {}),
            createdAt: new Date().toISOString(),
          })
          .run();
        entityId = Number(result.lastInsertRowid);
      }

      if (!seenEntityIds.has(entityId)) {
        seenEntityIds.add(entityId);
        try {
          db.insert(evidenceEntities).values({ evidenceId, entityId }).run();
        } catch {
          // Already linked — ignore unique constraint violation
        }
      }
    }

    await updateJob(jobId, { stage: "facts", progress: 45 });

    // Replace old facts
    db.delete(facts).where(eq(facts.evidenceId, evidenceId)).run();
    for (const f of extraction.facts || []) {
      db.insert(facts)
        .values({
          evidenceId,
          subject: f.subject,
          predicate: f.predicate,
          object: f.object,
          confidence: f.confidence ?? 0.5,
          temporalInfo: f.temporalInfo ? JSON.stringify(f.temporalInfo) : null,
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    await updateJob(jobId, { stage: "timeline", progress: 55 });

    // Replace old timeline events
    db.delete(timelineEvents)
      .where(eq(timelineEvents.evidenceId, evidenceId))
      .run();
    for (const evt of extraction.timeline || []) {
      db.insert(timelineEvents)
        .values({
          evidenceId,
          date: evt.date,
          event: evt.event,
          entityNames: evt.entityNames ? JSON.stringify(evt.entityNames) : null,
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    await updateJob(jobId, { stage: "relationships", progress: 65 });

    // Replace old relationships for this evidence
    db.delete(relationships)
      .where(eq(relationships.evidenceIds, JSON.stringify([evidenceId])))
      .run();
    for (const rel of extraction.relationships || []) {
      db.insert(relationships)
        .values({
          sourceEntityId: rel.sourceEntityId,
          targetEntityId: rel.targetEntityId,
          type: rel.type,
          evidenceIds: JSON.stringify([evidenceId]),
          metadata: JSON.stringify(rel.metadata || {}),
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    await updateJob(jobId, { stage: "embeddings", progress: 75 });

    // Generate embedding
    try {
      const embedding = await generateEmbeddings(text);
      db.update(evidence)
        .set({ embedding: JSON.stringify(embedding) })
        .where(eq(evidence.id, evidenceId))
        .run();
    } catch (e) {
      console.warn("[worker] Embedding failed, continuing:", e);
    }

    await updateJob(jobId, { stage: "connections", progress: 85 });

    // Clean up old connections using OR (not AND)
    db.delete(evidenceConnections)
      .where(
        or(
          eq(evidenceConnections.evidenceIdA, evidenceId),
          eq(evidenceConnections.evidenceIdB, evidenceId),
        ),
      )
      .run();

    // Build graph and compute connection signals
    const allEvidence = db.select().from(evidence).all();
    const graph = buildEvidenceGraph(allEvidence);
    const signals = computeSignals(graph, evidenceId);

    for (const signal of signals) {
      const a = Math.min(evidenceId, signal.targetId);
      const b = Math.max(evidenceId, signal.targetId);

      db.insert(evidenceConnections)
        .values({
          evidenceIdA: a,
          evidenceIdB: b,
          signalType: signal.type,
          strength: signal.strength,
          reason: signal.reason,
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    await updateJob(jobId, { stage: "clusters", progress: 92 });

    // Detect clusters
    const clusters = detectClusters(graph);
    for (const cluster of clusters) {
      // Cluster persistence handled by graph module or add here if needed
    }

    await updateJob(jobId, { stage: "narratives", progress: 96 });

    // Hidden paths & contradictions
    findHiddenPaths(graph);
    detectContradictions(graph);

    await updateJob(jobId, {
      stage: "complete",
      progress: 100,
      status: "completed",
    });
  } catch (error: any) {
    console.error(`[worker] Failed evidence ${evidenceId}:`, error);
    await updateJob(jobId, {
      stage: "error",
      status: "failed",
      error: error.message || String(error),
    });
    throw error;
  }
}
