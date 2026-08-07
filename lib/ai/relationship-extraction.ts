/**
 * ATIS v4 — Story-Bearing Relationship Extraction
 * 
 * Generates typed, weighted, explainable relationships between
 * evidence items using two mechanisms:
 * 
 *   1. ALGORITHMIC (primary): Compares intelligence nodes
 *      (programs, events, problems, outcomes, actors) extracted
 *      in TURN 3. Deterministic, O(n²), no LLM calls.
 * 
 *   2. LLM VALIDATION (secondary): For ambiguous or high-stakes
 *      relationships, the LLM validates semantic meaning.
 * 
 * The LLM extracts semantic facts and types.
 * The ALGORITHM assigns the final weight (see scoring.ts, TURN 5).
 * 
 * CRITICAL: Generic overlap (same_country, same_actor alone) does
 * NOT create story edges. These are generated as weak contextual
 * edges but flagged for suppression.
 */

import {
  type StoryBearingRelationship,
  type RelationshipType,
  RELATIONSHIP_TYPE_WEIGHTS,
  getRelationshipTypeWeight,
  type Program,
  type Event,
  type Problem,
  type Outcome,
  type Actor,
} from "@/lib/graph/story-types";
import { namesMatch, normalizeName } from "./programs";
import { generateWithAI } from "./index";

// ═════════════════════════════════════════════════════════════════
// 1. EVIDENCE WITH INTELLIGENCE (input shape)
// ═════════════════════════════════════════════════════════════════

export interface EvidenceWithIntelligence {
  evidenceId: number;
  title: string;
  text: string;
  programs: Program[];
  events: Event[];
  problems: Problem[];
  outcomes: Outcome[];
  actors: Actor[];
  /** v3 facts for causal language detection */
  facts: Array<{ subject: string; predicate: string; object: string; confidence: number }>;
  /** v3 entities for generic overlap detection */
  entities: Array<{ name: string; type: string }>;
  /** Pre-computed single-document assessment */
  hasProgramReference: boolean;
  isGenericInstitutionalPage: boolean;
}

// ═════════════════════════════════════════════════════════════════
// 2. ALGORITHMIC RELATIONSHIP GENERATORS
// ═════════════════════════════════════════════════════════════════

/**
 * Generate ALL candidate relationships between two evidence items.
 * 
 * This is the primary mechanism. It is:
 *   - Pure (no side effects)
 *   - Deterministic (same inputs → same outputs)
 *   - Fast (O(1) per pair after extraction)
 *   - Explainable (every relationship has a human-readable reason)
 * 
 * The returned relationships have BASE weights from the taxonomy.
 * Final weight computation happens in scoring.ts (TURN 5).
 */
export function generateInferredRelationships(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const relationships: StoryBearingRelationship[] = [];

  // ── Tier 1: Strong ────────────────────────────────────────────
  relationships.push(...comparePrograms(a, b));
  relationships.push(...compareEvents(a, b));
  relationships.push(...compareProblemsAndPrograms(a, b));
  relationships.push(...compareOutcomes(a, b));
  relationships.push(...detectCausalRelationships(a, b));

  // ── Tier 2: Medium ────────────────────────────────────────────
  relationships.push(...detectPolicyAlignment(a, b));
  relationships.push(...detectCausalChainOverlap(a, b));

  // ── Tier 3: Weak contextual ───────────────────────────────────
  relationships.push(...compareActors(a, b));
  relationships.push(...detectGenericOverlap(a, b));

  // Deduplicate: keep the highest-weight relationship per type
  return deduplicateRelationships(relationships);
}

// ── Program Comparison ──────────────────────────────────────────

function comparePrograms(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  for (const pa of a.programs) {
    for (const pb of b.programs) {
      if (namesMatch(pa.name, pb.name)) {
        const type: RelationshipType = inferProgramRelationshipType(pa, pb);
        const baseWeight = getRelationshipTypeWeight(type);

        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type,
          weight: baseWeight,
          confidence: 0.95,
          explicit: true,
          reason: `Both documents explicitly reference ${pa.name}${pa.name !== pb.name ? ` / ${pb.name}` : ""}.`,
          sourceProgramId: pa.id,
        });
      }
    }
  }

  return results;
}

