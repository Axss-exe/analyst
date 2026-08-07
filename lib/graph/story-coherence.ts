/**
 * ATIS v4 — Story Coherence Validation
 * 
 * After candidate clusters are generated, calculate a Story Coherence
 * Score for each candidate. This determines whether a candidate is:
 *   - PROMOTED to a validated story
 *   - REJECTED as incoherent
 *   - KEPT as a candidate for human review
 * 
 * The coherence score considers:
 *   + program identity (strongest signal)
 *   + causal continuity (problem → intervention → outcome chain)
 *   + problem consistency (same problem across documents)
 *   + event continuity (sequenced events)
 *   + outcome consistency (aligned outcomes)
 *   + temporal coherence (chronological ordering)
 *   + evidence density (relationships per document)
 * 
 * Penalties:
 *   - generic shared location
 *   - generic shared actor
 *   - unrelated sectors
 *   - contradictory programs
 *   - unrelated causal triggers
 * 
 * Pure, deterministic, testable. No LLM calls. No DB access.
 */

import {
  type StoryCandidate,
  type StoryCoherenceScore,
  type StoryDiagnostics,
  type CausalLink,
  type StoryGraphConfig,
  DEFAULT_STORY_GRAPH_CONFIG,
  type Program,
  type Problem,
  type Event,
  type Outcome,
  type Actor,
  getRelationshipTier,
} from "./story-types";
import {
  type AggregatedEdge,
  type EvidenceQualityProfile,
} from "./scoring";
import {
  type EvidenceIntelligence,
} from "./story-cluster";

// ═════════════════════════════════════════════════════════════════
// 1. COHERENCE SCORING
// ═════════════════════════════════════════════════════════════════

/**
 * Compute the full coherence score for a story candidate.
 * 
 * Returns both the overall score and the component breakdown.
 * The overall score is a weighted combination of components
 * minus penalties.
 */
export function computeStoryCoherence(
  candidate: StoryCandidate,
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config?: Partial<StoryGraphConfig>
): { score: StoryCoherenceScore; diagnostics: StoryDiagnostics } {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };

  // ── Positive components ──────────────────────────────────────
  const programIdentity = scoreProgramIdentity(candidate, intelligenceMap);
  const causalContinuity = scoreCausalContinuity(candidate, edges, intelligenceMap);
  const problemConsistency = scoreProblemConsistency(candidate, intelligenceMap);
  const eventContinuity = scoreEventContinuity(candidate, intelligenceMap);
  const outcomeConsistency = scoreOutcomeConsistency(candidate, intelligenceMap);
  const temporalCoherence = scoreTemporalCoherence(candidate, intelligenceMap);
  const evidenceDensity = scoreEvidenceDensity(candidate, edges);

  // ── Penalties ────────────────────────────────────────────────
  const genericLocationPenalty = computeGenericLocationPenalty(candidate, intelligenceMap);
  const genericActorPenalty = computeGenericActorPenalty(candidate, intelligenceMap);
  const unrelatedSectorPenalty = computeUnrelatedSectorPenalty(candidate, intelligenceMap);
  const contradictoryProgramPenalty = computeContradictoryProgramPenalty(candidate, intelligenceMap);

  // ── Weighted combination ─────────────────────────────────────
  // Program identity is the strongest signal
  const weights = {
    programIdentity: 0.25,
    causalContinuity: 0.20,
    problemConsistency: 0.15,
    eventContinuity: 0.10,
    outcomeConsistency: 0.10,
    temporalCoherence: 0.10,
    evidenceDensity: 0.10,
  };

  let overall =
    programIdentity * weights.programIdentity +
    causalContinuity * weights.causalContinuity +
    problemConsistency * weights.problemConsistency +
    eventContinuity * weights.eventContinuity +
    outcomeConsistency * weights.outcomeConsistency +
    temporalCoherence * weights.temporalCoherence +
    evidenceDensity * weights.evidenceDensity;

  // Apply penalties (subtractive, capped at 0)
  overall -= genericLocationPenalty * 0.15;
  overall -= genericActorPenalty * 0.10;
  overall -= unrelatedSectorPenalty * 0.20;
  overall -= contradictoryProgramPenalty * 0.25;

  overall = Math.max(0, Math.min(1, parseFloat(overall.toFixed(4))));

  const score: StoryCoherenceScore = {
    overall,
    programIdentity,
    causalContinuity,
    problemConsistency,
    eventContinuity,
    outcomeConsistency,
    temporalCoherence,
    evidenceDensity,
  };

  const diagnostics: StoryDiagnostics = {
    programIdentityScore: programIdentity,
    causalContinuityScore: causalContinuity,
    problemConsistencyScore: problemConsistency,
    eventContinuityScore: eventContinuity,
    outcomeConsistencyScore: outcomeConsistency,
    temporalCoherenceScore: temporalCoherence,
    evidenceDensityScore: evidenceDensity,
    genericLocationPenalty,
    genericActorPenalty,
    unrelatedSectorPenalty,
    contradictoryProgramPenalty,
  };

  return { score, diagnostics };
}

