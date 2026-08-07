/**
 * ATIS v4 — Background Worker Pipeline
 * 
 * Processes evidence ingestion and story discovery asynchronously.
 * 
 * Pipeline stages:
 *   1. Extract structured facts + intelligence nodes (1 LLM call)
 *   2. Store facts in DB
 *   3. Store intelligence nodes (programs, events, problems, outcomes, actors)
 *   4. Store single-document story assessment
 *   5. Store v3 entities and relationships (backward compatible)
 *   6. Rebuild story-bearing relationships (algorithmic, all pairs)
 *   7. Score relationships
 *   8. Build Context Graph + Story Graph
 *   9. Detect story seeds
 *  10. Expand seeds + detect single-document stories
 *  11. Validate coherence
 *  12. Store story candidates
 *  13. Generate narratives (v3 preserved)
 * 
 * The worker runs in-process. For high-volume deployments,
 * consider extracting to a separate process or queue.
 */

import { db } from "@/db";
import {
  evidence,
  facts,
  entities,
  evidenceEntities,
  programs,
  events,
  problems,
  outcomes,
  actors,
  evidencePrograms,
  evidenceEvents,
  evidenceProblems,
  evidenceOutcomes,
  evidenceActors,
  evidenceStoryAssessment,
  storyRelationships,
  storyCandidates,
  storyCandidateEvidence,
  graphClusters,
  narratives,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  extractStructuredFacts,
  type UnifiedExtractionResult,
} from "@/lib/ai/extraction";
import {
  normalizeName,
  type SingleDocumentAssessment,
} from "@/lib/ai/programs";
import {
  runStoryDiscoveryPipeline,
  persistStoryDiscovery,
  type StoryDiscoveryInput,
} from "@/lib/reasoning/story-discovery";
import {
  type EvidenceIntelligence,
  type EvidenceQualityProfile,
  type EvidenceContext,
  detectGenericInstitutionalPage,
} from "@/lib/graph";
import { generateNarrativeFromCluster } from "@/lib/ai/stories";
import { updateJobStatus, type JobStatus } from "@/lib/jobs";

// ═════════════════════════════════════════════════════════════════
// 1. JOB PROCESSOR
// ═════════════════════════════════════════════════════════════════

export interface WorkerJob {
  id: string;
  evidenceId: number;
  status: JobStatus;
  stage: string;
  progress: number;
  error?: string;
}

/**
 * Process a single evidence ingestion job.
 * 
 * This is the main entry point called by the job queue.
 * It runs the full v4 pipeline from extraction to story discovery.
 */
