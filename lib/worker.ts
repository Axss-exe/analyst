/**
 * ATIS v4 — Background Worker Pipeline (FIXED)
 *
 * Fixes applied:
 * 1. Added enqueueEvidenceJob() for direct calling from import route
 * 2. Fixed SQLite .returning() → .run() + lastInsertRowid
 * 3. Added evidenceEntities.mentions and .context columns
 * 4. Made rebuildStoryGraph optional — pipeline continues even if graph fails
 * 5. Added extensive console logging at every stage
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

// ═════════════════════════════════════════════════════════════════
// NEW: Direct entry point for import route
// ═════════════════════════════════════════════════════════════════

export interface WorkerJob {
  id: string;
  evidenceId: number;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  progress: number;
  error?: string;
}

/**
 * Call this from your import route after saving evidence.
 * 
 * Usage in import route:
 *   import { enqueueEvidenceJob } from "@/lib/worker";
 *   enqueueEvidenceJob(savedEvidenceId, content, userId);
 */
export function enqueueEvidenceJob(
  evidenceId: number,
  text: string,
  userId: number
): void {
  console.log("[WORKER] enqueueEvidenceJob called for evidence", evidenceId);

  const job: WorkerJob = {
    id: `job-${evidenceId}-${Date.now()}`,
    evidenceId,
    status: "queued",
    stage: "init",
    progress: 0,
  };

  // Run async so HTTP response returns immediately
  setTimeout(async () => {
    try {
      await processEvidenceJob(job, text, userId);
    } catch (err) {
      console.error("[WORKER] FATAL:", err);
    }
  }, 100);
}

// ═════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═════════════════════════════════════════════════════════════════