function inferProgramRelationshipType(pa: Program, pb: Program): RelationshipType {
  // If one is a project and the other is the parent program
  if (pa.type === "project" && pb.type === "program") return "part_of_program";
  if (pa.type === "program" && pb.type === "project") return "part_of_program";
  if (pa.type === "initiative" || pb.type === "initiative") return "same_initiative";
  if (pa.type === "project" || pb.type === "project") return "same_project";
  return "same_program";
}

// ── Event Comparison ────────────────────────────────────────────

function compareEvents(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  for (const ea of a.events) {
    for (const eb of b.events) {
      if (namesMatch(ea.name, eb.name)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "follows_event",
          weight: getRelationshipTypeWeight("follows_event"),
          confidence: 0.85,
          explicit: true,
          reason: `Both documents describe the event "${ea.name}".`,
          sourceEventId: ea.id,
        });
        continue;
      }

      // Temporal sequencing: if events concern the same program but different stages
      const sameProgramContext = a.programs.some((pa) =>
        b.programs.some((pb) => namesMatch(pa.name, pb.name))
      );

      if (sameProgramContext && ea.temporalInfo && eb.temporalInfo) {
        const temporalRelation = inferTemporalRelation(ea, eb);
        if (temporalRelation) {
          results.push({
            sourceEvidenceId: a.evidenceId,
            targetEvidenceId: b.evidenceId,
            type: temporalRelation,
            weight: getRelationshipTypeWeight(temporalRelation),
            confidence: 0.75,
            explicit: false,
            reason: `Events concerning the same program: "${ea.name}" (${ea.temporalInfo}) and "${eb.name}" (${eb.temporalInfo}) appear to be sequentially related.`,
            sourceEventId: ea.id,
          });
        }
      }
    }
  }

  return results;
}

function inferTemporalRelation(ea: Event, eb: Event): "precedes_event" | "follows_event" | null {
  // Try to parse dates for explicit ordering
  const dateA = parseLooseDate(ea.temporalInfo);
  const dateB = parseLooseDate(eb.temporalInfo);

  if (dateA && dateB) {
    if (dateA < dateB) return "precedes_event";
    if (dateA > dateB) return "follows_event";
  }

  // Event type heuristics
  const sequenceOrder: Record<string, number> = {
    approval: 1,
    launch: 2,
    award: 3,
    trigger: 4,
    occurrence: 5,
    completion: 6,
    release: 7,
    other: 0,
  };

  const orderA = sequenceOrder[ea.eventType || "other"] ?? 0;
  const orderB = sequenceOrder[eb.eventType || "other"] ?? 0;

  if (orderA > 0 && orderB > 0 && orderA !== orderB) {
    return orderA < orderB ? "precedes_event" : "follows_event";
  }

  return null;
}

function parseLooseDate(text: string | undefined): Date | null {
  if (!text) return null;
  // Try ISO date
  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso;

  // Try year extraction
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return new Date(year, 0, 1);
  }

  return null;
}

// ── Problem ↔ Program Relationships ─────────────────────────────

function compareProblemsAndPrograms(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  // Document A's program addresses Document B's problem
  for (const prog of a.programs) {
    for (const prob of b.problems) {
      if (programAddressesProblem(prog, prob, a.facts)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "addresses_problem",
          weight: getRelationshipTypeWeight("addresses_problem"),
          confidence: 0.75,
          explicit: false,
          reason: `${prog.name} in E${a.evidenceId} addresses the problem "${prob.name}" identified in E${b.evidenceId}.`,
          sourceProgramId: prog.id,
          sourceProblemId: prob.id,
        });
      }
    }
  }

  // Document B's program addresses Document A's problem
  for (const prog of b.programs) {
    for (const prob of a.problems) {
      if (programAddressesProblem(prog, prob, b.facts)) {
        results.push({
          sourceEvidenceId: b.evidenceId,
          targetEvidenceId: a.evidenceId,
          type: "addresses_problem",
          weight: getRelationshipTypeWeight("addresses_problem"),
          confidence: 0.75,
          explicit: false,
          reason: `${prog.name} in E${b.evidenceId} addresses the problem "${prob.name}" identified in E${a.evidenceId}.`,
          sourceProgramId: prog.id,
          sourceProblemId: prob.id,
        });
      }
    }
  }

  // Same problem across documents (medium signal)
  for (const pa of a.problems) {
    for (const pb of b.problems) {
      if (namesMatch(pa.name, pb.name)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "same_causal_chain",
          weight: getRelationshipTypeWeight("same_causal_chain"),
          confidence: 0.70,
          explicit: true,
          reason: `Both documents identify the same problem: "${pa.name}".`,
          sourceProblemId: pa.id,
        });
      }
    }
  }

  return results;
}