export async function processEvidenceJob(job: WorkerJob): Promise<void> {
  const startTime = Date.now();
  console.log(`[worker] Starting job ${job.id} for evidence ${job.evidenceId}`);

  try {
    // ── Stage 1: Fetch evidence ────────────────────────────────
    await updateStage(job, "fetch_evidence", 5);
    const evidenceRow = await db.select().from(evidence).where(eq(evidence.id, job.evidenceId)).get();
    if (!evidenceRow) {
      throw new Error(`Evidence ${job.evidenceId} not found`);
    }

    // ── Stage 2: Extract structured intelligence ───────────────
    await updateStage(job, "extraction", 15);
    const extractionResult = await extractStructuredFacts(evidenceRow.content, job.evidenceId);

    // ── Stage 3: Store v3 facts ────────────────────────────────
    await updateStage(job, "store_facts", 25);
    await storeFacts(extractionResult.structured.facts, job.evidenceId);

    // ── Stage 4: Store v3 entities ─────────────────────────────
    await updateStage(job, "store_entities", 30);
    await storeEntities(extractionResult.structured.entities, job.evidenceId);

    // ── Stage 5: Store v4 intelligence nodes ───────────────────
    await updateStage(job, "store_intelligence", 40);
    const intelligenceIds = await storeIntelligenceNodes(
      extractionResult.intelligence,
      job.evidenceId
    );

    // ── Stage 6: Store single-document assessment ──────────────
    await updateStage(job, "store_assessment", 45);
    await storeSingleDocumentAssessment(job.evidenceId, extractionResult.singleDocumentAssessment);

    // ── Stage 7: Rebuild story graph (full corpus) ─────────────
    await updateStage(job, "rebuild_graph", 60);
    const allEvidence = await db.select({ id: evidence.id }).from(evidence);
    const allEvidenceIds = allEvidence.map((e) => e.id);

    if (allEvidenceIds.length >= 2) {
      await rebuildStoryGraph(allEvidenceIds);
    }

    // ── Stage 8: Generate narratives ───────────────────────────
    await updateStage(job, "generate_narratives", 85);
    await generateNarrativesForValidatedStories();

    // ── Done ───────────────────────────────────────────────────
    await updateStage(job, "complete", 100);
    const duration = Date.now() - startTime;
    console.log(`[worker] Job ${job.id} completed in ${duration}ms`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${job.id} failed:`, errorMessage);
    await updateJobStatus(job.id, "failed", errorMessage);
  }
}

// ═════════════════════════════════════════════════════════════════
// 2. STAGE HELPERS
// ═════════════════════════════════════════════════════════════════

async function updateStage(job: WorkerJob, stage: string, progress: number): Promise<void> {
  job.stage = stage;
  job.progress = progress;
  await updateJobStatus(job.id, "processing", undefined, stage, progress);
  console.log(`[worker] Job ${job.id}: ${stage} (${progress}%)`);
}

// ═════════════════════════════════════════════════════════════════
// 3. FACT STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeFacts(
  factsList: Array<{ subject: string; predicate: string; object: string; evidenceId: number; confidence: number }>,
  evidenceId: number
): Promise<void> {
  if (factsList.length === 0) return;

  try {
    for (const fact of factsList) {
      await db.insert(facts).values({
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        evidenceId,
        confidence: fact.confidence,
      });
    }
  } catch (err) {
    console.error(`[worker] Failed to store facts for E${evidenceId}:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// 4. ENTITY STORAGE (v3 compatible)
// ═════════════════════════════════════════════════════════════════

async function storeEntities(
  entitiesList: Array<{ name: string; type: string; mentions: number; context?: string }>,
  evidenceId: number
): Promise<void> {
  if (entitiesList.length === 0) return;

  try {
    for (const ent of entitiesList) {
      // Check if entity already exists
      const existing = await db.select().from(entities)
        .where(eq(entities.normalizedName, normalizeName(ent.name)))
        .get();

      let entityId: number;
      if (existing) {
        entityId = existing.id;
      } else {
        const result = await db.insert(entities).values({
          name: ent.name,
          type: ent.type,
          normalizedName: normalizeName(ent.name),
        }).returning({ id: entities.id });
        entityId = result[0].id;
      }

      await db.insert(evidenceEntities).values({
        evidenceId,
        entityId,
        mentions: ent.mentions,
        context: ent.context,
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.error(`[worker] Failed to store entities for E${evidenceId}:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// 5. INTELLIGENCE NODE STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeIntelligenceNodes(
  intelligence: import("@/lib/graph/story-types").StructuredIntelligence,
  evidenceId: number
): Promise<{
  programIds: number[];
  eventIds: number[];
  problemIds: number[];
  outcomeIds: number[];
  actorIds: number[];
}> {
  const result = {
    programIds: [] as number[],
    eventIds: [] as number[],
    problemIds: [] as number[],
    outcomeIds: [] as number[],
    actorIds: [] as number[],
  };

  try {
    // Programs
    for (const prog of intelligence.programs) {
      const existing = await db.select().from(programs)
        .where(eq(programs.normalizedName, prog.normalizedName))
        .get();

      let programId: number;
      if (existing) {
        programId = existing.id;
      } else {
        const insertResult = await db.insert(programs).values({
          name: prog.name,
          normalizedName: prog.normalizedName,
          description: prog.description,
          type: prog.type,
        }).returning({ id: programs.id });
        programId = insertResult[0].id;
      }

      result.programIds.push(programId);
      await db.insert(evidencePrograms).values({
        evidenceId,
        programId,
        confidence: 0.95,
        explicit: true,
        reason: "Extracted from document text",
      }).onConflictDoNothing();
    }

    // Events
    for (const evt of intelligence.events) {
      const existing = await db.select().from(events)
        .where(eq(events.normalizedName, evt.normalizedName))
        .get();

      let eventId: number;
      if (existing) {
        eventId = existing.id;
      } else {
        const insertResult = await db.insert(events).values({
          name: evt.name,
          normalizedName: evt.normalizedName,
          description: evt.description,
          temporalInfo: evt.temporalInfo,
          eventType: evt.eventType,
        }).returning({ id: events.id });
        eventId = insertResult[0].id;
      }

      result.eventIds.push(eventId);
      await db.insert(evidenceEvents).values({
        evidenceId,
        eventId,
        confidence: 0.90,
        explicit: true,
        reason: "Extracted from document text",
      }).onConflictDoNothing();
    }

    // Problems
    for (const prob of intelligence.problems) {
      const existing = await db.select().from(problems)
        .where(eq(problems.normalizedName, prob.normalizedName))
        .get();

      let problemId: number;
      if (existing) {
        problemId = existing.id;
      } else {
        const insertResult = await db.insert(problems).values({
          name: prob.name,
          normalizedName: prob.normalizedName,
          description: prob.description,
          severity: prob.severity,
        }).returning({ id: problems.id });
        problemId = insertResult[0].id;
      }

      result.problemIds.push(problemId);
      await db.insert(evidenceProblems).values({
        evidenceId,
        problemId,
        confidence: 0.85,
        explicit: true,
        reason: "Extracted from document text",
      }).onConflictDoNothing();
    }

    // Outcomes
    for (const out of intelligence.outcomes) {
      const existing = await db.select().from(outcomes)
        .where(eq(outcomes.normalizedName, out.normalizedName))
        .get();

      let outcomeId: number;
      if (existing) {
        outcomeId = existing.id;
      } else {
        const insertResult = await db.insert(outcomes).values({
          name: out.name,
          normalizedName: out.normalizedName,
          description: out.description,
          metric: out.metric,
        }).returning({ id: outcomes.id });
        outcomeId = insertResult[0].id;
      }

      result.outcomeIds.push(outcomeId);
      await db.insert(evidenceOutcomes).values({
        evidenceId,
        outcomeId,
        confidence: 0.85,
        explicit: true,
        reason: "Extracted from document text",
      }).onConflictDoNothing();
    }

    // Actors
    for (const actor of intelligence.actors) {
      const existing = await db.select().from(actors)
        .where(eq(actors.normalizedName, actor.normalizedName))
        .get();

      let actorId: number;
      if (existing) {
        actorId = existing.id;
      } else {
        const insertResult = await db.insert(actors).values({
          name: actor.name,
          normalizedName: actor.normalizedName,
          actorType: actor.actorType,
        }).returning({ id: actors.id });
        actorId = insertResult[0].id;
      }

      result.actorIds.push(actorId);
      await db.insert(evidenceActors).values({
        evidenceId,
        actorId,
        confidence: 0.90,
        explicit: true,
        reason: "Extracted from document text",
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.error(`[worker] Failed to store intelligence nodes for E${evidenceId}:`, err);
  }

  return result;
}

// ═════════════════════════════════════════════════════════════════
// 6. SINGLE-DOCUMENT ASSESSMENT STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeSingleDocumentAssessment(
  evidenceId: number,
  assessment: SingleDocumentAssessment
): Promise<void> {
  try {
    await db.insert(evidenceStoryAssessment).values({
      evidenceId,
      hasProblem: assessment.hasProblem,
      hasIntervention: assessment.hasIntervention,
      hasOutcome: assessment.hasOutcome,
      hasProgram: assessment.hasProgram,
      hasEvent: assessment.hasEvent,
      narrativeCompletenessScore: assessment.narrativeCompletenessScore,
      canBeSingleDocumentStory: assessment.canBeSingleDocumentStory,
      assessmentReason: assessment.assessmentReason,
    }).onConflictDoUpdate({
      target: evidenceStoryAssessment.evidenceId,
      set: {
        hasProblem: assessment.hasProblem,
        hasIntervention: assessment.hasIntervention,
        hasOutcome: assessment.hasOutcome,
        hasProgram: assessment.hasProgram,
        hasEvent: assessment.hasEvent,
        narrativeCompletenessScore: assessment.narrativeCompletenessScore,
        canBeSingleDocumentStory: assessment.canBeSingleDocumentStory,
        assessmentReason: assessment.assessmentReason,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(`[worker] Failed to store assessment for E${evidenceId}:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// 7. STORY GRAPH REBUILD
// ═════════════════════════════════════════════════════════════════

/**
 * Rebuild the entire story graph from all evidence in the corpus.
 * 
 * This is called after each evidence ingestion. For small corpora
 * (< 1000 docs), full rebuilds are fast enough. For larger corpora,
 * consider incremental updates.
 */
async function rebuildStoryGraph(allEvidenceIds: number[]): Promise<void> {
  console.log(`[worker] Rebuilding story graph for ${allEvidenceIds.length} evidence items`);

  try {
    // Load all intelligence nodes from DB
    const intelligenceMap = await loadIntelligenceMap(allEvidenceIds);
    const singleDocAssessments = await loadSingleDocAssessments(allEvidenceIds);
    const qualityProfiles = await buildQualityProfiles(allEvidenceIds);
    const evidenceContexts = await buildEvidenceContexts(allEvidenceIds, intelligenceMap);

    // Run the v4 discovery pipeline
    const input: StoryDiscoveryInput = {
      evidenceIds: allEvidenceIds,
      intelligenceMap,
      singleDocAssessments,
      qualityProfiles,
      evidenceContexts,
    };

    const output = runStoryDiscoveryPipeline(input);

    // Persist results
    await persistStoryDiscovery(output);

    console.log(
      `[worker] Graph rebuild complete: ${output.stats.storyGraphEdges} story edges, ` +
      `${output.stats.seedsDetected} seeds, ${output.stats.validatedStories} validated stories`
    );
  } catch (err) {
    console.error("[worker] Graph rebuild failed:", err);
  }
}

// ═════════════════════════════════════════════════════════════════
// 8. DATA LOADING HELPERS
// ═════════════════════════════════════════════════════════════════

async function loadIntelligenceMap(
  evidenceIds: number[]
): Promise<Map<number, EvidenceIntelligence>> {
  const map = new Map<number, EvidenceIntelligence>();

  for (const eid of evidenceIds) {
    // Load programs
    const progRows = await db.select({
      id: programs.id,
      name: programs.name,
      normalizedName: programs.normalizedName,
      description: programs.description,
      type: programs.type,
    })
      .from(evidencePrograms)
      .innerJoin(programs, eq(evidencePrograms.programId, programs.id))
      .where(eq(evidencePrograms.evidenceId, eid))
      .all();

    // Load events
    const eventRows = await db.select({
      id: events.id,
      name: events.name,
      normalizedName: events.normalizedName,
      description: events.description,
      temporalInfo: events.temporalInfo,
      eventType: events.eventType,
    })
      .from(evidenceEvents)
      .innerJoin(events, eq(evidenceEvents.eventId, events.id))
      .where(eq(evidenceEvents.evidenceId, eid))
      .all();

    // Load problems
    const problemRows = await db.select({
      id: problems.id,
      name: problems.name,
      normalizedName: problems.normalizedName,
      description: problems.description,
      severity: problems.severity,
    })
      .from(evidenceProblems)
      .innerJoin(problems, eq(evidenceProblems.problemId, problems.id))
      .where(eq(evidenceProblems.evidenceId, eid))
      .all();

    // Load outcomes
    const outcomeRows = await db.select({
      id: outcomes.id,
      name: outcomes.name,
      normalizedName: outcomes.normalizedName,
      description: outcomes.description,
      metric: outcomes.metric,
    })
      .from(evidenceOutcomes)
      .innerJoin(outcomes, eq(evidenceOutcomes.outcomeId, outcomes.id))
      .where(eq(evidenceOutcomes.evidenceId, eid))
      .all();

    // Load actors
    const actorRows = await db.select({
      id: actors.id,
      name: actors.name,
      normalizedName: actors.normalizedName,
      actorType: actors.actorType,
    })
      .from(evidenceActors)
      .innerJoin(actors, eq(evidenceActors.actorId, actors.id))
      .where(eq(evidenceActors.evidenceId, eid))
      .all();

    // Load evidence text
    const evRow = await db.select({ content: evidence.content, title: evidence.title })
      .from(evidence)
      .where(eq(evidence.id, eid))
      .get();

    map.set(eid, {
      evidenceId: eid,
      programs: progRows,
      events: eventRows,
      problems: problemRows,
      outcomes: outcomeRows,
      actors: actorRows,
      text: evRow?.content || "",
    });
  }

  return map;
}

async function loadSingleDocAssessments(
  evidenceIds: number[]
): Promise<Map<number, { canBeSingleDocumentStory: boolean; narrativeCompletenessScore: number; assessmentReason: string }>> {
  const map = new Map<number, { canBeSingleDocumentStory: boolean; narrativeCompletenessScore: number; assessmentReason: string }>();

  const rows = await db.select()
    .from(evidenceStoryAssessment)
    .where(inArray(evidenceStoryAssessment.evidenceId, evidenceIds))
    .all();

  for (const row of rows) {
    map.set(row.evidenceId, {
      canBeSingleDocumentStory: row.canBeSingleDocumentStory,
      narrativeCompletenessScore: row.narrativeCompletenessScore,
      assessmentReason: row.assessmentReason || "",
    });
  }

  return map;
}

async function buildQualityProfiles(
  evidenceIds: number[]
): Promise<Map<number, EvidenceQualityProfile>> {
  const map = new Map<number, EvidenceQualityProfile>();

  for (const eid of evidenceIds) {
    const evRow = await db.select({ content: evidence.content }).from(evidence).where(eq(evidence.id, eid)).get();
    const progCount = await db.select({ count: evidencePrograms.programId })
      .from(evidencePrograms)
      .where(eq(evidencePrograms.evidenceId, eid))
      .all();
    const factCount = await db.select({ count: facts.id })
      .from(facts)
      .where(eq(facts.evidenceId, eid))
      .all();
    const entityCount = await db.select({ count: evidenceEntities.entityId })
      .from(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, eid))
      .all();

    const textLength = evRow?.content?.length || 0;
    const hasMetric = evRow?.content?.match(/\d+[,\.]?\d*\s*(households|MT|ha|km|million|billion|percent|%)/i) !== null;

    map.set(eid, {
      textLength,
      extractionConfidence: 0.85,
      hasProgramReference: progCount.length > 0,
      hasSpecificMetric: hasMetric,
      hasTemporalAnchor: false, // Would need date extraction
      isGenericInstitutionalPage: detectGenericInstitutionalPage("", evRow?.content || "", progCount.length),
      entityCount: entityCount.length,
      factCount: factCount.length,
    });
  }

  return map;
}

async function buildEvidenceContexts(
  evidenceIds: number[],
  intelligenceMap: Map<number, EvidenceIntelligence>
): Promise<Map<number, EvidenceContext>> {
  const map = new Map<number, EvidenceContext>();

  for (const eid of evidenceIds) {
    const intel = intelligenceMap.get(eid);
    const evRow = await db.select({ title: evidence.title, content: evidence.content })
      .from(evidence)
      .where(eq(evidence.id, eid))
      .get();

    // Extract countries from text (simple heuristic)
    const countryMatches = evRow?.content?.match(/\b(Zimbabwe|Zambia|Malawi|Botswana|South Africa|Africa|Ethiopia|Kenya|Nigeria|Ghana|Uganda|Tanzania)\b/gi) || [];
    const countries = [...new Set(countryMatches.map((c) => c.toLowerCase()))];

    map.set(eid, {
      evidenceId: eid,
      title: evRow?.title || "",
      textLength: evRow?.content?.length || 0,
      programIds: intel?.programs.map((p) => p.id) || [],
      actorIds: intel?.actors.map((a) => a.id) || [],
      countries,
      organizations: [], // Would need entity extraction
      sectors: [], // Would need topic extraction
      isGenericInstitutionalPage: detectGenericInstitutionalPage(
        evRow?.title || "",
        evRow?.content || "",
        intel?.programs.length || 0
      ),
      programReferenceCount: intel?.programs.length || 0,
    });
  }

  return map;
}

// ═════════════════════════════════════════════════════════════════
// 9. NARRATIVE GENERATION
// ═════════════════════════════════════════════════════════════════

/**
 * Generate LLM narratives for validated story candidates.
 * 
 * This preserves the v3 narrative generation stage but feeds it
 * v4 story candidates instead of v3 clusters.
 */
async function generateNarrativesForValidatedStories(): Promise<void> {
  try {
    const validatedCandidates = await db.select()
      .from(storyCandidates)
      .where(eq(storyCandidates.status, "validated"))
      .all();

    for (const candidate of validatedCandidates) {
      // Check if narrative already exists
      const existing = await db.select().from(narratives)
        .where(eq(narratives.title, candidate.name))
        .get();
      if (existing) continue;

      // Get evidence IDs for this candidate
      const evidenceRows = await db.select({ evidenceId: storyCandidateEvidence.evidenceId })
        .from(storyCandidateEvidence)
        .where(eq(storyCandidateEvidence.storyCandidateId, candidate.id))
        .all();
      const evidenceIds = evidenceRows.map((r) => r.evidenceId);

      // Get evidence texts
      const evidenceTexts = await db.select({ id: evidence.id, content: evidence.content })
        .from(evidence)
        .where(inArray(evidence.id, evidenceIds))
        .all();

      const combinedText = evidenceTexts.map((e) => e.content).join("\n\n---\n\n");

      // Generate narrative
      const narrative = await generateNarrativeFromCluster({
        name: candidate.name,
        description: candidate.description,
        evidenceIds,
        evidenceTexts: combinedText,
      });

      await db.insert(narratives).values({
        title: narrative.title,
        overview: narrative.overview,
        clusterIds: JSON.stringify([candidate.id]),
        evidenceIds: JSON.stringify(evidenceIds),
        confidence: candidate.confidence,
        generationType: "auto",
      });
    }
  } catch (err) {
    console.error("[worker] Narrative generation failed:", err);
  }
}

// ═════════════════════════════════════════════════════════════════
// 10. FULL CORPUS REBUILD (manual trigger)
// ═════════════════════════════════════════════════════════════════

/**
 * Trigger a full corpus rebuild manually.
 * 
 * This can be called from an API route or admin interface
 * to re-run the entire pipeline on all evidence.
 */
export async function triggerFullCorpusRebuild(): Promise<void> {
  console.log("[worker] Triggering full corpus rebuild");

  const allEvidence = await db.select({ id: evidence.id }).from(evidence);
  const allEvidenceIds = allEvidence.map((e) => e.id);

  if (allEvidenceIds.length < 2) {
    console.log("[worker] Not enough evidence for graph rebuild");
    return;
  }

  await rebuildStoryGraph(allEvidenceIds);
  await generateNarrativesForValidatedStories();

  console.log("[worker] Full corpus rebuild complete");
}
