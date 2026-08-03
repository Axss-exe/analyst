import { db } from "@/db/client";
import {
  evidence,
  entities,
  evidenceEntities,
  timelineEvents,
  relationships,
  facts,
  evidenceConnections,
  graphClusters,
  narratives,
  stories,
  storyEvidence,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createJob,
  startStage,
  completeStage,
  failStage,
  completeJob,
  failJob,
} from "@/lib/jobs";
import { extractStructuredFacts } from "@/lib/ai/extraction";
import { evaluateStoryRelevance } from "@/lib/ai/similarity";
import { generateNarrativeFromCluster } from "@/lib/ai/stories";
import {
  buildGraph,
  computeSignals,
  findClusters,
  findHiddenPaths,
  findContradictions,
  detectNarratives,
} from "@/lib/graph";
import { createNotification } from "@/lib/notifications";
import type { ConnectionSignal, GraphCluster } from "@/types";

export function enqueueEvidenceJob(
  evidenceId: number,
  content: string,
  userId: number,
): string {
  const jobId = `ev-${evidenceId}-${Date.now()}`;

  createJob(jobId, [
    "Structured Extraction",
    "Save Facts & Entities",
    "Save Timeline & Relations",
    "Build Graph",
    "Compute Signals",
    "Find Clusters",
    "Find Hidden Paths",
    "Detect Narratives",
    "Generate Narrative",
    "Match Stories",
    "Finalize",
  ]);

  // Fire-and-forget background processing
  processEvidenceWorker(evidenceId, content, userId, jobId).catch(
    (err: any) => {
      console.error(`[worker] Unhandled error for job ${jobId}:`, err);
      failJob(jobId, err.message || "Unknown worker error");
    },
  );

  return jobId;
}

