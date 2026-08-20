/**
 * ATIS v4 — Background Worker Pipeline (FULLY FIXED + STORY CONTINUITY)
 *
 * Fixes applied:
 * 1. Added enqueueEvidenceJob() for direct calling from import route
 * 2. Fixed SQLite .returning() → .run() + lastInsertRowid
 * 3. Made rebuildStoryGraph optional — pipeline continues even if graph fails
 * 4. Added extensive console logging at every stage
 * 5. FIXED: buildSimpleStoryGraph clusters evidence by shared programs/problems/entities
 * 6. FIXED: Removed per-evidence auto-story creation (was causing 1:1 story:evidence ratio)
 * 7. FIXED: buildSimpleStoryGraph creates stories + story_evidence for multi-doc clusters
 * 8. ADDED: createRelationshipsFromFacts — builds entity relationships from SPO triples
 * 9. ADDED: createEvidenceConnections — links documents sharing facts/programs
 * 10. ADDED: storeTimelineEvents — extracts dates and creates timeline_events
 * 11. ADDED: createGraphEdges — populates story_graph_edges from relationships
 * 12. FIXED: generateNarrativesForValidatedStories has robust fallback without @/lib/ai/stories
 * 13. ADDED: Stage 7b — matchEvidenceToExistingStories for story continuity
 */
import { generateEvidenceSummary, serializeSummary } from "@/lib/ai/summaries";
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
  storyEvidence,
  graphClusters,
  narratives,
  stories,
  relationships,
  storyGraphEdges,
  contextGraphEdges,
  evidenceConnections,
  timelineEvents,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

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
  finishedAt?: string;
}

/**
 * Call this from your import route after saving evidence.
 */