// ═════════════════════════════════════════════════════════════════
// 2. COMPONENT SCORERS
// ═════════════════════════════════════════════════════════════════

/**
 * Program Identity Score (0–1)
 * 
 * How strongly is the candidate unified by a shared program?
 *   - All docs reference the same program → 1.0
 *   - Most docs reference the same program → 0.8
 *   - Multiple programs but related → 0.5
 *   - No program reference → 0.0
 */
function scoreProgramIdentity(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  if (candidate.evidenceIds.length === 1) {
    // Single-document story: program presence is binary
    const intel = intelligenceMap.get(candidate.evidenceIds[0]);
    if (!intel) return 0;
    return intel.programs.length > 0 ? 0.9 : 0.1;
  }

  // Count program references per document
  const programCounts = new Map<string, number>();
  let docsWithPrograms = 0;

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;

    if (intel.programs.length > 0) {
      docsWithPrograms++;
      for (const prog of intel.programs) {
        programCounts.set(prog.normalizedName, (programCounts.get(prog.normalizedName) || 0) + 1);
      }
    }
  }

  if (docsWithPrograms === 0) return 0.0;

  // Find dominant program
  let maxCount = 0;
  for (const count of programCounts.values()) {
    if (count > maxCount) maxCount = count;
  }

  const coverage = maxCount / candidate.evidenceIds.length;
  const programRatio = docsWithPrograms / candidate.evidenceIds.length;

  return parseFloat((coverage * 0.7 + programRatio * 0.3).toFixed(3));
}

/**
 * Causal Continuity Score (0–1)
 * 
 * Does the candidate form a coherent causal chain?
 *   - Problem → Program → Outcome across documents → high
 *   - Event → Program → Outcome → high
 *   - Disconnected facts → low
 */
function scoreCausalContinuity(
  candidate: StoryCandidate,
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const idSet = new Set(candidate.evidenceIds);

  // Count causal edges within the candidate
  let causalEdges = 0;
  const causalTypes = ["causes", "triggered_by", "results_in", "produces", "addresses_problem", "precedes_event", "follows_event"];

  for (const edge of edges) {
    if (!idSet.has(edge.sourceEvidenceId) || !idSet.has(edge.targetEvidenceId)) continue;

    const hasCausal = edge.contributingRelationships.some((r) =>
      causalTypes.includes(r.type)
    );
    if (hasCausal) causalEdges++;
  }

  const possibleEdges = (candidate.evidenceIds.length * (candidate.evidenceIds.length - 1)) / 2;
  const edgeDensity = possibleEdges > 0 ? causalEdges / possibleEdges : 0;

  // Check for complete causal chain: problem + program + outcome across docs
  let hasProblem = false;
  let hasProgram = false;
  let hasOutcome = false;

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    if (intel.problems.length > 0) hasProblem = true;
    if (intel.programs.length > 0) hasProgram = true;
    if (intel.outcomes.length > 0) hasOutcome = true;
  }

  const chainCompleteness = [hasProblem, hasProgram, hasOutcome].filter(Boolean).length / 3;

  return parseFloat((edgeDensity * 0.6 + chainCompleteness * 0.4).toFixed(3));
}