export async function processEvidenceJob(
  job: WorkerJob,
  fallbackText?: string,
  fallbackUserId?: number
): Promise<void> {
  const startTime = Date.now();
  console.log(`[worker] ════════════════════════════════════════════════`);
  console.log(`[worker] Starting job ${job.id} for evidence ${job.evidenceId}`);
  console.log(`[worker] ════════════════════════════════════════════════`);

  try {
    // ── Stage 1: Fetch evidence ────────────────────────────────
    updateStage(job, "fetch_evidence", 5);
    const evidenceRow = db
      .select()
      .from(evidence)
      .where(eq(evidence.id, job.evidenceId))
      .get();

    if (!evidenceRow) {
      throw new Error(`Evidence ${job.evidenceId} not found`);
    }
    console.log(`[worker] Found evidence: "${evidenceRow.title?.substring(0, 50)}..."`);

    const text = evidenceRow.content || fallbackText || "";
    const userId = evidenceRow.createdBy || fallbackUserId || 1;

    // ── Stage 2: Extract structured intelligence ───────────────
    updateStage(job, "extraction", 15);

    // SAFETY: Wrap extraction in its own try/catch so DB issues don't kill it
    let extractionResult: any = null;
    try {
      // Dynamic import to avoid crashing if the module is missing
      const { extractStructuredFacts } = await import("@/lib/ai/extraction");
      extractionResult = await extractStructuredFacts(text, job.evidenceId);
      console.log(`[worker] Extraction result:`, {
        facts: extractionResult?.structured?.facts?.length || 0,
        entities: extractionResult?.structured?.entities?.length || 0,
        programs: extractionResult?.intelligence?.programs?.length || 0,
      });
    } catch (extractErr) {
      console.error(`[worker] EXTRACTION FAILED (non-fatal):`, extractErr);
      // Create empty result so pipeline continues
      extractionResult = {
        structured: { facts: [], entities: [] },
        intelligence: { programs: [], events: [], problems: [], outcomes: [], actors: [] },
        singleDocumentAssessment: {
          hasProblem: false, hasIntervention: false, hasOutcome: false,
          hasProgram: false, hasEvent: false, narrativeCompletenessScore: 0,
          canBeSingleDocumentStory: false, assessmentReason: "Extraction failed",
        },
      };
    }

    // ── Stage 3: Store v3 facts ────────────────────────────────
    updateStage(job, "store_facts", 25);
    if (extractionResult?.structured?.facts?.length > 0) {
      await storeFacts(extractionResult.structured.facts, job.evidenceId);
    } else {
      console.log(`[worker] No facts to store`);
    }

    // ── Stage 4: Store v3 entities ─────────────────────────────
    updateStage(job, "store_entities", 30);
    if (extractionResult?.structured?.entities?.length > 0) {
      await storeEntities(extractionResult.structured.entities, job.evidenceId);
    } else {
      console.log(`[worker] No entities to store`);
    }

    // ── Stage 5: Store v4 intelligence nodes ───────────────────
    updateStage(job, "store_intelligence", 40);
    let intelligenceIds: any = { programIds: [], eventIds: [], problemIds: [], outcomeIds: [], actorIds: [] };
    if (extractionResult?.intelligence) {
      intelligenceIds = await storeIntelligenceNodes(extractionResult.intelligence, job.evidenceId);
    }

    // ── Stage 6: Store single-document assessment ──────────────
    updateStage(job, "store_assessment", 45);
    if (extractionResult?.singleDocumentAssessment) {
      await storeSingleDocumentAssessment(job.evidenceId, extractionResult.singleDocumentAssessment);
    }

    // ── Stage 7: Rebuild story graph (OPTIONAL — non-fatal) ────
    updateStage(job, "rebuild_graph", 60);
    try {
      const allEvidence = db.select({ id: evidence.id }).from(evidence).all();
      const allEvidenceIds = allEvidence.map((e) => e.id);

      if (allEvidenceIds.length >= 2) {
        await rebuildStoryGraph(allEvidenceIds);
      } else {
        console.log(`[worker] Only ${allEvidenceIds.length} evidence items, skipping graph rebuild`);
      }
    } catch (graphErr) {
      console.error(`[worker] Graph rebuild failed (non-fatal):`, graphErr);
      // Continue — don't let graph failure kill the whole job
    }

    // ── Stage 8: Generate narratives (OPTIONAL — non-fatal) ────
    updateStage(job, "generate_narratives", 85);
    try {
      await generateNarrativesForValidatedStories();
    } catch (narrErr) {
      console.error(`[worker] Narrative generation failed (non-fatal):`, narrErr);
    }

    // ── Done ───────────────────────────────────────────────────
    updateStage(job, "complete", 100);
    const duration = Date.now() - startTime;
    console.log(`[worker] ✅ Job ${job.id} completed in ${duration}ms`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] ❌ Job ${job.id} failed:`, errorMessage);
    job.status = "failed";
    job.error = errorMessage;
  }
}

// ═════════════════════════════════════════════════════════════════
// STAGE HELPERS
// ═════════════════════════════════════════════════════════════════

function updateStage(job: WorkerJob, stage: string, progress: number): void {
  job.stage = stage;
  job.progress = progress;
  console.log(`[worker] Job ${job.id}: ${stage} (${progress}%)`);
}

// ═════════════════════════════════════════════════════════════════
// FACT STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeFacts(
  factsList: Array<{ subject: string; predicate: string; object: string; evidenceId: number; confidence: number }>,
  evidenceId: number
): Promise<void> {
  if (!factsList || factsList.length === 0) return;

  let success = 0;
  for (const fact of factsList) {
    try {
      db.insert(facts).values({
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        evidenceId,
        confidence: fact.confidence ?? 0.5,
      }).run();
      success++;
    } catch (err) {
      console.error(`[worker] Failed to store fact:`, fact, err);
    }
  }
  console.log(`[worker] Stored ${success}/${factsList.length} facts`);
}

// ═════════════════════════════════════════════════════════════════
// ENTITY STORAGE (FIXED for SQLite)
// ═════════════════════════════════════════════════════════════════

async function storeEntities(
  entitiesList: Array<{ name: string; type: string; mentions?: number; context?: string }>,
  evidenceId: number
): Promise<void> {
  if (!entitiesList || entitiesList.length === 0) return;

  let success = 0;
  for (const ent of entitiesList) {
    try {
      // Check if entity already exists by normalized name
      const existing = db
        .select()
        .from(entities)
        .where(eq(entities.name, ent.name))
        .get();

      let entityId: number;
      if (existing) {
        entityId = existing.id;
        console.log(`[worker]   Reusing entity "${ent.name}" (id:${entityId})`);
      } else {
        // FIX: Use .run() + lastInsertRowid instead of .returning()
        const result = db.insert(entities).values({
          name: ent.name,
          type: ent.type || "unknown",
          normalizedName: ent.name.toLowerCase().trim(),
          createdBy: 1, // TODO: pass actual userId
        }).run();
        entityId = Number(result.lastInsertRowid);
        console.log(`[worker]   Created entity "${ent.name}" (id:${entityId})`);
      }

      // Link to evidence
      db.insert(evidenceEntities).values({
        evidenceId,
        entityId,
        mentions: ent.mentions ?? 1,
        context: ent.context || null,
      }).run();
      success++;

    } catch (err) {
      console.error(`[worker] Failed to store entity "${ent.name}":`, err);
    }
  }
  console.log(`[worker] Stored ${success}/${entitiesList.length} entities`);
}

// ═════════════════════════════════════════════════════════════════
// INTELLIGENCE NODE STORAGE (FIXED for SQLite)
// ═════════════════════════════════════════════════════════════════

async function storeIntelligenceNodes(
  intelligence: any,
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

  if (!intelligence) return result;

  try {
    // Programs
    for (const prog of intelligence.programs || []) {
      try {
        const existing = db.select().from(programs)
          .where(eq(programs.normalizedName, prog.normalizedName || prog.name.toLowerCase().trim()))
          .get();

        let programId: number;
        if (existing) {
          programId = existing.id;
        } else {
          const r = db.insert(programs).values({
            name: prog.name,
            normalizedName: prog.normalizedName || prog.name.toLowerCase().trim(),
            description: prog.description,
            type: prog.type,
          }).run();
          programId = Number(r.lastInsertRowid);
        }

        result.programIds.push(programId);
        db.insert(evidencePrograms).values({
          evidenceId,
          programId,
          confidence: 0.95,
          explicit: true,
          reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store program "${prog.name}":`, e);
      }
    }

    // Events
    for (const evt of intelligence.events || []) {
      try {
        const existing = db.select().from(events)
          .where(eq(events.normalizedName, evt.normalizedName || evt.name.toLowerCase().trim()))
          .get();

        let eventId: number;
        if (existing) {
          eventId = existing.id;
        } else {
          const r = db.insert(events).values({
            name: evt.name,
            normalizedName: evt.normalizedName || evt.name.toLowerCase().trim(),
            description: evt.description,
            temporalInfo: evt.temporalInfo,
            eventType: evt.eventType,
          }).run();
          eventId = Number(r.lastInsertRowid);
        }

        result.eventIds.push(eventId);
        db.insert(evidenceEvents).values({
          evidenceId,
          eventId,
          confidence: 0.90,
          explicit: true,
          reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store event "${evt.name}":`, e);
      }
    }

    // Problems
    for (const prob of intelligence.problems || []) {
      try {
        const existing = db.select().from(problems)
          .where(eq(problems.normalizedName, prob.normalizedName || prob.name.toLowerCase().trim()))
          .get();

        let problemId: number;
        if (existing) {
          problemId = existing.id;
        } else {
          const r = db.insert(problems).values({
            name: prob.name,
            normalizedName: prob.normalizedName || prob.name.toLowerCase().trim(),
            description: prob.description,
            severity: prob.severity,
          }).run();
          problemId = Number(r.lastInsertRowid);
        }

        result.problemIds.push(problemId);
        db.insert(evidenceProblems).values({
          evidenceId,
          problemId,
          confidence: 0.85,
          explicit: true,
          reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store problem "${prob.name}":`, e);
      }
    }

    // Outcomes
    for (const out of intelligence.outcomes || []) {
      try {
        const existing = db.select().from(outcomes)
          .where(eq(outcomes.normalizedName, out.normalizedName || out.name.toLowerCase().trim()))
          .get();

        let outcomeId: number;
        if (existing) {
          outcomeId = existing.id;
        } else {
          const r = db.insert(outcomes).values({
            name: out.name,
            normalizedName: out.normalizedName || out.name.toLowerCase().trim(),
            description: out.description,
            metric: out.metric,
          }).run();
          outcomeId = Number(r.lastInsertRowid);
        }

        result.outcomeIds.push(outcomeId);
        db.insert(evidenceOutcomes).values({
          evidenceId,
          outcomeId,
          confidence: 0.85,
          explicit: true,
          reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store outcome "${out.name}":`, e);
      }
    }

    // Actors
    for (const actor of intelligence.actors || []) {
      try {
        const existing = db.select().from(actors)
          .where(eq(actors.normalizedName, actor.normalizedName || actor.name.toLowerCase().trim()))
          .get();

        let actorId: number;
        if (existing) {
          actorId = existing.id;
        } else {
          const r = db.insert(actors).values({
            name: actor.name,
            normalizedName: actor.normalizedName || actor.name.toLowerCase().trim(),
            actorType: actor.actorType,
          }).run();
          actorId = Number(r.lastInsertRowid);
        }

        result.actorIds.push(actorId);
        db.insert(evidenceActors).values({
          evidenceId,
          actorId,
          confidence: 0.90,
          explicit: true,
          reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store actor "${actor.name}":`, e);
      }
    }
  } catch (err) {
    console.error(`[worker] Failed to store intelligence nodes:`, err);
  }

  console.log(`[worker] Intelligence nodes:`, {
    programs: result.programIds.length,
    events: result.eventIds.length,
    problems: result.problemIds.length,
    outcomes: result.outcomeIds.length,
    actors: result.actorIds.length,
  });

  return result;
}