export function enqueueEvidenceJob(
  evidenceId: number,
  text: string,
  userId: number,
): void {
  console.log("[WORKER] enqueueEvidenceJob called for evidence", evidenceId);

  const job: WorkerJob = {
    id: `job-${evidenceId}-${Date.now()}`,
    evidenceId,
    status: "queued",
    stage: "init",
    progress: 0,
  };

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
  fallbackUserId?: number,
): Promise<void> {
  const startTime = Date.now();
  console.log(`[worker] ════════════════════════════════════════════════`);
  console.log(`[worker] Starting job ${job.id} for evidence ${job.evidenceId}`);
  console.log(`[worker] ════════════════════════════════════════════════`);

  try {
    // ── Stage 1: Fetch evidence ────────────────────────────────
    updateStage({ job, stage: "fetch_evidence", progress: 5 });
    const evidenceRow = db
      .select()
      .from(evidence)
      .where(eq(evidence.id, job.evidenceId))
      .get();

    if (!evidenceRow) {
      throw new Error(`Evidence ${job.evidenceId} not found`);
    }
    console.log(`[worker] Found evidence: "${evidenceRow.title?.substring(0, 50)}..."`);

    const text = evidenceRow.content || evidenceRow.summary || fallbackText || "";
    const userId = evidenceRow.createdBy || fallbackUserId || 1;

    // ── Stage 2: Extract structured intelligence ───────────────
    updateStage({ job, stage: "extraction", progress: 15 });

    let extractionResult: any = null;
    try {
      const { extractStructuredFacts } = await import("@/lib/ai/extraction");
      extractionResult = await extractStructuredFacts(text, job.evidenceId);
      console.log(`[worker] Extraction result:`, {
        facts: extractionResult?.structured?.facts?.length || 0,
        entities: extractionResult?.structured?.entities?.length || 0,
        programs: extractionResult?.intelligence?.programs?.length || 0,
      });
    } catch (extractErr) {
      console.error(`[worker] EXTRACTION FAILED (non-fatal):`, extractErr);
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

    // ── SUMMARY GENERATION ──────────────────────────────────────
    try {
      console.log(`[worker] SUMMARY: generating for E${job.evidenceId}`);
      const summary = await generateEvidenceSummary(text, evidenceRow.title, job.evidenceId);
      if (summary) {
        const summaryJson = serializeSummary(summary);
        db.update(evidence)
          .set({ summary: summaryJson })
          .where(eq(evidence.id, job.evidenceId))
          .run();
        console.log(`[worker] E${job.evidenceId}: summary STORED (${summary.keyFindings.length} findings)`);
      } else {
        console.log(`[worker] E${job.evidenceId}: summary returned null`);
      }
    } catch (sumErr) {
      console.warn(`[worker] E${job.evidenceId}: summary generation FAILED (non-fatal)`, sumErr);
    }

    // ── Stage 3: Store v3 facts ────────────────────────────────
    updateStage({ job, stage: "store_facts", progress: 25 });
    if (extractionResult?.structured?.facts?.length > 0) {
      await storeFacts(extractionResult.structured.facts, job.evidenceId);
    } else {
      console.log(`[worker] No facts to store`);
    }

    // ── Stage 4: Store v3 entities ─────────────────────────────
    updateStage({ job, stage: "store_entities", progress: 30 });
    if (extractionResult?.structured?.entities?.length > 0) {
      await storeEntities(extractionResult.structured.entities, job.evidenceId);
    } else {
      console.log(`[worker] No entities to store`);
    }

    // ── Stage 4b: Create entity relationships from facts ───────
    updateStage({ job, stage: "create_relationships", progress: 35 });
    try {
      await createRelationshipsFromFacts(job.evidenceId);
    } catch (relErr) {
      console.warn(`[worker] Entity relationship creation failed (non-fatal):`, relErr);
    }

    // ── Stage 5: Store v4 intelligence nodes ───────────────────
    updateStage({ job, stage: "store_intelligence", progress: 40 });
    let intelligenceIds: any = { programIds: [], eventIds: [], problemIds: [], outcomeIds: [], actorIds: [] };
    if (extractionResult?.intelligence) {
      intelligenceIds = await storeIntelligenceNodes(extractionResult.intelligence, job.evidenceId);
    }

    // ── Stage 6: Store single-document assessment ──────────────
    updateStage({ job, stage: "store_assessment", progress: 45 });
    if (extractionResult?.singleDocumentAssessment) {
      await storeSingleDocumentAssessment(job.evidenceId, extractionResult.singleDocumentAssessment);
    }

    // ── Stage 6b: Extract timeline events ──────────────────────
    updateStage({ job, stage: "store_timeline", progress: 50 });
    try {
      await storeTimelineEvents(job.evidenceId, text, evidenceRow.title);
    } catch (tlErr) {
      console.warn(`[worker] Timeline extraction failed (non-fatal):`, tlErr);
    }

    // ── Stage 7: Rebuild story graph ───────────────────────────
    updateStage({ job, stage: "rebuild_graph", progress: 60 });
    try {
      const allEvidence = db.select({ id: evidence.id }).from(evidence).all();
      const allEvidenceIds = allEvidence.map((e) => e.id);

      if (allEvidenceIds.length >= 1) {
        await rebuildStoryGraph(allEvidenceIds);
      }
    } catch (graphErr) {
      console.error(`[worker] Graph rebuild failed (non-fatal):`, graphErr);
    }

    // ═══════════════════════════════════════════════════════════════
    // NEW: Stage 7b — Match new evidence to existing stories
    // ═══════════════════════════════════════════════════════════════
    updateStage({ job, stage: "story_matching", progress: 65 });
    try {
      const { matchEvidenceToExistingStories } = await import("@/lib/story-matcher");
      const matches = await matchEvidenceToExistingStories(job.evidenceId);
      if (matches.length > 0) {
        console.log(`[worker] Evidence ${job.evidenceId} matched to ${matches.length} existing story(s):`,
          matches.map((m) => `Story #${m.storyId} (score: ${m.score.toFixed(2)})`).join(", ")
        );
      } else {
        console.log(`[worker] Evidence ${job.evidenceId} did not match any existing active stories`);
      }
    } catch (matchErr) {
      console.warn(`[worker] Story matching failed (non-fatal):`, matchErr);
    }

    // ── Stage 8: Generate narratives ───────────────────────────
    updateStage({ job, stage: "generate_narratives", progress: 85 });
    try {
      await generateNarrativesForValidatedStories();
    } catch (narrErr) {
      console.error(`[worker] Narrative generation failed (non-fatal):`, narrErr);
    }

    // ── Done ───────────────────────────────────────────────────
    updateStage({ job, stage: "complete", progress: 100 });
    const duration = Date.now() - startTime;
    console.log(`[worker] ✅ Job ${job.id} completed in ${duration}ms`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] ❌ Job ${job.id} failed:`, errorMessage);
    job.status = "failed";
    job.error = errorMessage;
  } finally {
    job.finishedAt = new Date().toISOString();
  }
}

function updateStage({ job, stage, progress }: { job: WorkerJob; stage: string; progress: number; }): void {
  job.stage = stage;
  job.progress = progress;
  console.log(`[worker] Job ${job.id}: ${stage} (${progress}%)`);
}

// ═════════════════════════════════════════════════════════════════
// FACT STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeFacts(
  factsList: Array<{ subject: string; predicate: string; object: string; evidenceId: number; confidence: number }>,
  evidenceId: number,
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
// ENTITY STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeEntities(
  entitiesList: Array<{ name: string; type: string; mentions?: number; context?: string }>,
  evidenceId: number,
): Promise<void> {
  if (!entitiesList || entitiesList.length === 0) return;

  let success = 0;
  let linked = 0;
  let deduped = 0;

  for (const ent of entitiesList) {
    const normalizedName = (ent.name || "").trim();
    if (!normalizedName) continue;

    try {
      let existing = db.select().from(entities).where(eq(entities.name, normalizedName)).get();

      if (!existing) {
        const allEntities = db.select().from(entities).all();
        existing = allEntities.find(e => e.name.toLowerCase() === normalizedName.toLowerCase());
      }

      let entityId: number;
      if (existing) {
        entityId = existing.id;
        deduped++;
      } else {
        const result = db.insert(entities).values({
          name: normalizedName,
          type: ent.type || "unknown",
          aliases: "[]",
          createdBy: 1,
        }).run();
        entityId = Number(result.lastInsertRowid);
      }

      try {
        db.insert(evidenceEntities).values({ evidenceId, entityId }).run();
        linked++;
      } catch (linkErr: any) {
        if (!linkErr.message?.includes("UNIQUE constraint failed")) {
          console.error(`[worker] Failed to link entity ${entityId} to evidence ${evidenceId}:`, linkErr);
        }
      }

      success++;
    } catch (err) {
      console.error(`[worker] Failed to store entity "${normalizedName}":`, err);
    }
  }

  console.log(`[worker] Entities: ${success} processed (${success - deduped} new, ${deduped} existing), ${linked} linked to evidence ${evidenceId}`);
}

// ═════════════════════════════════════════════════════════════════
// NEW: CREATE ENTITY RELATIONSHIPS FROM FACTS
// ═════════════════════════════════════════════════════════════════

async function createRelationshipsFromFacts(evidenceId: number): Promise<void> {
  console.log(`[worker] Creating entity relationships from facts for E${evidenceId}`);

  const factRows = db.select().from(facts).where(eq(facts.evidenceId, evidenceId)).all();
  if (factRows.length === 0) {
    console.log(`[worker] No facts to build relationships from for E${evidenceId}`);
    return;
  }

  const entityRows = db.select().from(entities).all();

  // Build multi-layer entity resolution map
  const exactMap = new Map<string, number>();
  const lowerMap = new Map<string, number>();
  const aliasMap = new Map<number, string[]>();
  const normalizedMap = new Map<string, number>();
  const wordSetMap = new Map<number, Set<string>>();

  for (const e of entityRows) {
    exactMap.set(e.name, e.id);
    lowerMap.set(e.name.toLowerCase().trim(), e.id);

    // Parse aliases
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(e.aliases || "[]");
    } catch { /* ignore */ }
    aliasMap.set(e.id, aliases);

    for (const alias of aliases) {
      if (alias) {
        exactMap.set(alias, e.id);
        lowerMap.set(String(alias).toLowerCase().trim(), e.id);
      }
    }

    // Normalized: remove punctuation, "the", "limited", "inc", etc.
    const normalized = normalizeEntityName(e.name);
    normalizedMap.set(normalized, e.id);
    for (const alias of aliases) {
      if (alias) {
        normalizedMap.set(normalizeEntityName(alias), e.id);
      }
    }

    // Word set for fuzzy matching
    const words = new Set(e.name.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    wordSetMap.set(e.id, words);
  }

  function normalizeEntityName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\b(the|a|an|of|for|and|&|limited|ltd|inc|corp|corporation|company|co|plc|group)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveEntity(name: string): number | undefined {
    const trimmed = name.trim();
    if (!trimmed) return undefined;

    // 1. Exact match
    if (exactMap.has(trimmed)) return exactMap.get(trimmed);

    // 2. Lowercase exact match
    const lower = trimmed.toLowerCase();
    if (lowerMap.has(lower)) return lowerMap.get(lower);

    // 3. Normalized match
    const normalized = normalizeEntityName(trimmed);
    if (normalizedMap.has(normalized)) return normalizedMap.get(normalized);

    // 4. Substring containment (entity name contained in fact name)
    for (const [ename, eid] of lowerMap) {
      if (lower.includes(ename) || ename.includes(lower)) {
        return eid;
      }
    }

    // 5. Word overlap match (at least 2 significant words in common)
    const factWords = new Set(lower.split(/\s+/).filter(w => w.length > 2));
    let bestMatch: number | undefined;
    let bestOverlap = 0;
    for (const [eid, ewords] of wordSetMap) {
      let overlap = 0;
      for (const w of factWords) {
        if (ewords.has(w)) overlap++;
      }
      if (overlap >= 2 && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = eid;
      }
    }
    if (bestMatch) return bestMatch;

    // 6. Known aliases / abbreviations
    const knownAliases: Record<string, string> = {
      "afdb": "african development bank",
      "adb": "african development bank",
      "zesco": "zesco limited",
      "zambia": "republic of zambia",
      "zimbabwe": "republic of zimbabwe",
      "world bank": "world bank group",
      "wb": "world bank group",
      "imf": "international monetary fund",
      "eu": "european union",
      "un": "united nations",
      "us": "united states",
      "uk": "united kingdom",
      "sa": "south africa",
      "drc": "democratic republic of congo",
    };

    for (const [abbr, full] of Object.entries(knownAliases)) {
      if (lower === abbr || normalized === normalizeEntityName(full)) {
        const resolved = lowerMap.get(full);
        if (resolved) return resolved;
      }
    }

    return undefined;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let resolvedSubj = 0;
  let resolvedObj = 0;
  let resolvedBoth = 0;

  for (const fact of factRows) {
    const subjId = resolveEntity(fact.subject || "");
    const objId = resolveEntity(fact.object || "");

    if (subjId) resolvedSubj++;
    if (objId) resolvedObj++;
    if (subjId && objId) resolvedBoth++;

    if (!subjId || !objId) {
      skipped++;
      continue;
    }
    if (subjId === objId) {
      skipped++;
      continue;
    }

    const relType = (fact.predicate || "related").toLowerCase().trim();

    try {
      const existing = db
        .select()
        .from(relationships)
        .where(
          sql`${relationships.sourceId} = ${subjId} AND ${relationships.targetId} = ${objId} AND ${relationships.type} = ${relType}`
        )
        .get();

      if (existing) {
        const existingIds: number[] = JSON.parse(existing.evidenceIds || "[]");
        if (!existingIds.includes(evidenceId)) {
          existingIds.push(evidenceId);
          db.update(relationships)
            .set({
              evidenceIds: JSON.stringify(existingIds),
              confidence: Math.max(existing.confidence, fact.confidence ?? 0.75),
            })
            .where(eq(relationships.id, existing.id))
            .run();
          updated++;
        }
      } else {
        db.insert(relationships).values({
          sourceId: subjId,
          targetId: objId,
          type: relType,
          confidence: fact.confidence ?? 0.75,
          evidenceIds: JSON.stringify([evidenceId]),
          createdBy: 1,
        }).run();
        created++;
      }
    } catch (e) {
      console.error(`[worker] Failed to create relationship ${subjId}->${objId} (${relType}):`, e);
    }
  }

  console.log(
    `[worker] Relationships from facts for E${evidenceId}: ${created} created, ${updated} updated, ${skipped} skipped. ` +
    `Resolution: ${resolvedSubj}/${factRows.length} subjects, ${resolvedObj}/${factRows.length} objects, ${resolvedBoth} both`
  );
}

async function storeTimelineEvents(evidenceId: number, text: string, title: string): Promise<void> {
  console.log(`[worker] Extracting timeline events for E${evidenceId}`);

  const fullText = `${title} ${text}`;
  const extractedEvents: Array<{ date: string; title: string; description: string }> = [];

  const explicitDatePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi;
  const quarterPattern = /\b(Q[1-4]\s+\d{4})\b/gi;
  const yearPattern = /\b(20\d{2})\b/g;

  const eventPatterns = [
    { regex: /(?:approved|approves|approval).{0,60}(?:loan|grant|financing)/gi, label: "Financing Approval" },
    { regex: /(?:construction|implementation|execution).{0,60}(?:begins|starts|commenced|scheduled)/gi, label: "Project Start" },
    { regex: /(?:completion|completed|finished|operational).{0,60}(?:by|in|target|expected)/gi, label: "Project Milestone" },
    { regex: /(?:tender|procurement|contract).{0,60}(?:issued|awarded|signed)/gi, label: "Procurement Event" },
    { regex: /(?:crisis|shortage|deficit|decline).{0,60}(?:\d+%|percent)/gi, label: "Crisis Event" },
    { regex: /(?:drought|flood|disaster|El Niño).{0,60}(?:destroyed|damaged|affected)/gi, label: "Climate Event" },
  ];

  for (const ep of eventPatterns) {
    const matches = fullText.match(ep.regex);
    if (!matches) continue;

    for (const match of matches) {
      const idx = fullText.indexOf(match);
      const context = fullText.substring(
        Math.max(0, idx - 150),
        Math.min(fullText.length, idx + match.length + 150)
      );

      let dateStr: string | null = null;

      const explicitMatch = context.match(explicitDatePattern);
      if (explicitMatch) {
        const d = new Date(explicitMatch[0]);
        if (!isNaN(d.getTime())) dateStr = d.toISOString().split("T")[0];
      }

      if (!dateStr) {
        const quarterMatch = context.match(quarterPattern);
        if (quarterMatch) {
          const q = quarterMatch[0];
          const year = q.match(/\d{4}/)?.[0];
          const qNum = q.match(/Q(\d)/)?.[1];
          if (year && qNum) {
            const month = (parseInt(qNum) - 1) * 3 + 1;
            dateStr = `${year}-${month.toString().padStart(2, "0")}-01`;
          }
        }
      }

      if (!dateStr) {
        const yearMatch = context.match(yearPattern);
        if (yearMatch) {
          dateStr = `${yearMatch[0]}-01-01`;
        }
      }

      if (dateStr) {
        extractedEvents.push({
          date: dateStr,
          title: ep.label,
          description: match.trim().substring(0, 200),
        });
      }
    }
  }

  const seen = new Set<string>();
  let stored = 0;

  for (const ev of extractedEvents) {
    const key = `${ev.date}-${ev.description}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      db.insert(timelineEvents).values({
        date: ev.date,
        title: ev.title,
        description: ev.description,
        evidenceId,
        entityIds: "[]",
        createdBy: 1,
      }).run();
      stored++;
    } catch (e) {
      console.error(`[worker] Failed to store timeline event for E${evidenceId}:`, e);
    }
  }

  console.log(`[worker] Stored ${stored} timeline events for E${evidenceId}`);
}