/**
 * Problem Consistency Score (0–1)
 * 
 * Do the documents address the same or related problems?
 */
function scoreProblemConsistency(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const problemNames: string[] = [];

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    for (const prob of intel.problems) {
      problemNames.push(prob.normalizedName);
    }
  }

  if (problemNames.length === 0) return 0.3; // Neutral if no problems stated

  // Count occurrences
  const counts = new Map<string, number>();
  for (const name of problemNames) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  // Find dominant problem
  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) maxCount = count;
  }

  const consistency = maxCount / problemNames.length;
  const coverage = Math.min(1, problemNames.length / candidate.evidenceIds.length);

  return parseFloat((consistency * 0.7 + coverage * 0.3).toFixed(3));
}

/**
 * Event Continuity Score (0–1)
 * 
 * Are events sequenced logically across documents?
 */
function scoreEventContinuity(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const events: Array<{ name: string; temporalInfo?: string; eventType?: string }> = [];

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    events.push(...intel.events);
  }

  if (events.length === 0) return 0.5; // Neutral if no events

  // Check for temporal sequencing
  const datedEvents = events.filter((e) => e.temporalInfo);
  if (datedEvents.length >= 2) {
    // Try to parse dates and check ordering
    const dates = datedEvents
      .map((e) => ({ date: parseLooseDate(e.temporalInfo), event: e }))
      .filter((d) => d.date !== null)
      .sort((a, b) => a.date!.getTime() - b.date!.getTime());

    if (dates.length >= 2) {
      return 0.85; // Clear temporal sequence
    }
  }

  // Check for event type progression
  const eventTypes = events.map((e) => e.eventType).filter(Boolean);
  if (eventTypes.length >= 2) {
    const sequenceOrder: Record<string, number> = {
      approval: 1, launch: 2, award: 3, trigger: 4,
      occurrence: 5, completion: 6, release: 7, other: 0,
    };
    const orders = eventTypes.map((t) => sequenceOrder[t!] ?? 0).filter((o) => o > 0);
    if (orders.length >= 2 && new Set(orders).size > 1) {
      return 0.75; // Event type progression
    }
  }

  // Just having events is mildly positive
  return 0.55;
}

/**
 * Outcome Consistency Score (0–1)
 * 
 * Do outcomes align across documents?
 */
function scoreOutcomeConsistency(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const outcomes: string[] = [];

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    for (const out of intel.outcomes) {
      outcomes.push(out.normalizedName);
    }
  }

  if (outcomes.length === 0) return 0.3; // Neutral if no outcomes

  const counts = new Map<string, number>();
  for (const name of outcomes) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) maxCount = count;
  }

  const consistency = maxCount / outcomes.length;
  return parseFloat((consistency * 0.8 + 0.2).toFixed(3));
}

/**
 * Temporal Coherence Score (0–1)
 * 
 * Are documents temporally aligned?
 */
function scoreTemporalCoherence(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const dates: Date[] = [];

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    for (const evt of intel.events) {
      const d = parseLooseDate(evt.temporalInfo);
      if (d) dates.push(d);
    }
  }

  if (dates.length === 0) return 0.5; // Neutral
  if (dates.length === 1) return 0.6; // Single date

  // Check date range
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const rangeMs = maxDate.getTime() - minDate.getTime();
  const rangeYears = rangeMs / (1000 * 60 * 60 * 24 * 365);

  if (rangeYears <= 1) return 0.9; // Tight temporal cluster
  if (rangeYears <= 3) return 0.75; // Reasonable range
  if (rangeYears <= 5) return 0.6; // Wide range
  return 0.4; // Very wide range
}

/**
 * Evidence Density Score (0–1)
 * 
 * How densely connected are the evidence items?
 */