/**
 * Heuristic: does a program address a problem?
 * Checks for co-occurrence in facts with causal predicates.
 */
function programAddressesProblem(
  program: Program,
  problem: Problem,
  facts: EvidenceWithIntelligence["facts"]
): boolean {
  const progNorm = normalizeName(program.name);
  const probNorm = normalizeName(problem.name);

  // Direct co-occurrence in facts
  for (const fact of facts) {
    const subjNorm = normalizeName(fact.subject);
    const objNorm = normalizeName(fact.object);
    const pred = fact.predicate.toLowerCase();

    const causalPredicates = [
      "address", "addresses", "tackle", "tackles", "combat", "combats",
      "reduce", "reduces", "mitigate", "mitigates", "resolve", "resolves",
      "respond", "responds", "target", "targets", "fight", "fights",
      "alleviate", "alleviates", "solve", "solves", "treat", "treats",
    ];

    const isCausal = causalPredicates.some((cp) => pred.includes(cp));

    if (isCausal) {
      const subjMatches = subjNorm.includes(progNorm) || progNorm.includes(subjNorm);
      const objMatches = objNorm.includes(probNorm) || probNorm.includes(objNorm);
      if (subjMatches && objMatches) return true;

      // Reverse: problem is subject, program is object
      const subjMatchesProb = subjNorm.includes(probNorm) || probNorm.includes(subjNorm);
      const objMatchesProg = objNorm.includes(progNorm) || progNorm.includes(objNorm);
      if (subjMatchesProb && objMatchesProg) return true;
    }
  }

  // Fallback: simple name overlap in the same document
  // (This is intra-document; for inter-document we need more evidence)
  return false;
}

// ── Outcome Comparison ──────────────────────────────────────────

function compareOutcomes(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  for (const oa of a.outcomes) {
    for (const ob of b.outcomes) {
      if (namesMatch(oa.name, ob.name)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "same_outcome",
          weight: getRelationshipTypeWeight("same_outcome"),
          confidence: 0.80,
          explicit: true,
          reason: `Both documents report the same outcome: "${oa.name}".`,
          sourceOutcomeId: oa.id,
        });
      }
    }
  }

  // Program → Outcome causal links
  for (const prog of a.programs) {
    for (const out of b.outcomes) {
      if (programProducesOutcome(prog, out, a.facts)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "results_in",
          weight: getRelationshipTypeWeight("results_in"),
          confidence: 0.80,
          explicit: false,
          reason: `${prog.name} in E${a.evidenceId} results in the outcome "${out.name}" reported in E${b.evidenceId}.`,
          sourceProgramId: prog.id,
          sourceOutcomeId: out.id,
        });
      }
    }
  }

  return results;
}

function programProducesOutcome(
  program: Program,
  outcome: Outcome,
  facts: EvidenceWithIntelligence["facts"]
): boolean {
  const progNorm = normalizeName(program.name);
  const outNorm = normalizeName(outcome.name);

  for (const fact of facts) {
    const subjNorm = normalizeName(fact.subject);
    const objNorm = normalizeName(fact.object);
    const pred = fact.predicate.toLowerCase();

    const resultPredicates = [
      "produce", "produces", "result", "results", "achieve", "achieves",
      "deliver", "delivers", "reach", "reaches", "generate", "generates",
      "lead", "leads", "create", "creates", "yield", "yields",
    ];

    const isResult = resultPredicates.some((rp) => pred.includes(rp));

    if (isResult) {
      const subjMatches = subjNorm.includes(progNorm) || progNorm.includes(subjNorm);
      const objMatches = objNorm.includes(outNorm) || outNorm.includes(objNorm);
      if (subjMatches && objMatches) return true;
    }
  }

  return false;
}