// ═════════════════════════════════════════════════════════════════
// INTELLIGENCE NODE STORAGE
// ═════════════════════════════════════════════════════════════════

async function storeIntelligenceNodes(
  intelligence: any,
  evidenceId: number,
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
          evidenceId, programId, confidence: 0.95, explicit: true, reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store program "${prog.name}":`, e);
      }
    }

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
          evidenceId, eventId, confidence: 0.90, explicit: true, reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store event "${evt.name}":`, e);
      }
    }

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
          evidenceId, problemId, confidence: 0.85, explicit: true, reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store problem "${prob.name}":`, e);
      }
    }

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
          evidenceId, outcomeId, confidence: 0.85, explicit: true, reason: "Extracted from document text",
        }).run();
      } catch (e) {
        console.error(`[worker] Failed to store outcome "${out.name}":`, e);
      }
    }

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
          evidenceId, actorId, confidence: 0.90, explicit: true, reason: "Extracted from document text",
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
  assessment: any,
): Promise<void> {
  if (!assessment) return;

  try {
    const existing = db.select().from(evidenceStoryAssessment)
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
      db.update(evidenceStoryAssessment).set(values)
        .where(eq(evidenceStoryAssessment.evidenceId, evidenceId))
        .run();
    } else {
      db.insert(evidenceStoryAssessment).values(values).run();
    }
  } catch (err) {
    console.error(`[worker] Failed to store assessment for E${evidenceId}:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// STORY GRAPH REBUILD
