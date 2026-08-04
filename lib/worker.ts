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
import { eq, and, or } from "drizzle-orm";
import { extractStructuredFacts } from "@/lib/ai/extraction";
import { evaluateSourceConfidence } from "@/lib/ai/confidence";
import {
  buildGraph,
  computeSignals,
  findClusters,
  findHiddenPaths,
  findContradictions,
  detectNarratives,
} from "@/lib/graph";
import { updateJob, enqueueJob } from "@/lib/jobs";

export function enqueueEvidenceJob(
  evidenceId: number,
  _content: string,
  userId: number,
): string {
  const jobId = enqueueJob([
    "init",
    "extraction",
    "confidence",
    "entities",
    "facts",
    "timeline",
    "relationships",
    "connections",
    "clusters",
    "narratives",
    "complete",
  ]);

  console.log(`[worker] Enqueued job ${jobId} for evidence ${evidenceId}`);

  setImmediate(() => {
    processEvidence(evidenceId, jobId, userId).catch((err) => {
      console.error(`[worker] FATAL: Job ${jobId} crashed:`, err);
      try {
        updateJob(jobId, {
          stage: "error",
          status: "failed",
          error: err?.message || String(err),
        });
      } catch (e) {
        console.error(`[worker] Could not update job ${jobId} after crash:`, e);
      }
    });
  });

  return jobId;
}