// ── Causal Relationship Detection ───────────────────────────────

function detectCausalRelationships(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  // Check if events in A trigger programs/problems in B
  for (const evt of a.events) {
    for (const prog of b.programs) {
      if (eventTriggersProgram(evt, prog, [...a.facts, ...b.facts])) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "triggered_by",
          weight: getRelationshipTypeWeight("triggered_by"),
          confidence: 0.80,
          explicit: false,
          reason: `The event "${evt.name}" in E${a.evidenceId} appears to have triggered or motivated ${prog.name} in E${b.evidenceId}.`,
          sourceEventId: evt.id,
          sourceProgramId: prog.id,
        });
      }
    }
  }

  // Check if problems in A cause programs in B
  for (const prob of a.problems) {
    for (const prog of b.programs) {
      if (problemCausesProgram(prob, prog, [...a.facts, ...b.facts])) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "causes",
          weight: getRelationshipTypeWeight("causes"),
          confidence: 0.78,
          explicit: false,
          reason: `The problem "${prob.name}" in E${a.evidenceId} appears to have caused or motivated ${prog.name} in E${b.evidenceId}.`,
          sourceProblemId: prob.id,
          sourceProgramId: prog.id,
        });
      }
    }
  }

  return results;
}

function eventTriggersProgram(
  event: Event,
  program: Program,
  facts: EvidenceWithIntelligence["facts"]
): boolean {
  const evtNorm = normalizeName(event.name);
  const progNorm = normalizeName(program.name);

  // Event type heuristics
  const triggerTypes = ["trigger", "occurrence", "approval", "launch"];
  if (!triggerTypes.includes(event.eventType || "")) return false;

  for (const fact of facts) {
    const subjNorm = normalizeName(fact.subject);
    const objNorm = normalizeName(fact.object);
    const pred = fact.predicate.toLowerCase();

    const triggerPredicates = [
      "trigger", "triggers", "prompt", "prompts", "spur", "spurs",
      "lead", "leads", "drive", "drives", "motivate", "motivates",
      "respond", "responds", "launch", "launches",
    ];

    const isTrigger = triggerPredicates.some((tp) => pred.includes(tp));

    if (isTrigger) {
      const subjMatches = subjNorm.includes(evtNorm) || evtNorm.includes(subjNorm);
      const objMatches = objNorm.includes(progNorm) || progNorm.includes(objNorm);
      if (subjMatches && objMatches) return true;
    }
  }

  return false;
}

function problemCausesProgram(
  problem: Problem,
  program: Program,
  facts: EvidenceWithIntelligence["facts"]
): boolean {
  const probNorm = normalizeName(problem.name);
  const progNorm = normalizeName(program.name);

  for (const fact of facts) {
    const subjNorm = normalizeName(fact.subject);
    const objNorm = normalizeName(fact.object);
    const pred = fact.predicate.toLowerCase();

    const causePredicates = [
      "cause", "causes", "drive", "drives", "prompt", "prompts",
      "lead", "leads", "necessitate", "necessitates", "require", "requires",
    ];

    const isCause = causePredicates.some((cp) => pred.includes(cp));

    if (isCause) {
      const subjMatches = subjNorm.includes(probNorm) || probNorm.includes(subjNorm);
      const objMatches = objNorm.includes(progNorm) || progNorm.includes(objNorm);
      if (subjMatches && objMatches) return true;
    }
  }

  return false;
}

// ── Policy Alignment Detection ──────────────────────────────────