// ═════════════════════════════════════════════════════════════════

async function rebuildStoryGraph(allEvidenceIds: number[]): Promise<void> {
  console.log(`[worker] Rebuilding story graph for ${allEvidenceIds.length} evidence items`);

  try {
    // Try v4 pipeline first (creates rich candidates, storyRelationships, graphClusters)
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
      console.log(`[worker] V4 pipeline complete: ${output.candidates.length} candidates`);
    } catch (v4Err) {
      console.log(`[worker] V4 pipeline unavailable:`, v4Err);
    }

    // ALWAYS run simple graph to ensure evidenceConnections, storyGraphEdges,
    // contextGraphEdges, stories, and storyCandidateEvidence are populated.
    // Idempotent — won't create duplicates due to unique constraints + signature checks.
    await buildSimpleStoryGraph(allEvidenceIds);
    console.log(`[worker] Simple graph fallback complete`);

  } catch (err) {
    console.error(`[worker] Graph rebuild failed:`, err);
    throw err;
  }
}

export async function buildSimpleStoryGraph(allEvidenceIds: number[]): Promise<void> {
  console.log(`[worker] Building simple story graph for ${allEvidenceIds.length} evidence items...`);

  const evidenceProgramsMap = new Map<number, number[]>();
  const evidenceProblemsMap = new Map<number, number[]>();
  const evidenceEntityMap = new Map<number, number[]>();

  for (const eid of allEvidenceIds) {
    const progRows = db.select({ programId: evidencePrograms.programId })
      .from(evidencePrograms).where(eq(evidencePrograms.evidenceId, eid)).all();
    evidenceProgramsMap.set(eid, (progRows as any[]).map((r) => r.programId));

    const probRows = db.select({ problemId: evidenceProblems.problemId })
      .from(evidenceProblems).where(eq(evidenceProblems.evidenceId, eid)).all();
    evidenceProblemsMap.set(eid, (probRows as any[]).map((r) => r.problemId));

    const entRows = db.select({ entityId: evidenceEntities.entityId })
      .from(evidenceEntities).where(eq(evidenceEntities.evidenceId, eid)).all();
    evidenceEntityMap.set(eid, (entRows as any[]).map((r) => r.entityId));
  }

  const adjacency = new Map<number, Set<number>>();
  for (const eid of allEvidenceIds) adjacency.set(eid, new Set());

  let edgeCount = 0;
  let connCount = 0;
  let graphEdgeCount = 0;

  for (let i = 0; i < allEvidenceIds.length; i++) {
    const eid = allEvidenceIds[i];
    const programIds = evidenceProgramsMap.get(eid) || [];
    const problemIds = evidenceProblemsMap.get(eid) || [];
    const entityIds = evidenceEntityMap.get(eid) || [];

    for (let j = i + 1; j < allEvidenceIds.length; j++) {
      const otherId = allEvidenceIds[j];
      const otherProgramIds = evidenceProgramsMap.get(otherId) || [];
      const otherProblemIds = evidenceProblemsMap.get(otherId) || [];
      const otherEntityIds = evidenceEntityMap.get(otherId) || [];

      let weight = 0;
      let reason = "";

      const sharedPrograms = programIds.filter((pid) => otherProgramIds.includes(pid));
      if (sharedPrograms.length > 0) {
        weight += 0.5;
        reason = `Shares ${sharedPrograms.length} program(s)`;
      }

      const sharedProblems = problemIds.filter((pid) => otherProblemIds.includes(pid));
      if (sharedProblems.length > 0) {
        weight += 0.3;
        reason += reason ? `, ${sharedProblems.length} problem(s)` : `${sharedProblems.length} problem(s)`;
      }

      const sharedEntities = entityIds.filter((eid2) => otherEntityIds.includes(eid2));
      if (sharedEntities.length >= 2) {
        weight += 0.15;
        reason += reason ? `, ${sharedEntities.length} shared entities` : `${sharedEntities.length} shared entities`;
      }

      if (weight > 0) {
        const sourceId = Math.min(eid, otherId);
        const targetId = Math.max(eid, otherId);

        try {
          db.insert(storyRelationships).values({
            sourceEvidenceId: sourceId,
            targetEvidenceId: targetId,
            relationshipType: weight > 0.6 ? "strong_connection" : "related",
            weight,
            confidence: 0.6,
            explicit: true,
            reason: reason || "Shared context",
          }).run();
          edgeCount++;

          adjacency.get(eid)!.add(otherId);
          adjacency.get(otherId)!.add(eid);
        } catch (e: any) {
          if (!e.message?.includes("UNIQUE constraint failed")) {
            console.error(`[worker] Failed to insert story relationship ${sourceId}-${targetId}:`, e);
          }
        }

        try {
          db.insert(evidenceConnections).values({
            evidenceIdA: sourceId,
            evidenceIdB: targetId,
            signalType: weight > 0.6 ? "strong_connection" : "shared_context",
            strength: weight,
            reason: reason || "Shared context",
          }).run();
          connCount++;
        } catch (e: any) {
          if (!e.message?.includes("UNIQUE constraint failed")) {
            console.error(`[worker] Failed to insert evidence connection ${sourceId}-${targetId}:`, e);
          }
        }

        try {
          db.insert(storyGraphEdges).values({
            evidenceIdA: sourceId,
            evidenceIdB: targetId,
            relationshipType: weight > 0.6 ? "strong_connection" : "shared_context",
            weight,
            confidence: 0.6,
            explicit: true,
            explanation: reason || "Shared context",
            sourceEvidence: "simple_graph",
          }).run();
          graphEdgeCount++;
        } catch (e: any) {
          if (!e.message?.includes("UNIQUE constraint failed")) {
            console.error(`[worker] Failed to insert story graph edge ${sourceId}-${targetId}:`, e);
          }
        }

        // Also create context_graph_edges (v4 context graph layer)
        try {
          db.insert(contextGraphEdges).values({
            evidenceIdA: sourceId,
            evidenceIdB: targetId,
            relationshipType: weight > 0.6 ? "strong_connection" : "shared_context",
            weight,
            confidence: 0.6,
            explicit: true,
            explanation: reason || "Shared context",
            sourceEvidence: "simple_graph",
          }).run();
        } catch (e: any) {
          if (!e.message?.includes("UNIQUE constraint failed")) {
            console.error(`[worker] Failed to insert context graph edge ${sourceId}-${targetId}:`, e);
          }
        }
      }
    }
  }

  console.log(`[worker] Simple graph built: ${edgeCount} storyRelationships, ${connCount} evidenceConnections, ${graphEdgeCount} storyGraphEdges`);

  // Find connected components
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const eid of allEvidenceIds) {
    if (visited.has(eid)) continue;
    const component: number[] = [];
    const stack = [eid];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (component.length >= 1) components.push(component.sort((a, b) => a - b));
  }

  console.log(`[worker] Found ${components.length} connected components`);

  function generateClusterName(component: number[]): string {
    if (component.length === 1) {
      const ev = db.select({ title: evidence.title }).from(evidence).where(eq(evidence.id, component[0])).get();
      return ev?.title ? ev.title.substring(0, 120) : `Evidence ${component[0]}`;
    }

    const firstProgs = evidenceProgramsMap.get(component[0]) || [];
    const sharedProgIds = firstProgs.filter((pid) =>
      component.slice(1).every((eid) => (evidenceProgramsMap.get(eid) || []).includes(pid))
    );

    if (sharedProgIds.length > 0) {
      const progNames = sharedProgIds.map((pid) => {
        const p = db.select({ name: programs.name }).from(programs).where(eq(programs.id, pid)).get();
        return p?.name || "";
      }).filter(Boolean);
      if (progNames.length > 0) return progNames.join(" / ").substring(0, 120);
    }

    const firstEnts = evidenceEntityMap.get(component[0]) || [];
    const sharedEntIds = firstEnts.filter((eid2) =>
      component.slice(1).every((eid) => (evidenceEntityMap.get(eid) || []).includes(eid2))
    );

    if (sharedEntIds.length > 0) {
      const entNames = sharedEntIds.map((eid2) => {
        const e = db.select({ name: entities.name }).from(entities).where(eq(entities.id, eid2)).get();
        return e?.name || "";
      }).filter(Boolean);
      if (entNames.length > 0) return entNames.slice(0, 3).join(" / ").substring(0, 120);
    }

    const firstEv = db.select({ title: evidence.title }).from(evidence).where(eq(evidence.id, component[0])).get();
    const base = firstEv?.title ? firstEv.title.substring(0, 80) : `Cluster ${component.join("-")}`;
    return `${base} and related documents`.substring(0, 120);
  }

  function generateClusterOverview(component: number[]): string {
    const evTitles = component.map((eid) => {
      const ev = db.select({ title: evidence.title }).from(evidence).where(eq(evidence.id, eid)).get();
      return ev?.title || `Evidence ${eid}`;
    });
    return `Auto-discovered story from ${component.length} related evidence items: ${evTitles.map((t) => `"${t.substring(0, 60)}..."`).join(", ")}`;
  }

  let storyCount = 0;
  let candidateCount = 0;
  const now = new Date().toISOString();

  for (const component of components) {
    const name = generateClusterName(component);
    const overview = generateClusterOverview(component);
    const evidenceIdsJson = JSON.stringify(component);

    // Idempotent candidate creation: check by evidence signature
    let candidateId: number | null = null;
    const allCandidates = db.select().from(storyCandidates).all();

    // First: try exact evidence signature match
    for (const cand of allCandidates as any[]) {
      try {
        const candIds: number[] = JSON.parse(cand.evidenceIds || "[]");
        if (candIds.length === component.length && component.every((id) => candIds.includes(id))) {
          candidateId = cand.id;
          break;
        }
      } catch {
        // ignore parse errors
      }
    }

    // Second: try name match (same conceptual story, evidence may have grown)
    if (!candidateId) {
      for (const cand of allCandidates as any[]) {
        if (cand.name === name) {
          candidateId = cand.id;
          // Update the existing candidate with the new/larger evidence set
          try {
            db.update(storyCandidates)
              .set({
                evidenceIds: evidenceIdsJson,
                coherenceScore: Math.min(0.95, 0.5 + component.length * 0.1),
                confidence: Math.min(0.95, 0.5 + component.length * 0.08),
                status: component.length >= 2 ? "story" : "candidate",
                isValid: component.length >= 2,
              })
              .where(eq(storyCandidates.id, candidateId))
              .run();
            console.log(`[worker] Updated candidate ${candidateId}: "${name}" now has ${component.length} evidence items`);
          } catch (e) {
            console.error(`[worker] Failed to update candidate ${candidateId}:`, e);
          }
          break;
        }
      }
    }

    if (candidateId) {
      console.log(`[worker] Reusing existing candidate ${candidateId} for component [${component.join(",")}]`);
    } else {
      const candResult = db.insert(storyCandidates).values({
        name,
        description: overview,
        evidenceIds: evidenceIdsJson,
        seedType: "program_cluster",
        coherenceScore: Math.min(0.95, 0.5 + component.length * 0.1),
        confidence: Math.min(0.95, 0.5 + component.length * 0.08),
        status: component.length >= 2 ? "story" : "candidate",
        reasons: JSON.stringify(["Auto-discovered via shared programs/problems/entities"]),
        relationshipCounts: JSON.stringify({ strong: 0, medium: 0, weak: 0, total: 0 }),
        isValid: component.length >= 2,
        provenanceEdges: "[]",
      }).run();
      candidateId = Number(candResult.lastInsertRowid);
      candidateCount++;
      console.log(`[worker] Created story candidate ${candidateId}: "${name}" (${component.length} items)`);
    }

    // Link evidence to candidate (idempotent)
    let linkedCount = 0;
    for (const eid of component) {
      try {
        db.insert(storyCandidateEvidence).values({
          storyCandidateId: candidateId,
          evidenceId: eid,
          role: "member",
          attachmentReason: "Shared context",
        }).run();
        linkedCount++;
      } catch (e: any) {
        if (!e.message?.includes("UNIQUE constraint failed")) {
          console.error(`[worker] Failed to link evidence ${eid} to candidate ${candidateId}:`, e);
        }
      }
    }
    if (linkedCount > 0) {
      console.log(`[worker] Linked ${linkedCount} evidence items to candidate ${candidateId}`);
    }

    // Only create stories for multi-evidence clusters (>= 2)
    if (component.length >= 2) {
      // Ensure candidate status is "story" (promote from "candidate" if needed)
      try {
        db.update(storyCandidates)
          .set({ status: "story", isValid: true })
          .where(eq(storyCandidates.id, candidateId))
          .run();
      } catch (e) {
        // ignore update errors
      }

      // Idempotent story creation: check by title
      let storyId: number | null = null;
      const existingStory = db.select().from(stories).where(eq(stories.title, name)).get();
      if (!existingStory) {
        const storyResult = db.insert(stories).values({
          title: name,
          overview,
          status: "active",
          confidence: Math.min(0.95, 0.5 + component.length * 0.08),
          generationType: "auto",
          clusterIds: JSON.stringify([candidateId]),
          createdBy: 1,
          createdAt: now,
          updatedAt: now,
        }).run();
        storyId = Number(storyResult.lastInsertRowid);
        storyCount++;
        console.log(`[worker] Created story S${storyId}: "${name}" (${component.length} evidence)`);
      } else {
        storyId = existingStory.id;
        console.log(`[worker] Reusing existing story S${storyId}: "${name}"`);
      }

      // Link evidence to story (idempotent)
      if (storyId) {
        let storyLinked = 0;
        for (const eid of component) {
          try {
            db.insert(storyEvidence).values({
              storyId,
              evidenceId: eid,
              confidence: 0.75,
              relationshipType: "related",
            }).run();
            storyLinked++;
          } catch (e: any) {
            if (!e.message?.includes("UNIQUE constraint failed")) {
              console.error(`[worker] Failed to link evidence ${eid} to story ${storyId}:`, e);
            }
          }
        }
        console.log(`[worker] Linked ${storyLinked} evidence items to story S${storyId}`);
      }
    }
  }

  console.log(`[worker] Created ${storyCount} stories and ${candidateCount} candidates total`);
}

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

      const eventRows = db.select({
        id: events.id, name: events.name, normalizedName: events.normalizedName,
        description: events.description, temporalInfo: events.temporalInfo, eventType: events.eventType,
      })
        .from(evidenceEvents)
        .innerJoin(events, eq(evidenceEvents.eventId, events.id))
        .where(eq(evidenceEvents.evidenceId, eid))
        .all();

      const problemRows = db.select({
        id: problems.id, name: problems.name, normalizedName: problems.normalizedName,
        description: problems.description, severity: problems.severity,
      })
        .from(evidenceProblems)
        .innerJoin(problems, eq(evidenceProblems.problemId, problems.id))
        .where(eq(evidenceProblems.evidenceId, eid))
        .all();

      const outcomeRows = db.select({
        id: outcomes.id, name: outcomes.name, normalizedName: outcomes.normalizedName,
        description: outcomes.description, metric: outcomes.metric,
      })
        .from(evidenceOutcomes)
        .innerJoin(outcomes, eq(evidenceOutcomes.outcomeId, outcomes.id))
        .where(eq(evidenceOutcomes.evidenceId, eid))
        .all();

      const actorRows = db.select({
        id: actors.id, name: actors.name, normalizedName: actors.normalizedName,
        actorType: actors.actorType,
      })
        .from(evidenceActors)
        .innerJoin(actors, eq(evidenceActors.actorId, actors.id))
        .where(eq(evidenceActors.evidenceId, eid))
        .all();

      const evRow = db.select({ content: evidence.content, title: evidence.title })
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
        .from(evidencePrograms).where(eq(evidencePrograms.evidenceId, eid)).all();
      const factCount = db.select({ count: facts.id })
        .from(facts).where(eq(facts.evidenceId, eid)).all();
      const entityCount = db.select({ count: evidenceEntities.entityId })
        .from(evidenceEntities).where(eq(evidenceEntities.evidenceId, eid)).all();

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
        actorIds: intel?.actors.map((a: any) => a.id) || [],
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
// NARRATIVE GENERATION (FIXED — robust fallback)
// ═════════════════════════════════════════════════════════════════