export async function processEvidence(
  evidenceId: number,
  jobId: string,
  userId: number,
) {
  console.log(`[worker] Starting job ${jobId} for evidence ${evidenceId}`);

  updateJob(jobId, { stage: "init", progress: 5, status: "running" });

  const rows = db
    .select()
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .all();
  if (!rows || rows.length === 0) {
    throw new Error(`Evidence ${evidenceId} not found in DB`);
  }
  const item = rows[0];

  // FIX: Read content first, fall back to summary
  const text = item.content || item.summary || "";
  console.log(
    `[worker] Evidence ${evidenceId} text length: ${text.length} chars (content: ${item.content?.length || 0}, summary: ${item.summary?.length || 0})`,
  );

  if (!text.trim()) {
    console.log(
      `[worker] Evidence ${evidenceId} has no text, skipping extraction`,
    );
    updateJob(jobId, {
      stage: "complete",
      progress: 100,
      status: "completed",
    });
    return;
  }

  // ─── STAGE: extraction ───
  let extraction: any;
  try {
    updateJob(jobId, { stage: "extraction", progress: 15 });
    console.log(`[worker] Calling extractStructuredFacts for ${evidenceId}...`);
    extraction = await extractStructuredFacts(text);
    console.log(
      `[worker] Extraction returned: ${extraction.entities?.length || 0} entities, ${extraction.events?.length || 0} events, ${extraction.relationships?.length || 0} relationships`,
    );
  } catch (exErr: any) {
    console.error(`[worker] Extraction failed for ${evidenceId}:`, exErr);
    extraction = {
      confidence: 0.5,
      entities: [],
      events: [],
      relationships: [],
      claims: [],
      topics: [],
      summary: "",
    };
  }

  // ─── STAGE: confidence ───
  let confidenceScore = extraction.confidence ?? 0.5;
  let confidenceEvaluation: any = null;

  try {
    updateJob(jobId, { stage: "confidence", progress: 20 });
    console.log(
      `[worker] Calling evaluateSourceConfidence for ${evidenceId}...`,
    );
    const evalResult = await evaluateSourceConfidence(
      text,
      item.sourceType,
      item.source,
    );
    confidenceScore = evalResult.score;
    confidenceEvaluation = {
      score: evalResult.score,
      reasoning: evalResult.reasoning,
      factors: evalResult.factors,
    };
    console.log(
      `[worker] Confidence: ${confidenceScore} — ${evalResult.reasoning.slice(0, 80)}...`,
    );
  } catch (confErr: any) {
    console.warn(`[worker] Confidence eval failed:`, confErr.message);
    confidenceEvaluation = {
      score: confidenceScore,
      reasoning:
        "Detailed confidence evaluation failed. Using extraction fallback.",
      factors: [`Extraction confidence: ${confidenceScore}`],
    };
  }

  try {
    const existingMeta =
      typeof item.aiMetadata === "string"
        ? JSON.parse(item.aiMetadata)
        : item.aiMetadata || {};

    db.update(evidence)
      .set({
        confidence: confidenceScore,
        summary:
          !item.summary || item.summary.trim().length < 50
            ? extraction.summary || item.summary || ""
            : item.summary,
        aiMetadata: JSON.stringify({
          ...existingMeta,
          extraction,
          confidenceEvaluation,
          processedAt: new Date().toISOString(),
        }),
      })
      .where(eq(evidence.id, evidenceId))
      .run();
    console.log(
      `[worker] Saved confidence ${confidenceScore} to evidence ${evidenceId}`,
    );
  } catch (dbErr: any) {
    console.error(`[worker] Failed to save metadata:`, dbErr);
  }

  // ─── STAGE: entities ───
  const entityNameToId = new Map<string, number>();
  try {
    updateJob(jobId, { stage: "entities", progress: 30 });
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
        entityNameToId.set(ent.name, entityId);
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
            aliases: JSON.stringify(ent.aliases || []),
            metadata: JSON.stringify(ent.metadata || {}),
            createdBy: userId,
            createdAt: new Date().toISOString(),
          })
          .run();
        entityId = Number(result.lastInsertRowid);
        entityNameToId.set(ent.name, entityId);
      }

      if (!seenEntityIds.has(entityId)) {
        seenEntityIds.add(entityId);
        try {
          db.insert(evidenceEntities).values({ evidenceId, entityId }).run();
        } catch {
          // Already linked
        }
      }
    }
    console.log(
      `[worker] Saved ${seenEntityIds.size} entities for evidence ${evidenceId}`,
    );
  } catch (entErr: any) {
    console.error(`[worker] Entity stage failed:`, entErr);
  }

  // ─── STAGE: facts ───
  try {
    updateJob(jobId, { stage: "facts", progress: 45 });
    db.delete(facts).where(eq(facts.evidenceId, evidenceId)).run();
    for (const claim of extraction.claims || []) {
      db.insert(facts)
        .values({
          evidenceId,
          subject: claim.subject || "Unknown",
          predicate: "claims",
          object: claim.claim,
          confidence: claim.confidence ?? 0.5,
          createdAt: new Date().toISOString(),
        })
        .run();
    }
    console.log(
      `[worker] Saved ${extraction.claims?.length || 0} facts for evidence ${evidenceId}`,
    );
  } catch (factErr: any) {
    console.error(`[worker] Facts stage failed:`, factErr);
  }

  // ─── STAGE: timeline ───
  try {
    updateJob(jobId, { stage: "timeline", progress: 55 });
    db.delete(timelineEvents)
      .where(eq(timelineEvents.evidenceId, evidenceId))
      .run();
    for (const evt of extraction.events || []) {
      const evtEntityIds = (evt.entityNames || [])
        .map((name: string) => entityNameToId.get(name))
        .filter((id: number | undefined): id is number => id !== undefined);

      db.insert(timelineEvents)
        .values({
          date: evt.date || new Date().toISOString().split("T")[0],
          title: evt.title || "Event",
          description: evt.description || "",
          evidenceId,
          entityIds: JSON.stringify(evtEntityIds),
          createdBy: userId,
          createdAt: new Date().toISOString(),
        })
        .run();
    }
    console.log(
      `[worker] Saved ${extraction.events?.length || 0} timeline events for evidence ${evidenceId}`,
    );
  } catch (tlErr: any) {
    console.error(`[worker] Timeline stage failed:`, tlErr);
  }

  // ─── STAGE: relationships ───
  try {
    updateJob(jobId, { stage: "relationships", progress: 65 });
    db.delete(relationships)
      .where(eq(relationships.evidenceIds, JSON.stringify([evidenceId])))
      .run();
    for (const rel of extraction.relationships || []) {
      const sourceId = entityNameToId.get(rel.source);
      const targetId = entityNameToId.get(rel.target);
      if (!sourceId || !targetId) continue;

      db.insert(relationships)
        .values({
          sourceId,
          targetId,
          type: rel.type,
          confidence: 0.5,
          evidenceIds: JSON.stringify([evidenceId]),
          createdBy: userId,
          createdAt: new Date().toISOString(),
        })
        .run();
    }
    console.log(
      `[worker] Saved ${extraction.relationships?.length || 0} relationships for evidence ${evidenceId}`,
    );
  } catch (relErr: any) {
    console.error(`[worker] Relationships stage failed:`, relErr);
  }

  // ─── STAGE: connections ───
  try {
    updateJob(jobId, { stage: "connections", progress: 85 });
    db.delete(evidenceConnections)
      .where(
        or(
          eq(evidenceConnections.evidenceIdA, evidenceId),
          eq(evidenceConnections.evidenceIdB, evidenceId),
        ),
      )
      .run();

    const allEvidence = db.select().from(evidence).all();
    const graph = await buildGraph(allEvidence);
    const allSignals = computeSignals();
    const signals = allSignals.filter(
      (s: any) => s.evidenceIdA === evidenceId || s.evidenceIdB === evidenceId,
    );

    for (const signal of signals) {
      const a = Math.min(
        evidenceId,
        signal.evidenceIdA === evidenceId
          ? signal.evidenceIdB
          : signal.evidenceIdA,
      );
      const b = Math.max(
        evidenceId,
        signal.evidenceIdA === evidenceId
          ? signal.evidenceIdB
          : signal.evidenceIdA,
      );
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
    console.log(
      `[worker] Computed ${signals.length} connection signals for evidence ${evidenceId}`,
    );
  } catch (connErr: any) {
    console.error(`[worker] Connections stage failed:`, connErr);
  }

  // ─── STAGE: clusters ───
  try {
    updateJob(jobId, { stage: "clusters", progress: 92 });
    findClusters();
  } catch (clErr: any) {
    console.error(`[worker] Cluster stage failed:`, clErr);
  }

  // ─── STAGE: narratives ───
  try {
    updateJob(jobId, { stage: "narratives", progress: 96 });
    const allEvidence = db.select().from(evidence).all();
    const graph = await buildGraph(allEvidence);
    const clusters = findClusters();
    findHiddenPaths();
    findContradictions();
    detectNarratives(graph, clusters);
  } catch (narErr: any) {
    console.error(`[worker] Narrative stage failed:`, narErr);
  }

  updateJob(jobId, {
    stage: "complete",
    progress: 100,
    status: "completed",
  });
  console.log(`[worker] Job ${jobId} completed for evidence ${evidenceId}`);
}