function scoreEvidenceDensity(
  candidate: StoryCandidate,
  edges: AggregatedEdge[]
): number {
  const idSet = new Set(candidate.evidenceIds);
  const n = candidate.evidenceIds.length;

  if (n <= 1) return 0.5; // Single document = moderate density

  const internalEdges = edges.filter((e) =>
    idSet.has(e.sourceEvidenceId) && idSet.has(e.targetEvidenceId)
  );

  const possibleEdges = (n * (n - 1)) / 2;
  const density = possibleEdges > 0 ? internalEdges.length / possibleEdges : 0;

  // Weight by average edge weight
  const avgWeight = internalEdges.length > 0
    ? internalEdges.reduce((sum, e) => sum + e.finalWeight, 0) / internalEdges.length
    : 0;

  return parseFloat((density * 0.6 + avgWeight * 0.4).toFixed(3));
}

// ═════════════════════════════════════════════════════════════════
// 3. PENALTY COMPUTATIONS
// ═════════════════════════════════════════════════════════════════

/**
 * Generic Location Penalty (0–1)
 * 
 * Penalize when the ONLY thing holding the candidate together is
 * shared location (e.g., Zimbabwe).
 */
function computeGenericLocationPenalty(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  // If candidate has strong program identity, location is irrelevant
  if (candidate.dominantProgram) return 0;

  const locations = new Set<string>();
  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    // Extract location mentions from text (simple heuristic)
    const locationMatches = intel.text.match(/\b(Zimbabwe|Zambia|Malawi|Botswana|South Africa|Africa)\b/gi);
    if (locationMatches) {
      locationMatches.forEach((l) => locations.add(l.toLowerCase()));
    }
  }

  // If all docs mention the same location but have no program connection
  const hasProgramConnection = candidate.evidenceIds.some((eid) => {
    const intel = intelligenceMap.get(eid);
    return intel && intel.programs.length > 0;
  });

  if (!hasProgramConnection && locations.size === 1 && candidate.evidenceIds.length > 1) {
    return 0.8; // Heavy penalty: held together only by location
  }

  return 0;
}

/**
 * Generic Actor Penalty (0–1)
 * 
 * Penalize when the ONLY shared actor is a generic institution
 * (e.g., AfDB mentioned in every document).
 */
function computeGenericActorPenalty(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  if (candidate.evidenceIds.length <= 1) return 0;

  // Count actor mentions across documents
  const actorDocCounts = new Map<string, Set<number>>();

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    for (const actor of intel.actors) {
      const set = actorDocCounts.get(actor.normalizedName) || new Set<number>();
      set.add(eid);
      actorDocCounts.set(actor.normalizedName, set);
    }
  }

  // Check if any actor appears in ALL documents but there are no strong relationships
  for (const [actorName, docSet] of actorDocCounts) {
    if (docSet.size === candidate.evidenceIds.length) {
      // This actor appears in every document
      // Check if there are strong non-actor relationships
      const hasStrongNonActor = candidate.relationshipCounts.strong > 0;
      if (!hasStrongNonActor) {
        // Heavy penalty: held together only by generic actor
        return 0.7;
      }
    }
  }

  return 0;
}

/**
 * Unrelated Sector Penalty (0–1)
 * 
 * Penalize when documents concern fundamentally different sectors.
 */
function computeUnrelatedSectorPenalty(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const sectors: string[] = [];

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;

    // Infer sector from programs and problems
    const text = intel.text.toLowerCase();
    if (text.includes("agriculture") || text.includes("food") || text.includes("crop") || text.includes("farm")) {
      sectors.push("agriculture");
    } else if (text.includes("finance") || text.includes("procurement") || text.includes("budget") || text.includes("tax")) {
      sectors.push("finance");
    } else if (text.includes("energy") || text.includes("power") || text.includes("electricity")) {
      sectors.push("energy");
    } else if (text.includes("disaster") || text.includes("risk") || text.includes("climate")) {
      sectors.push("disaster_risk");
    } else if (text.includes("infrastructure") || text.includes("road") || text.includes("water")) {
      sectors.push("infrastructure");
    } else {
      sectors.push("other");
    }
  }

  if (sectors.length <= 1) return 0;

  const uniqueSectors = new Set(sectors);
  if (uniqueSectors.size === 1) return 0; // All same sector

  // If multiple sectors but no program to unify them
  if (!candidate.dominantProgram && uniqueSectors.size > 1) {
    return 0.5; // Moderate penalty
  }

  return 0.1; // Mild penalty for sector diversity with program anchor
}