async function processEvidenceWorker(
  evidenceId: number,
  content: string,
  userId: number,
  jobId: string,
): Promise<void> {
  const evidenceRow = db
    .select()
    .from(evidence)
    .where(eq(evidence.id, evidenceId))
    .get();
  if (!evidenceRow) {
    failJob(jobId, `Evidence ${evidenceId} not found`);
    return;
  }

  if (!content || content.trim().length < 10) {
    completeStage(
      jobId,
      "Structured Extraction",
      "Content too short — skipping extraction",
    );
    completeJob(jobId, { evidenceId, skipped: true });
    return;
  }

  // ==================== Stage 1: Structured Extraction ====================
  startStage(
    jobId,
    "Structured Extraction",
    "Extracting facts, entities, events, relationships...",
  );
  let extraction: Awaited<ReturnType<typeof extractStructuredFacts>>;
  try {
    extraction = await extractStructuredFacts(content);
    completeStage(
      jobId,
      "Structured Extraction",
      `Extracted ${extraction.entities.length} entities, ${extraction.events.length} events, ${extraction.relationships.length} relations, ${extraction.claims.length} claims`,
    );
  } catch (err: any) {
    failStage(
      jobId,
      "Structured Extraction",
      `Extraction failed: ${err.message}`,
    );
    failJob(jobId, "Critical extraction failure — pipeline halted");
    return;
  }

  // Update evidence metadata and summary if needed
  const aiMetadata = {
    extractedEntities: extraction.entities.length,
    extractedEvents: extraction.events.length,
    extractedRelationships: extraction.relationships.length,
    extractedFacts:
      extraction.claims.length + extraction.causeEffectPairs.length,
    topics: extraction.topics,
    locations: extraction.locations,
    dates: extraction.dates,
    confidence: extraction.confidence,
    summaryGenerated: !evidenceRow.summary || evidenceRow.summary.length < 50,
  };

  const updateValues: { summary?: string; aiMetadata: string } = {
    aiMetadata: JSON.stringify(aiMetadata),
  };
  if (!evidenceRow.summary || evidenceRow.summary.length < 50) {
    updateValues.summary = extraction.summary;
  }
  db.update(evidence)
    .set(updateValues)
    .where(eq(evidence.id, evidenceId))
    .run();

  // ==================== Stage 2: Save Facts & Entities ====================
  startStage(
    jobId,
    "Save Facts & Entities",
    "Persisting entities and atomic facts...",
  );
  try {
    const nameToId = new Map<string, number>();

    for (const ent of extraction.entities) {
      const existing = db
        .select()
        .from(entities)
        .where(eq(entities.name, ent.name))
        .get();
      let entityId: number;
      if (!existing) {
        const newEnt = db
          .insert(entities)
          .values({
            name: ent.name,
            type: ent.type,
            aliases: JSON.stringify(ent.aliases),
            createdBy: userId,
          })
          .returning()
          .get();
        entityId = newEnt.id;
      } else {
        entityId = existing.id;
      }
      nameToId.set(ent.name, entityId);

      const linkExists = db
        .select()
        .from(evidenceEntities)
        .where(
          and(
            eq(evidenceEntities.evidenceId, evidenceId),
            eq(evidenceEntities.entityId, entityId),
          ),
        )
        .get();
      if (!linkExists) {
        db.insert(evidenceEntities).values({ evidenceId, entityId }).run();
      }
    }

    for (const claim of extraction.claims) {
      db.insert(facts)
        .values({
          subject: claim.subject || "unknown",
          predicate: "claims",
          object: claim.claim,
          evidenceId,
          confidence: claim.confidence,
        })
        .run();
    }

    for (const pair of extraction.causeEffectPairs) {
      db.insert(facts)
        .values({
          subject: pair.cause,
          predicate: "causes",
          object: pair.effect,
          evidenceId,
          confidence: 0.6,
        })
        .run();
    }

    completeStage(
      jobId,
      "Save Facts & Entities",
      `Saved ${nameToId.size} entities, ${extraction.claims.length + extraction.causeEffectPairs.length} facts`,
    );
  } catch (err: any) {
    failStage(jobId, "Save Facts & Entities", err.message);
  }

  // ==================== Stage 3: Save Timeline & Relations ====================
  startStage(
    jobId,
    "Save Timeline & Relations",
    "Persisting timeline events and relationships...",
  );
  try {
    const nameToId = new Map<string, number>();
    const allLinked = db
      .select()
      .from(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, evidenceId))
      .all();
    for (const link of allLinked) {
      const ent = db
        .select()
        .from(entities)
        .where(eq(entities.id, link.entityId))
        .get();
      if (ent) nameToId.set(ent.name, ent.id);
    }

    for (const evt of extraction.events) {
      const evtEntityIds = evt.entityNames
        .map((name) => nameToId.get(name))
        .filter((id): id is number => id !== undefined);

      db.insert(timelineEvents)
        .values({
          date: evt.date,
          title: evt.title,
          description: evt.description,
          evidenceId,
          entityIds: JSON.stringify(evtEntityIds),
          createdBy: userId,
        })
        .run();
    }

    for (const rel of extraction.relationships) {
      const sourceId = nameToId.get(rel.source);
      const targetId = nameToId.get(rel.target);
      if (!sourceId || !targetId) continue;

      db.insert(relationships)
        .values({
          sourceId,
          targetId,
          type: rel.type,
          confidence: 0.7,
          evidenceIds: JSON.stringify([evidenceId]),
          createdBy: userId,
        })
        .run();
    }

    completeStage(
      jobId,
      "Save Timeline & Relations",
      `Saved ${extraction.events.length} events, ${extraction.relationships.length} relationships`,
    );
  } catch (err: any) {
    failStage(jobId, "Save Timeline & Relations", err.message);
  }

  // ==================== Stage 4: Build Graph ====================
  startStage(jobId, "Build Graph", "Constructing in-memory evidence graph...");
  let graph: Awaited<ReturnType<typeof buildGraph>>;
  try {
    graph = await buildGraph();
    completeStage(
      jobId,
      "Build Graph",
      `${graph.evidenceNodes.size} evidence nodes, ${graph.entityNodes.size} entity nodes`,
    );
  } catch (err: any) {
    failStage(jobId, "Build Graph", err.message);
    failJob(jobId, "Graph build failure — cannot proceed with graph stages");
    return;
  }

  // ==================== Stage 5: Compute Signals ====================
  startStage(
    jobId,
    "Compute Signals",
    "Computing explainable connection signals...",
  );
  try {
    db.delete(evidenceConnections)
      .where(
        and(
          eq(evidenceConnections.evidenceIdA, evidenceId),
          eq(evidenceConnections.evidenceIdB, evidenceId),
        ),
      )
      .run();

    const signals = await computeSignals(graph);

    for (const signal of signals) {
      db.insert(evidenceConnections)
        .values({
          evidenceIdA: signal.evidenceIdA,
          evidenceIdB: signal.evidenceIdB,
          signalType: signal.signalType,
          strength: signal.strength,
          reason: signal.reason,
          metadata: signal.metadata ? JSON.stringify(signal.metadata) : null,
        })
        .run();
    }

    completeStage(
      jobId,
      "Compute Signals",
      `${signals.length} signals computed`,
    );
  } catch (err: any) {
    failStage(jobId, "Compute Signals", err.message);
  }

  // ==================== Stage 6: Find Clusters ====================
  startStage(jobId, "Find Clusters", "Detecting evidence clusters...");
  let savedClusters: GraphCluster[] = [];
  try {
    const clusterResult = findClusters(graph);

    db.delete(graphClusters).run();

    for (const cluster of clusterResult.clusters) {
      const saved = db
        .insert(graphClusters)
        .values({
          name: cluster.name,
          description: cluster.description,
          evidenceIds: JSON.stringify(cluster.evidenceIds),
          entityIds: JSON.stringify(cluster.entityIds),
          density: cluster.density,
          status: cluster.status,
        })
        .returning()
        .get();

      savedClusters.push({ ...cluster, id: saved.id });
    }

    completeStage(
      jobId,
      "Find Clusters",
      `${savedClusters.length} clusters found`,
    );
  } catch (err: any) {
    failStage(jobId, "Find Clusters", err.message);
  }

  // ==================== Stage 7: Find Hidden Paths ====================
  startStage(
    jobId,
    "Find Hidden Paths",
    "Searching for indirect connections...",
  );
  let pathResult: ReturnType<typeof findHiddenPaths>;
  let contradictionResult: Awaited<ReturnType<typeof findContradictions>> = [];
  try {
    pathResult = findHiddenPaths(graph);
    contradictionResult = await findContradictions(graph);
    completeStage(
      jobId,
      "Find Hidden Paths",
      `${pathResult.hiddenPaths.length} hidden paths, ${pathResult.bridgeNodes.length} bridge nodes, ${contradictionResult.length} contradictions`,
    );
  } catch (err: any) {
    failStage(jobId, "Find Hidden Paths", err.message);
    pathResult = { hiddenPaths: [], bridgeNodes: [] };
  }

  // ==================== Stage 8: Detect Narratives ====================
  startStage(
    jobId,
    "Detect Narratives",
    "Identifying emerging narrative patterns...",
  );
  try {
    const narrativeResult = detectNarratives(graph, savedClusters);

    db.delete(narratives).where(eq(narratives.generationType, "auto")).run();

    for (const nar of narrativeResult.narratives) {
      db.insert(narratives)
        .values({
          title: nar.title,
          overview: nar.overview,
          clusterIds: JSON.stringify(nar.clusterIds),
          evidenceIds: JSON.stringify(nar.evidenceIds),
          confidence: nar.confidence,
          generationType: "auto",
          createdBy: userId,
        })
        .run();
    }

    completeStage(
      jobId,
      "Detect Narratives",
      `${narrativeResult.narratives.length} narratives detected`,
    );
  } catch (err: any) {
    failStage(jobId, "Detect Narratives", err.message);
  }

  // ==================== Stage 9: Generate Narrative (LLM) ====================
  startStage(
    jobId,
    "Generate Narrative",
    "LLM narrating graph-backed discoveries...",
  );
  try {
    const relevantClusters = savedClusters.filter((c) =>
      c.evidenceIds.includes(evidenceId),
    );
    const topCluster = relevantClusters.sort(
      (a, b) => b.density - a.density,
    )[0];

    if (topCluster) {
      const clusterEvidenceSummaries = topCluster.evidenceIds
        .map((id) => graph.evidenceNodes.get(id))
        .filter(Boolean)
        .map((node) => ({
          id: node!.id,
          title: node!.title,
          summary: node!.summary,
        }));

      const clusterSignals: ConnectionSignal[] = [];
      const seenKeys = new Set<string>();
      for (const [key, signals] of graph.signalMatrix) {
        const ids = key.split(":").map(Number);
        if (
          topCluster.evidenceIds.includes(ids[0]) &&
          topCluster.evidenceIds.includes(ids[1])
        ) {
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          clusterSignals.push(...signals);
        }
      }

      const narrativeOutput = await generateNarrativeFromCluster({
        cluster: topCluster,
        hiddenPaths: pathResult.hiddenPaths.filter(
          (p) =>
            topCluster.evidenceIds.includes(p.path[0]) ||
            topCluster.evidenceIds.includes(p.path[p.path.length - 1]) ||
            p.path.some((id) => topCluster.evidenceIds.includes(id)),
        ),
        bridgeNodes: pathResult.bridgeNodes,
        signals: clusterSignals,
        contradictions: contradictionResult.filter(
          (c) =>
            topCluster.evidenceIds.includes(c.evidenceIdA) ||
            topCluster.evidenceIds.includes(c.evidenceIdB),
        ),
        evidenceSummaries: clusterEvidenceSummaries,
      });

      const clusterIdsJson = JSON.stringify([topCluster.id]);
      const existingNarrative = db
        .select()
        .from(narratives)
        .where(
          and(
            eq(narratives.generationType, "auto"),
            eq(narratives.clusterIds, clusterIdsJson),
          ),
        )
        .get();

      if (existingNarrative) {
        db.update(narratives)
          .set({
            title: narrativeOutput.title,
            overview: narrativeOutput.overview,
            confidence: Math.max(existingNarrative.confidence, 0.6),
          })
          .where(eq(narratives.id, existingNarrative.id))
          .run();
      } else {
        db.insert(narratives)
          .values({
            title: narrativeOutput.title,
            overview: narrativeOutput.overview,
            clusterIds: clusterIdsJson,
            evidenceIds: JSON.stringify(topCluster.evidenceIds),
            confidence: 0.6,
            generationType: "auto",
            createdBy: userId,
          })
          .run();
      }

      completeStage(
        jobId,
        "Generate Narrative",
        `Generated narrative: "${narrativeOutput.title}"`,
      );
    } else {
      completeStage(jobId, "Generate Narrative", "No relevant cluster found");
    }
  } catch (err: any) {
    failStage(jobId, "Generate Narrative", err.message);
  }

  // ==================== Stage 10: Match Stories ====================
  startStage(
    jobId,
    "Match Stories",
    "Evaluating relevance to existing stories...",
  );
  try {
    const allStories = db
      .select()
      .from(stories)
      .where(eq(stories.status, "active"))
      .all();
    const evidenceSummary = evidenceRow.summary || extraction.summary;
    const matches: Array<{
      storyId: number;
      score: number;
      reasoning: string;
    }> = [];

    for (const story of allStories) {
      try {
        const relevance = await evaluateStoryRelevance(
          evidenceSummary,
          story.title,
          story.overview,
        );
        if (relevance.score >= 0.4) {
          matches.push({
            storyId: story.id,
            score: relevance.score,
            reasoning: relevance.reasoning,
          });
        }
      } catch {
        // skip
      }
    }

    for (const match of matches) {
      const existingLink = db
        .select()
        .from(storyEvidence)
        .where(
          and(
            eq(storyEvidence.storyId, match.storyId),
            eq(storyEvidence.evidenceId, evidenceId),
          ),
        )
        .get();

      if (!existingLink) {
        db.insert(storyEvidence)
          .values({
            storyId: match.storyId,
            evidenceId,
            confidence: match.score,
            relationshipType: "auto_suggested",
          })
          .run();
      }

      await createNotification({
        userId: userId,
        type: "story_match",
        title: "Story Match Suggestion",
        message: `Evidence "${evidenceRow.title}" may be relevant to story (score: ${(match.score * 100).toFixed(0)}%)`,
        relatedObjectType: "story",
        relatedObjectId: match.storyId,
      });
    }

    completeStage(jobId, "Match Stories", `${matches.length} story matches`);
  } catch (err: any) {
    failStage(jobId, "Match Stories", err.message);
  }

  // ==================== Stage 11: Finalize ====================
  completeStage(jobId, "Finalize", "Processing complete");
  completeJob(jobId, { evidenceId, processedAt: Date.now() });
}