async function generateNarrativesForValidatedStories(): Promise<void> {
  try {
    // Process ALL candidates with >= 2 evidence items, regardless of status.
    // The v4 pipeline may leave rich multi-evidence candidates as "candidate" status.
    const allCandidates = db.select()
      .from(storyCandidates)
      .where(inArray(storyCandidates.status, ["validated", "promoted", "story", "candidate"]))
      .all();

    const multiEvidenceCandidates = (allCandidates as any[]).filter((c) => {
      try {
        const ids: number[] = JSON.parse(c.evidenceIds || "[]");
        return ids.length >= 2;
      } catch {
        return false;
      }
    });

    if (multiEvidenceCandidates.length === 0) {
      console.log(`[worker] No candidates for narrative generation`);
      return;
    }

    console.log(`[worker] Generating narratives for ${multiEvidenceCandidates.length} multi-evidence candidates`);

    for (const candidate of multiEvidenceCandidates) {
      try {
        const candidateIdStr = JSON.stringify([candidate.id]);
        const existing = db.select().from(narratives)
          .where(eq(narratives.clusterIds, candidateIdStr))
          .get();
        if (existing) {
          console.log(`[worker] Candidate ${candidate.id} already has a narrative, skipping`);
          continue;
        }

        const evidenceRows = db.select({ evidenceId: storyCandidateEvidence.evidenceId })
          .from(storyCandidateEvidence)
          .where(eq(storyCandidateEvidence.storyCandidateId, candidate.id))
          .all();

        const evidenceIds = (evidenceRows as any[]).map((r) => r.evidenceId);

        let title = candidate.name;
        let overview = candidate.description || "";
        let confidence = candidate.confidence ?? 0.5;

        // Try rich narrative generation via LLM if available
        let usedLLM = false;
        try {
          const { proposeStoryFromEvidence } = await import("@/lib/ai/stories");
          const evidenceItems = [];
          for (const eid of evidenceIds) {
            const ev = db.select({ title: evidence.title, content: evidence.content })
              .from(evidence)
              .where(eq(evidence.id, eid))
              .get();
            if (ev) {
              evidenceItems.push({
                id: eid,
                title: ev.title || `Evidence ${eid}`,
                summary: (ev.content || "").slice(0, 300),
                topics: { topics: [], themes: [], geographicFocus: [], temporalRange: { start: "", end: "" }, keyEntities: [], sector: [] },
                entities: [],
              });
            }
          }
          if (evidenceItems.length > 0) {
            const proposal = await proposeStoryFromEvidence(evidenceItems);
            title = proposal.title;
            overview = proposal.overview;
            confidence = proposal.confidence ?? confidence;
            usedLLM = true;
            console.log(`[worker] Rich narrative generated for "${title}"`);
          }
        } catch (richErr) {
          console.log(`[worker] Rich narrative generation unavailable, using fallback`);
        }

        // Fallback: build overview from evidence titles if LLM didn't run
        if (!usedLLM && evidenceIds.length > 0) {
          const evTitles = evidenceIds.map((eid: number) => {
            const ev = db.select({ title: evidence.title }).from(evidence).where(eq(evidence.id, eid)).get();
            return ev?.title || `Evidence ${eid}`;
          });
          overview = `This narrative connects ${evidenceIds.length} related evidence items: ${evTitles.map((t: string) => `"${t.substring(0, 60)}..."`).join(", ")}. Key themes include ${candidate.name}.`;
          confidence = Math.min(0.9, 0.5 + evidenceIds.length * 0.1);
        }

        db.insert(narratives).values({
          title,
          overview,
          clusterIds: JSON.stringify([candidate.id]),
          evidenceIds: JSON.stringify(evidenceIds),
          confidence,
          generationType: "auto",
          createdBy: 1,
        }).run();

        console.log(`[worker] Created narrative: "${title}"`);

      } catch (e) {
        console.error(`[worker] Failed to generate narrative for candidate ${candidate.id}:`, e);
      }
    }
  } catch (err) {
    console.error(`[worker] Narrative generation failed:`, err);
  }
}