/**
 * Contradictory Program Penalty (0–1)
 * 
 * Penalize when documents reference contradictory or competing programs.
 */
function computeContradictoryProgramPenalty(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): number {
  const programs: Program[] = [];

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    programs.push(...intel.programs);
  }

  if (programs.length <= 1) return 0;

  // Check for contradictory program types
  const types = new Set(programs.map((p) => p.type).filter(Boolean));
  if (types.size <= 1) return 0;

  // Diverse program types with no shared name = potential contradiction
  const uniqueNames = new Set(programs.map((p) => p.normalizedName));
  if (uniqueNames.size > 2 && !candidate.dominantProgram) {
    return 0.4; // Documents mention many different programs
  }

  return 0;
}

// ═════════════════════════════════════════════════════════════════
// 4. CAUSAL CHAIN EXTRACTION
// ═════════════════════════════════════════════════════════════════

/**
 * Extract the causal chain within a story candidate.
 * 
 * Returns a sequence of causal links showing how evidence items
 * connect through cause-and-effect relationships.
 */
export function extractCausalChain(
  candidate: StoryCandidate,
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>
): CausalLink[] {
  const idSet = new Set(candidate.evidenceIds);
  const causalTypes = ["causes", "triggered_by", "results_in", "produces", "addresses_problem", "precedes_event", "follows_event"];

  const causalEdges = edges.filter((e) =>
    idSet.has(e.sourceEvidenceId) &&
    idSet.has(e.targetEvidenceId) &&
    e.contributingRelationships.some((r) => causalTypes.includes(r.type))
  );

  if (causalEdges.length === 0) return [];

  // Sort by weight descending
  const sorted = [...causalEdges].sort((a, b) => b.finalWeight - a.finalWeight);

  const chain: CausalLink[] = [];
  const used = new Set<string>();

  for (const edge of sorted) {
    const key = `${edge.sourceEvidenceId}:${edge.targetEvidenceId}`;
    if (used.has(key)) continue;
    used.add(key);

    const causalRel = edge.contributingRelationships.find((r) => causalTypes.includes(r.type));
    if (!causalRel) continue;

    const sourceIntel = intelligenceMap.get(edge.sourceEvidenceId);
    const targetIntel = intelligenceMap.get(edge.targetEvidenceId);

    let description = causalRel.reason;

    // Enrich description with intelligence nodes
    if (sourceIntel && targetIntel) {
      const sourceProg = sourceIntel.programs[0]?.name;
      const targetProg = targetIntel.programs[0]?.name;
      const sourceProb = sourceIntel.problems[0]?.name;
      const targetOut = targetIntel.outcomes[0]?.name;

      if (sourceProg && targetOut) {
        description = `${sourceProg} → ${targetOut}`;
      } else if (sourceProb && targetProg) {
        description = `${sourceProb} → addressed by → ${targetProg}`;
      }
    }

    chain.push({
      from: edge.sourceEvidenceId,
      to: edge.targetEvidenceId,
      relationshipType: causalRel.type,
      description,
    });
  }

  return chain;
}

// ═════════════════════════════════════════════════════════════════
// 5. CONFIDENCE SCORING
// ═════════════════════════════════════════════════════════════════

/**
 * Compute the overall confidence for a story candidate.
 * 
 * Confidence is distinct from coherence:
 *   - Coherence = internal quality of the story
 *   - Confidence = probability that this is a real, meaningful story
 * 
 * Factors:
 *   + coherence score (primary)
 *   + seed strength (strong seeds = higher confidence)
 *   + evidence count (more evidence = more confident, up to a point)
 *   + relationship diversity (multiple relationship types = robust)
 *   - generic overlap penalty
 */