function detectPolicyAlignment(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  // Same policy area: both concern PFM, procurement, agriculture, etc.
  // Detected via program type overlap + actor overlap
  const sharedPolicyArea = inferSharedPolicyArea(a, b);
  if (sharedPolicyArea) {
    results.push({
      sourceEvidenceId: a.evidenceId,
      targetEvidenceId: b.evidenceId,
      type: "same_policy_area",
      weight: getRelationshipTypeWeight("same_policy_area"),
      confidence: 0.65,
      explicit: false,
      reason: `Both documents concern ${sharedPolicyArea}: E${a.evidenceId} addresses ${a.programs.map((p) => p.name).join(", ") || "relevant programs"}; E${b.evidenceId} addresses ${b.programs.map((p) => p.name).join(", ") || "relevant programs"}.`,
    });
  }

  // Strategic continuity: reform trajectory
  if (hasReformTrajectory(a) && hasReformTrajectory(b)) {
    const sharedReformActors = a.actors.filter((aa) =>
      b.actors.some((ba) => namesMatch(aa.name, ba.name))
    );
    if (sharedReformActors.length > 0) {
      results.push({
        sourceEvidenceId: a.evidenceId,
        targetEvidenceId: b.evidenceId,
        type: "aligned_with",
        weight: getRelationshipTypeWeight("aligned_with"),
        confidence: 0.60,
        explicit: false,
        reason: `Both documents describe reform efforts aligned through shared actors (${sharedReformActors.map((a) => a.name).join(", ")}).`,
      });
    }
  }

  return results;
}

function inferSharedPolicyArea(a: EvidenceWithIntelligence, b: EvidenceWithIntelligence): string | null {
  // Map program types to policy areas
  const policyAreaMap: Record<string, string> = {
    project: "project implementation",
    initiative: "strategic initiative",
    facility: "infrastructure",
    policy: "policy reform",
    financing: "financial management",
    program: "program implementation",
  };

  const areasA = new Set(a.programs.map((p) => policyAreaMap[p.type || ""]).filter(Boolean));
  const areasB = new Set(b.programs.map((p) => policyAreaMap[p.type || ""]).filter(Boolean));

  for (const area of areasA) {
    if (areasB.has(area)) return area;
  }

  // Check for PFM keywords in problems
  const pfmKeywords = ["procurement", "financial management", "tax", "budget", "accountability", "audit", "public finance"];
  const aPfm = a.problems.some((p) => pfmKeywords.some((k) => normalizeName(p.name).includes(k)));
  const bPfm = b.problems.some((p) => pfmKeywords.some((k) => normalizeName(p.name).includes(k)));
  if (aPfm && bPfm) return "public financial management reform";

  // Check for agriculture keywords
  const agKeywords = ["food", "agriculture", "crop", "harvest", "farm", "maize", "wheat"];
  const aAg = a.problems.some((p) => agKeywords.some((k) => normalizeName(p.name).includes(k)));
  const bAg = b.problems.some((p) => agKeywords.some((k) => normalizeName(p.name).includes(k)));
  if (aAg && bAg) return "agricultural development";

  return null;
}

function hasReformTrajectory(ev: EvidenceWithIntelligence): boolean {
  const reformKeywords = ["reform", "modernization", "improvement", "overhaul", "strengthen", "upgrade"];
  const text = normalizeName(ev.text);
  return reformKeywords.some((k) => text.includes(k));
}

// ── Causal Chain Overlap ────────────────────────────────────────

function detectCausalChainOverlap(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  // If A has a problem that B's program addresses, and B has an outcome
  // that results from that program, they share a causal chain
  for (const prob of a.problems) {
    for (const prog of b.programs) {
      const probNorm = normalizeName(prob.name);
      const progNorm = normalizeName(prog.name);

      // Check if program in B is designed to address problem in A
      const addressing = b.facts.some((f) => {
        const pred = f.predicate.toLowerCase();
        const subj = normalizeName(f.subject);
        const obj = normalizeName(f.object);
        return (
          (subj.includes(progNorm) || progNorm.includes(subj)) &&
          (obj.includes(probNorm) || probNorm.includes(obj)) &&
          ["address", "addresses", "tackle", "reduce", "mitigate"].some((p) => pred.includes(p))
        );
      });

      if (addressing) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "same_causal_chain",
          weight: getRelationshipTypeWeight("same_causal_chain"),
          confidence: 0.72,
          explicit: false,
          reason: `E${a.evidenceId} identifies the problem "${prob.name}"; E${b.evidenceId} describes ${prog.name} as addressing that problem, forming a shared causal chain.`,
          sourceProblemId: prob.id,
          sourceProgramId: prog.id,
        });
      }
    }
  }

  return results;
}