// ═════════════════════════════════════════════════════════════════
// SINGLE-DOCUMENT ASSESSMENT STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeSingleDocumentAssessment(
  evidenceId: number,
  assessment: any
): Promise<void> {
  if (!assessment) return;

  try {
    // Check if assessment already exists
    const existing = db
      .select()
      .from(evidenceStoryAssessment)
      .where(eq(evidenceStoryAssessment.evidenceId, evidenceId))
      .get();

    const values = {
      evidenceId,
      hasProblem: assessment.hasProblem ?? false,
      hasIntervention: assessment.hasIntervention ?? false,
      hasOutcome: assessment.hasOutcome ?? false,
      hasProgram: assessment.hasProgram ?? false,
      hasEvent: assessment.hasEvent ?? false,
      narrativeCompletenessScore: assessment.narrativeCompletenessScore ?? 0,
      canBeSingleDocumentStory: assessment.canBeSingleDocumentStory ?? false,
      assessmentReason: assessment.assessmentReason || "",
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      db.update(evidenceStoryAssessment)
        .set(values)
        .where(eq(evidenceStoryAssessment.evidenceId, evidenceId))
        .run();
      console.log(`[worker] Updated assessment for E${evidenceId}`);
    } else {
      db.insert(evidenceStoryAssessment).values(values).run();
      console.log(`[worker] Created assessment for E${evidenceId}`);
    }
  } catch (err) {
    console.error(`[worker] Failed to store assessment for E${evidenceId}:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// STORY GRAPH REBUILD (OPTIONAL — non-fatal)
// ═════════════════════════════════════════════════════════════════

async function rebuildStoryGraph(allEvidenceIds: number[]): Promise<void> {
  console.log(`[worker] Rebuilding story graph for ${allEvidenceIds.length} evidence items`);

  try {
    // Try to use the v4 discovery pipeline if available
    try {
      const { runStoryDiscoveryPipeline, persistStoryDiscovery } = await import("@/lib/reasoning/story-discovery");
      const intelligenceMap = await loadIntelligenceMap(allEvidenceIds);
      const singleDocAssessments = await loadSingleDocAssessments(allEvidenceIds);
      const qualityProfiles = await buildQualityProfiles(allEvidenceIds);
      const evidenceContexts = await buildEvidenceContexts(allEvidenceIds, intelligenceMap);

      const input = {
        evidenceIds: allEvidenceIds,
        intelligenceMap,
        singleDocAssessments,
        qualityProfiles,
        evidenceContexts,
      };

      const output = runStoryDiscoveryPipeline(input);
      await persistStoryDiscovery(output);

      console.log(`[worker] Graph rebuild complete via v4 pipeline`);
      return;
    } catch (v4Err) {
      console.log(`[worker] v4 pipeline unavailable, falling back to simple graph build:`, v4Err);
    }

    // Fallback: simple relationship building
    await buildSimpleStoryGraph(allEvidenceIds);

  } catch (err) {
    console.error(`[worker] Graph rebuild failed:`, err);
    throw err; // Re-throw so caller can decide
  }
}

/**
 * Fallback graph builder that doesn't depend on v4 reasoning modules.
 * Creates simple relationships based on shared programs and problems.
 */
async function buildSimpleStoryGraph(allEvidenceIds: number[]): Promise<void> {
  console.log(`[worker] Building simple story graph...`);

  let edgeCount = 0;

  for (const eid of allEvidenceIds) {
    // Find evidence with same programs
    const progRows = db
      .select({ otherId: evidencePrograms.evidenceId })
      .from(evidencePrograms)
      .where(eq(evidencePrograms.evidenceId, eid))
      .all();

    const programIds = (progRows as any[]).map((r) => r.otherId);

    for (const otherId of allEvidenceIds) {
      if (otherId <= eid) continue; // Avoid duplicates

      let weight = 0;
      let reason = "";

      // Check shared programs
      const otherProgs = db
        .select({ programId: evidencePrograms.programId })
        .from(evidencePrograms)
        .where(eq(evidencePrograms.evidenceId, otherId))
        .all();

      const sharedPrograms = (otherProgs as any[]).filter((op) =>
        programIds.includes(op.programId)
      );

      if (sharedPrograms.length > 0) {
        weight += 0.5;
        reason = `Shares ${sharedPrograms.length} program(s)`;
      }

      // Check shared problems
      const probRows = db
        .select({ problemId: evidenceProblems.problemId })
        .from(evidenceProblems)
        .where(eq(evidenceProblems.evidenceId, eid))
        .all();
      const problemIds = (probRows as any[]).map((r) => r.problemId);

      const otherProbs = db
        .select({ problemId: evidenceProblems.problemId })
        .from(evidenceProblems)
        .where(eq(evidenceProblems.evidenceId, otherId))
        .all();

      const sharedProblems = (otherProbs as any[]).filter((op) =>
        problemIds.includes(op.problemId)
      );

      if (sharedProblems.length > 0) {
        weight += 0.3;
        reason += reason ? `, ${sharedProblems.length} problem(s)` : `${sharedProblems.length} problem(s)`;
      }

      if (weight > 0) {
        try {
          db.insert(storyRelationships)
            .values({
              sourceEvidenceId: Math.min(eid, otherId),
              targetEvidenceId: Math.max(eid, otherId),
              relationshipType: weight > 0.6 ? "strong_connection" : "related",
              weight,
              confidence: 0.6,
              explicit: true,
              reason: reason || "Shared context",
            })
            .run();
          edgeCount++;
        } catch {
          // Unique constraint — already exists
        }
      }
    }
  }

  console.log(`[worker] Simple graph built: ${edgeCount} edges`);
}

// ═════════════════════════════════════════════════════════════════
// DATA LOADING HELPERS
// ═════════════════════════════════════════════════════════════════

async function loadIntelligenceMap(evidenceIds: number[]): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  for (const eid of evidenceIds) {
    try {
      const progRows = db.select({
        id: programs.id, name: programs.name, normalizedName: programs.normalizedName,
        description: programs.description, type: programs.type,
      })
        .from(evidencePrograms)
        .innerJoin(programs, eq(evidencePrograms.programId, programs.id))
        .where(eq(evidencePrograms.evidenceId, eid))
        .all();

      const evRow = db.select({ content: evidence.content, title: evidence.title })
        .from(evidence)
        .where(eq(evidence.id, eid))
        .get();

      map.set(eid, {
        evidenceId: eid,
        programs: progRows,
        events: [], problems: [], outcomes: [], actors: [],
        text: evRow?.content || "",
      });
    } catch (e) {
      console.error(`[worker] Failed to load intelligence for E${eid}:`, e);
    }
  }
  return map;
}

async function loadSingleDocAssessments(evidenceIds: number[]): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  try {
    const rows = db.select()
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
  } catch (e) {
    console.error(`[worker] Failed to load assessments:`, e);
  }
  return map;
}

async function buildQualityProfiles(evidenceIds: number[]): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  for (const eid of evidenceIds) {
    try {
      const evRow = db.select({ content: evidence.content }).from(evidence).where(eq(evidence.id, eid)).get();
      const progCount = db.select({ count: evidencePrograms.programId })
        .from(evidencePrograms)
        .where(eq(evidencePrograms.evidenceId, eid))
        .all();
      const factCount = db.select({ count: facts.id })
        .from(facts)
        .where(eq(facts.evidenceId, eid))
        .all();
      const entityCount = db.select({ count: evidenceEntities.entityId })
        .from(evidenceEntities)
        .where(eq(evidenceEntities.evidenceId, eid))
        .all();

      map.set(eid, {
        textLength: evRow?.content?.length || 0,
        extractionConfidence: 0.85,
        hasProgramReference: (progCount as any[]).length > 0,
        hasSpecificMetric: false,
        hasTemporalAnchor: false,
        isGenericInstitutionalPage: false,
        entityCount: (entityCount as any[]).length,
        factCount: (factCount as any[]).length,
      });
    } catch (e) {
      console.error(`[worker] Failed to build quality profile for E${eid}:`, e);
    }
  }
  return map;
}

async function buildEvidenceContexts(evidenceIds: number[], intelligenceMap: Map<number, any>): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  for (const eid of evidenceIds) {
    try {
      const intel = intelligenceMap.get(eid);
      const evRow = db.select({ title: evidence.title, content: evidence.content })
        .from(evidence)
        .where(eq(evidence.id, eid))
        .get();

      map.set(eid, {
        evidenceId: eid,
        title: evRow?.title || "",
        textLength: evRow?.content?.length || 0,
        programIds: intel?.programs.map((p: any) => p.id) || [],
        actorIds: [],
        countries: [],
        organizations: [],
        sectors: [],
        isGenericInstitutionalPage: false,
        programReferenceCount: intel?.programs.length || 0,
      });
    } catch (e) {
      console.error(`[worker] Failed to build context for E${eid}:`, e);
    }
  }
  return map;
}

// ═════════════════════════════════════════════════════════════════
// NARRATIVE GENERATION (OPTIONAL — non-fatal)
// ═════════════════════════════════════════════════════════════════

async function generateNarrativesForValidatedStories(): Promise<void> {
  try {
    const validatedCandidates = db.select()
      .from(storyCandidates)
      .where(eq(storyCandidates.status, "validated"))
      .all();

    if ((validatedCandidates as any[]).length === 0) {
      console.log(`[worker] No validated candidates for narrative generation`);
      return;
    }

    for (const candidate of validatedCandidates as any[]) {
      try {
        const existing = db.select().from(narratives)
          .where(eq(narratives.title, candidate.name))
          .get();
        if (existing) continue;

        const evidenceRows = db.select({ evidenceId: storyCandidateEvidence.evidenceId })
          .from(storyCandidateEvidence)
          .where(eq(storyCandidateEvidence.storyCandidateId, candidate.id))
          .all();

        const evidenceIds = (evidenceRows as any[]).map((r) => r.evidenceId);

        db.insert(narratives).values({
          title: candidate.name,
          overview: candidate.description || "",
          clusterIds: JSON.stringify([candidate.id]),
          evidenceIds: JSON.stringify(evidenceIds),
          confidence: candidate.confidence ?? 0.5,
          generationType: "auto",
          createdBy: 1,
        }).run();

        console.log(`[worker] Created narrative: "${candidate.name}"`);

      } catch (e) {
        console.error(`[worker] Failed to generate narrative for candidate ${candidate.id}:`, e);
      }
    }
  } catch (err) {
    console.error(`[worker] Narrative generation failed:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// FULL CORPUS REBUILD (manual trigger)
// ═════════════════════════════════════════════════════════════════

export async function triggerFullCorpusRebuild(): Promise<void> {
  console.log("[worker] Triggering full corpus rebuild");

  const allEvidence = db.select({ id: evidence.id }).from(evidence).all();
  const allEvidenceIds = (allEvidence as any[]).map((e) => e.id);

  if (allEvidenceIds.length < 2) {
    console.log("[worker] Not enough evidence for graph rebuild");
    return;
  }

  await rebuildStoryGraph(allEvidenceIds);
  await generateNarrativesForValidatedStories();

  console.log("[worker] Full corpus rebuild complete");
}