// ═════════════════════════════════════════════════════════════════
// FULL CORPUS REBUILD & DISCOVERY PIPELINE
// ═════════════════════════════════════════════════════════════════

export async function runDiscoveryPipeline(): Promise<{ success: boolean; message: string; candidatesCreated?: number }> {
  console.log("[worker] Running discovery pipeline");
  try {
    const allEvidence = db.select({ id: evidence.id }).from(evidence).all();
    const allEvidenceIds = (allEvidence as any[]).map((e) => e.id);

    if (allEvidenceIds.length < 1) {
      return { success: false, message: "No evidence to process" };
    }

    await rebuildStoryGraph(allEvidenceIds);
    await generateNarrativesForValidatedStories();

    const candidateCount = (db.select({ count: sql`COUNT(*)` }).from(storyCandidates).get() as any)?.count || 0;

    return {
      success: true,
      message: `Discovery complete for ${allEvidenceIds.length} evidence items`,
      candidatesCreated: candidateCount,
    };
  } catch (err) {
    console.error("[worker] Discovery pipeline failed:", err);
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function triggerFullCorpusRebuild(): Promise<void> {
  console.log("[worker] Triggering full corpus rebuild");
  const result = await runDiscoveryPipeline();
  if (!result.success) {
    console.log("[worker] Full corpus rebuild skipped:", result.message);
  } else {
    console.log("[worker] Full corpus rebuild complete:", result.message);
  }
}