// ── Actor Comparison (Weak) ─────────────────────────────────────

function compareActors(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  for (const aa of a.actors) {
    for (const ba of b.actors) {
      if (namesMatch(aa.name, ba.name)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "same_actor",
          weight: getRelationshipTypeWeight("same_actor"),
          confidence: 0.70,
          explicit: true,
          reason: `Both documents mention the actor ${aa.name}. Note: actor overlap alone is a weak signal and does not independently establish story membership.`,
          sourceActorId: aa.id,
        });
      }
    }
  }

  return results;
}

// ── Generic Overlap Detection (Suppressed) ──────────────────────

function detectGenericOverlap(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence
): StoryBearingRelationship[] {
  const results: StoryBearingRelationship[] = [];

  // Country overlap
  const countryEntitiesA = a.entities.filter((e) => e.type === "location" || e.type === "country");
  const countryEntitiesB = b.entities.filter((e) => e.type === "location" || e.type === "country");
  for (const ca of countryEntitiesA) {
    for (const cb of countryEntitiesB) {
      if (namesMatch(ca.name, cb.name)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "same_country",
          weight: getRelationshipTypeWeight("same_country"),
          confidence: 0.90,
          explicit: true,
          reason: `Both documents mention ${ca.name}. This relationship is suppressed and cannot independently create story membership.`,
        });
      }
    }
  }

  // Sector/topic overlap via entity types
  const sectorTypes = ["sector", "industry", "domain", "field"];
  const sectorA = a.entities.filter((e) => sectorTypes.includes(e.type));
  const sectorB = b.entities.filter((e) => sectorTypes.includes(e.type));
  for (const sa of sectorA) {
    for (const sb of sectorB) {
      if (namesMatch(sa.name, sb.name)) {
        results.push({
          sourceEvidenceId: a.evidenceId,
          targetEvidenceId: b.evidenceId,
          type: "same_sector",
          weight: getRelationshipTypeWeight("same_sector"),
          confidence: 0.60,
          explicit: true,
          reason: `Both documents concern the ${sa.name} sector. This is a weak contextual signal.`,
        });
      }
    }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════
// 3. DEDUPLICATION
// ═════════════════════════════════════════════════════════════════

function deduplicateRelationships(
  relationships: StoryBearingRelationship[]
): StoryBearingRelationship[] {
  const best = new Map<string, StoryBearingRelationship>();

  for (const rel of relationships) {
    const key = `${rel.sourceEvidenceId}:${rel.targetEvidenceId}:${rel.type}`;
    const existing = best.get(key);
    if (!existing || rel.weight > existing.weight || (rel.weight === existing.weight && rel.confidence > existing.confidence)) {
      best.set(key, rel);
    }
  }

  return Array.from(best.values());
}

// ═════════════════════════════════════════════════════════════════
// 4. LLM VALIDATION (optional, for ambiguous cases)
// ═════════════════════════════════════════════════════════════════

/**
 * For high-stakes or ambiguous relationships, validate with the LLM.
 * This is used sparingly to avoid O(n²) LLM calls.
 * 
 * Typical use: when a relationship has borderline confidence
 * and the algorithm cannot determine explicit vs inferred.
 */
export async function validateRelationshipWithLLM(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence,
  candidate: StoryBearingRelationship
): Promise<StoryBearingRelationship> {
  const prompt = `You are validating whether two evidence documents have a specific relationship.

Document A (E${a.evidenceId}):
Title: ${a.title}
Text: ${a.text.slice(0, 2000)}

Document B (E${b.evidenceId}):
Title: ${b.title}
Text: ${b.text.slice(0, 2000)}

Proposed relationship: ${candidate.type}
Reason: ${candidate.reason}

Task: Determine if this relationship is:
1. EXPLICIT — directly stated in one or both documents
2. INFERRED — reasonably deduced but not directly stated
3. INVALID — the relationship does not exist

Return ONLY a JSON object:
{
  "valid": boolean,
  "explicit": boolean,
  "confidence": number (0.0–1.0),
  "reason": "string explaining your determination"
}`;

  try {
    const response = await generateWithAI(prompt);
    const parsed = JSON.parse(response.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());

    if (parsed.valid === false) {
      // Return the relationship with zero weight (will be filtered out)
      return { ...candidate, weight: 0, confidence: 0, reason: `INVALID: ${parsed.reason}` };
    }

    return {
      ...candidate,
      explicit: parsed.explicit ?? candidate.explicit,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : candidate.confidence,
      reason: parsed.reason || candidate.reason,
    };
  } catch {
    // If LLM validation fails, keep the original
    return candidate;
  }
}

// ═════════════════════════════════════════════════════════════════
// 5. MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════

/**
 * Extract all story-bearing relationships between two evidence items.
 * 
 * This is the primary API for relationship generation.
 * It runs the full algorithmic pipeline and optionally validates
 * borderline cases with the LLM.
 * 
 * @param a — Source evidence with intelligence
 * @param b — Target evidence with intelligence
 * @param options — Optional LLM validation for ambiguous cases
 */
export async function extractStoryBearingRelationships(
  a: EvidenceWithIntelligence,
  b: EvidenceWithIntelligence,
  options?: { llmValidateThreshold?: number }
): Promise<StoryBearingRelationship[]> {
  // Generate all candidate relationships algorithmically
  const candidates = generateInferredRelationships(a, b);

  // Optional: validate borderline cases with LLM
  if (options?.llmValidateThreshold !== undefined) {
    const validated: StoryBearingRelationship[] = [];
    for (const candidate of candidates) {
      if (candidate.confidence >= options.llmValidateThreshold && candidate.confidence < options.llmValidateThreshold + 0.15) {
        const validatedRel = await validateRelationshipWithLLM(a, b, candidate);
        if (validatedRel.weight > 0) validated.push(validatedRel);
      } else {
        validated.push(candidate);
      }
    }
    return validated;
  }

  return candidates;
}

// ═════════════════════════════════════════════════════════════════
// 6. PROMPT BUILDER (for LLM-based relationship extraction)
// ═════════════════════════════════════════════════════════════════

/**
 * Build a prompt for the LLM to extract explicit relationships
 * from a single document. This is used during the extraction phase
 * (TURN 3) to populate the relationships field of StructuredIntelligence.
 * 
 * NOTE: This is NOT the primary relationship generation mechanism.
 * The algorithmic comparison (generateInferredRelationships) is primary.
 * This prompt is a fallback for documents where the algorithm
 * cannot determine relationships from intelligence nodes alone.
 */
export function buildRelationshipExtractionPrompt(text: string): string {
  return `Extract explicit relationships between programs, events, problems, outcomes, and actors mentioned in this text.

For each relationship, specify:
- source: the subject entity/program/actor
- target: the object entity/program/actor
- type: one of [implements, funds, operationalizes, causes, triggered_by, produces, results_in, addresses_problem, supports, evaluates, aligned_with]
- evidence: the exact text supporting this relationship
- confidence: 0.0–1.0

Rules:
- Only extract relationships EXPLICITLY stated in the text.
- Do not infer relationships that are not directly supported.
- "AfDB funds ZEFPP" → type: "funds"
- "ZEFPP addresses food insecurity" → type: "addresses_problem"
- "Cyclone triggered emergency response" → type: "triggered_by"

Text:
${text.slice(0, 8000)}

Return ONLY a JSON array of relationship objects.`;
}

// ═════════════════════════════════════════════════════════════════
// 7. RAW EXTRACTION TYPE
// ═════════════════════════════════════════════════════════════════

export interface RawRelationshipExtraction {
  source: string;
  target: string;
  type: string;
  evidence?: string;
  confidence: number;
}