export function computeStoryConfidence(
  candidate: StoryCandidate,
  coherenceScore: StoryCoherenceScore,
  config?: Partial<StoryGraphConfig>
): number {
  let confidence = coherenceScore.overall;

  // Seed strength boost
  if (candidate.seedEvidenceIds.length >= 2) {
    confidence += 0.05;
  }

  // Evidence count boost (diminishing returns after 5)
  const evidenceBoost = Math.min(candidate.evidenceIds.length, 5) * 0.02;
  confidence += evidenceBoost;

  // Relationship diversity boost
  const hasMultipleRelationshipTypes =
    candidate.relationshipCounts.strong > 0 &&
    candidate.relationshipCounts.medium > 0;
  if (hasMultipleRelationshipTypes) {
    confidence += 0.03;
  }

  // Single-document penalty (slight)
  if (candidate.evidenceIds.length === 1) {
    confidence -= 0.05;
  }

  // Generic overlap penalty
  if (coherenceScore.programIdentity < 0.3 && candidate.evidenceIds.length > 2) {
    confidence -= 0.10;
  }

  return Math.max(0, Math.min(1, parseFloat(confidence.toFixed(4))));
}

// ═════════════════════════════════════════════════════════════════
// 6. STORY VALIDATION
// ═════════════════════════════════════════════════════════════════

export interface ValidationResult {
  candidate: StoryCandidate;
  action: "promote" | "reject" | "keep";
  reason: string;
}

/**
 * Validate story candidates and decide whether to promote, reject,
 * or keep them for human review.
 * 
 * Rules:
 *   - coherence ≥ 0.70 + confidence ≥ 0.60 → PROMOTE
 *   - coherence < 0.30 OR confidence < 0.25 → REJECT
 *   - Otherwise → KEEP (human review)
 */
export function validateStoryCandidates(
  candidates: StoryCandidate[],
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config?: Partial<StoryGraphConfig>
): ValidationResult[] {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };
  const results: ValidationResult[] = [];

  for (const candidate of candidates) {
    const { score, diagnostics } = computeStoryCoherence(candidate, edges, intelligenceMap, mergedConfig);
    const confidence = computeStoryConfidence(candidate, score, mergedConfig);
    const causalChain = extractCausalChain(candidate, edges, intelligenceMap);

    // Update candidate with computed values
    const updatedCandidate: StoryCandidate = {
      ...candidate,
      coherenceScore: score.overall,
      confidence,
      causalChain,
      diagnostics,
      dominantTheme: inferDominantTheme(candidate, intelligenceMap),
    };

    // Decision
    let action: "promote" | "reject" | "keep";
    let reason: string;

    if (score.overall >= 0.70 && confidence >= 0.60) {
      action = "promote";
      reason = `High coherence (${score.overall.toFixed(2)}) and confidence (${confidence.toFixed(2)}). Strong story candidate.`;
    } else if (score.overall < 0.30 || confidence < 0.25) {
      action = "reject";
      const rejectionReasons: string[] = [];
      if (score.overall < 0.30) rejectionReasons.push(`low coherence (${score.overall.toFixed(2)})`);
      if (confidence < 0.25) rejectionReasons.push(`low confidence (${confidence.toFixed(2)})`);
      if (diagnostics.genericLocationPenalty > 0.5) rejectionReasons.push("held together primarily by shared location");
      if (diagnostics.genericActorPenalty > 0.5) rejectionReasons.push("held together primarily by shared actor");
      reason = `Rejected due to ${rejectionReasons.join(", ")}.`;
    } else {
      action = "keep";
      reason = `Moderate coherence (${score.overall.toFixed(2)}) and confidence (${confidence.toFixed(2)}). Requires human review.`;
    }

    results.push({ candidate: updatedCandidate, action, reason });
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════
// 7. HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════

function parseLooseDate(text: string | undefined): Date | null {
  if (!text) return null;
  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso;
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return new Date(parseInt(yearMatch[1], 10), 0, 1);
  return null;
}

function inferDominantTheme(
  candidate: StoryCandidate,
  intelligenceMap: Map<number, EvidenceIntelligence>
): string {
  // Use the most frequently mentioned program name
  const programCounts = new Map<string, number>();
  const problemCounts = new Map<string, number>();

  for (const eid of candidate.evidenceIds) {
    const intel = intelligenceMap.get(eid);
    if (!intel) continue;
    for (const prog of intel.programs) {
      programCounts.set(prog.name, (programCounts.get(prog.name) || 0) + 1);
    }
    for (const prob of intel.problems) {
      problemCounts.set(prob.name, (problemCounts.get(prob.name) || 0) + 1);
    }
  }

  let dominantProgram = "";
  let maxProgCount = 0;
  for (const [name, count] of programCounts) {
    if (count > maxProgCount) {
      maxProgCount = count;
      dominantProgram = name;
    }
  }

  if (dominantProgram) return dominantProgram;

  let dominantProblem = "";
  let maxProbCount = 0;
  for (const [name, count] of problemCounts) {
    if (count > maxProbCount) {
      maxProbCount = count;
      dominantProblem = name;
    }
  }

  if (dominantProblem) return `${dominantProblem} Response`;

  return "General Development Story";
}

// ═════════════════════════════════════════════════════════════════
// 8. DIAGNOSTIC VIEW BUILDER
// ═════════════════════════════════════════════════════════════════

import { type StoryDiagnosticView } from "./story-types";

/**
 * Build a human-readable diagnostic view of a story.
 * Used for debugging and analyst investigation.
 */
export function buildStoryDiagnosticView(
  candidate: StoryCandidate,
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>
): StoryDiagnosticView {
  const idSet = new Set(candidate.evidenceIds);

  // Find why documents belong together
  const whyBelong: string[] = [];
  for (const edge of edges) {
    if (!idSet.has(edge.sourceEvidenceId) || !idSet.has(edge.targetEvidenceId)) continue;
    if (edge.finalWeight > 0) {
      whyBelong.push(`E${edge.sourceEvidenceId} ↔ E${edge.targetEvidenceId}: ${edge.dominantType} (weight ${edge.finalWeight.toFixed(2)})`);
    }
  }

  // Find why nearby documents were rejected
  const whyRejected: string[] = [];
  for (const edge of edges) {
    const inSource = idSet.has(edge.sourceEvidenceId);
    const inTarget = idSet.has(edge.targetEvidenceId);
    if ((inSource && !inTarget) || (!inSource && inTarget)) {
      // One in, one out — this is a borderline edge
      if (edge.finalWeight > 0 && edge.finalWeight < 0.55) {
        const outId = inSource ? edge.targetEvidenceId : edge.sourceEvidenceId;
        whyRejected.push(`E${outId}: edge weight ${edge.finalWeight.toFixed(2)} below threshold (${edge.dominantType})`);
      } else if (!edge.canEstablishStory) {
        const outId = inSource ? edge.targetEvidenceId : edge.sourceEvidenceId;
        whyRejected.push(`E${outId}: relationship type "${edge.dominantType}" cannot establish story membership`);
      }
    }
  }

  // Causal chain summary
  const chainSummary = candidate.causalChain.length > 0
    ? candidate.causalChain.map((link) => `E${link.from} → ${link.relationshipType} → E${link.to}`).join("; ")
    : "No causal chain detected";

  return {
    storyId: candidate.id ?? 0,
    evidenceIds: candidate.evidenceIds,
    primaryProgram: candidate.dominantProgram?.name,
    primaryProblem: candidate.dominantProblem?.name,
    dominantTheme: candidate.dominantTheme,
    relationshipCount: candidate.relationshipCounts.total,
    strongEdges: candidate.relationshipCounts.strong,
    mediumEdges: candidate.relationshipCounts.medium,
    coherenceScore: candidate.coherenceScore,
    confidence: candidate.confidence,
    whyDocumentsBelong: whyBelong.slice(0, 10),
    whyNearbyDocumentsRejected: whyRejected.slice(0, 10),
    causalChainSummary: chainSummary,
  };
}
