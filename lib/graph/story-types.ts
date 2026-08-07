/**
 * ATIS v4 — Story-Bearing Graph Type System
 * 
 * Core type definitions for intelligence-bearing relationships,
 * story discovery, coherence validation, and graph layering.
 * 
 * This module is the single source of truth for all story-graph
 * types. No other file should redefine these concepts.
 */

// ═════════════════════════════════════════════════════════════════
// 1. RELATIONSHIP TAXONOMY
// ═════════════════════════════════════════════════════════════════

/**
 * Deterministic base weights for every relationship type.
 * The LLM extracts semantic facts; the algorithm assigns
 * the final weight by looking up the type here.
 * 
 * These weights are NON-CONFIGURABLE by design — they encode
 * the semantic hierarchy of intelligence-bearing signals.
 * Only the threshold and multipliers are configurable.
 */
export const RELATIONSHIP_TYPE_WEIGHTS = {
  // ── Tier 1 — Strong ───────────────────────────────────────────
  same_program:       1.00,
  same_project:       1.00,
  same_initiative:    1.00,
  part_of_program:    0.95,
  implements:         0.95,
  funds:              0.90,
  operationalizes:    0.90,
  causes:             0.90,
  triggered_by:       0.90,
  results_in:         0.90,
  produces:           0.85,
  precedes_event:     0.85,
  follows_event:      0.85,

  // ── Tier 2 — Medium ───────────────────────────────────────────
  same_causal_chain:           0.75,
  addresses_problem:           0.70,
  evaluates:                   0.65,
  same_policy_area:            0.65,
  same_strategic_objective:    0.65,
  same_outcome:                0.60,
  supports:                    0.60,
  aligned_with:                0.55,

  // ── Tier 3 — Weak contextual ──────────────────────────────────
  same_actor:         0.15,
  same_sector:        0.10,
  same_topic:         0.10,
  same_country:       0.00,
  same_region:        0.00,
} as const;

export type RelationshipType = keyof typeof RELATIONSHIP_TYPE_WEIGHTS;

export type RelationshipTier = "strong" | "medium" | "weak";

export function getRelationshipTier(type: RelationshipType): RelationshipTier {
  const weight = RELATIONSHIP_TYPE_WEIGHTS[type];
  if (weight >= 0.85) return "strong";
  if (weight >= 0.55) return "medium";
  return "weak";
}

export function getRelationshipTypeWeight(type: RelationshipType): number {
  return RELATIONSHIP_TYPE_WEIGHTS[type] ?? 0;
}

/** All types that can independently establish story membership. */
export const STORY_ESTABLISHING_TYPES: RelationshipType[] = (
  Object.entries(RELATIONSHIP_TYPE_WEIGHTS)
    .filter(([, w]) => w >= 0.55)
    .map(([t]) => t as RelationshipType)
);

/** Types that must NEVER independently create a story edge. */
export const STORY_SUPPRESSED_TYPES: RelationshipType[] = (
  Object.entries(RELATIONSHIP_TYPE_WEIGHTS)
    .filter(([, w]) => w < 0.55)
    .map(([t]) => t as RelationshipType)
);

// ═════════════════════════════════════════════════════════════════
// 2. INTELLIGENCE NODES (Extracted from Evidence)
// ═════════════════════════════════════════════════════════════════

export interface Program {
  id: number;
  name: string;
  normalizedName: string;
  description?: string;
  type?: "project" | "initiative" | "facility" | "policy" | "financing" | "program" | "other";
}

export interface Event {
  id: number;
  name: string;
  normalizedName: string;
  description?: string;
  temporalInfo?: string; // ISO date or free-text temporal anchor
  eventType?: "approval" | "launch" | "award" | "completion" | "occurrence" | "release" | "trigger" | "other";
}

export interface Problem {
  id: number;
  name: string;
  normalizedName: string;
  description?: string;
  severity?: "critical" | "high" | "medium" | "low";
}

export interface Outcome {
  id: number;
  name: string;
  normalizedName: string;
  description?: string;
  metric?: string; // e.g. "188,000 households", "4.5 MT/ha"
}

export interface Actor {
  id: number;
  name: string;
  normalizedName: string;
  actorType?: "organization" | "government" | "person" | "funder" | "contractor" | "regulator" | "implementer" | "other";
}

/** Union of all intelligence node types for generic handling. */
export type IntelligenceNode = Program | Event | Problem | Outcome | Actor;

export type IntelligenceNodeType = "program" | "event" | "problem" | "outcome" | "actor";

// ═════════════════════════════════════════════════════════════════
// 3. STORY-BEARING RELATIONSHIP (The Edge)
// ═════════════════════════════════════════════════════════════════

/**
 * A typed, weighted, explainable relationship between two evidence items.
 * 
 * Every relationship MUST have:
 *  - type: from the taxonomy
 *  - weight: computed deterministically (see scoring.ts)
 *  - confidence: extraction confidence (0–1)
 *  - explicit: true if stated directly in text, false if inferred
 *  - reason: human-readable explanation
 *  - provenance: traceable back to source evidence
 */
export interface StoryBearingRelationship {
  id?: number;
  sourceEvidenceId: number;
  targetEvidenceId: number;
  type: RelationshipType;
  weight: number;
  confidence: number;
  explicit: boolean;
  reason: string;
  /** Optional foreign keys to the intelligence nodes that justify this edge. */
  sourceProgramId?: number;
  sourceEventId?: number;
  sourceProblemId?: number;
  sourceOutcomeId?: number;
  sourceActorId?: number;
  createdAt?: Date;
}

// ═════════════════════════════════════════════════════════════════
// 4. GRAPH LAYERS
// ═════════════════════════════════════════════════════════════════

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  evidenceId?: number;
  entityId?: number;
  programId?: number;
  eventId?: number;
  problemId?: number;
  outcomeId?: number;
  actorId?: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: RelationshipType;
  weight: number;
  confidence: number;
  explicit: boolean;
  reason: string;
}

/**
 * The Context Graph contains ALL meaningful relationships,
 * including weak contextual ones. Used for visualization and
 * analyst exploration. Weak edges here do NOT create stories.
 */
export interface ContextGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidenceIds: number[];
}

/**
 * The Story Graph contains only relationships capable of
 * establishing story membership. Its edges are filtered by
 * the configurable STORY_EDGE_THRESHOLD.
 */
export interface StoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  threshold: number;
  evidenceIds: number[];
}

// ═════════════════════════════════════════════════════════════════
// 5. STORY DISCOVERY
// ═════════════════════════════════════════════════════════════════

/**
 * A story seed is a tight cluster of evidence connected by
 * strong relationships. Seeds are the starting points for
 * story expansion.
 */
export interface StorySeed {
  evidenceIds: number[];
  seedType:
    | "same_program"
    | "causal_chain"
    | "problem_intervention_outcome"
    | "event_intervention_outcome"
    | "strong_relationship_cluster";
  dominantProgramId?: number;
  dominantProblemId?: number;
  strength: number; // aggregate weight of seed relationships
}

/**
 * A causal link within a story, connecting two evidence items
 * through a specific relationship type.
 */
export interface CausalLink {
  from: number; // evidenceId
  to: number;   // evidenceId
  relationshipType: RelationshipType;
  description: string;
}

/**
 * Diagnostic breakdown of why a story candidate received its
 * coherence score. Every field is 0–1.
 */
export interface StoryDiagnostics {
  programIdentityScore: number;
  causalContinuityScore: number;
  problemConsistencyScore: number;
  eventContinuityScore: number;
  outcomeConsistencyScore: number;
  temporalCoherenceScore: number;
  evidenceDensityScore: number;
  /** Penalties (subtracted from base scores) */
  genericLocationPenalty: number;
  genericActorPenalty: number;
  unrelatedSectorPenalty: number;
  contradictoryProgramPenalty: number;
}

/**
 * A story candidate discovered by the graph algorithm.
 * 
 * - evidenceIds: all evidence in the story
 * - seedEvidenceIds: the core evidence that formed the seed
 * - contextEvidenceIds: evidence attached via medium-weight expansion
 * - coherenceScore: overall quality score (0–1)
 * - confidence: probability this is a real story (0–1)
 */
export interface StoryCandidate {
  id?: number;
  name: string;
  description: string;
  evidenceIds: number[];
  seedEvidenceIds: number[];
  contextEvidenceIds: number[];
  coherenceScore: number;
  confidence: number;
  dominantProgram?: Program;
  dominantProblem?: Problem;
  dominantTheme: string;
  causalChain: CausalLink[];
  reasons: string[];
  status: "candidate" | "validated" | "rejected" | "story";
  relationshipCounts: {
    strong: number;
    medium: number;
    weak: number;
    total: number;
  };
  diagnostics: StoryDiagnostics;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Simplified coherence score used for quick filtering.
 */
export interface StoryCoherenceScore {
  overall: number;
  programIdentity: number;
  causalContinuity: number;
  problemConsistency: number;
  eventContinuity: number;
  outcomeConsistency: number;
  temporalCoherence: number;
  evidenceDensity: number;
}

// ═════════════════════════════════════════════════════════════════
// 6. EDGE SUPPRESSION
// ═════════════════════════════════════════════════════════════════

/**
 * Context passed to suppression rules so they can evaluate
 * whether a candidate relationship should be rejected or penalized.
 */
export interface SuppressionContext {
  sourceEvidenceId: number;
  targetEvidenceId: number;
  sourceEvidencePrograms: number[];
  targetEvidencePrograms: number[];
  sourceEvidenceActors: number[];
  targetEvidenceActors: number[];
  sharedCountries: string[];
  sharedOrganizations: string[];
  sharedSectors: string[];
  isGenericInstitutionalPage: boolean;
  sourceHasProgramReference: boolean;
  targetHasProgramReference: boolean;
}

export interface EdgeSuppressionResult {
  suppressed: boolean;
  penalized: boolean;
  penaltyFactor: number;
  reason: string;
}

// ═════════════════════════════════════════════════════════════════
// 7. EXTRACTION OUTPUT
// ═════════════════════════════════════════════════════════════════

/**
 * The structured output of the v4 extraction pipeline.
 * Replaces the generic v3 StructuredExtraction for evidence
 * that should participate in story discovery.
 */
export interface StructuredIntelligence {
  evidenceId: number;
  programs: Program[];
  events: Event[];
  problems: Problem[];
  outcomes: Outcome[];
  actors: Actor[];
  relationships: StoryBearingRelationship[];
  extractionConfidence: number;
  extractionReason?: string;
}

// ═════════════════════════════════════════════════════════════════
// 8. CONFIGURATION
// ═════════════════════════════════════════════════════════════════

/**
 * Runtime configuration for the story graph pipeline.
 * All thresholds are configurable via environment variables
 * but have sensible defaults.
 */
export interface StoryGraphConfig {
  /** Minimum edge weight to include in the Story Graph. */
  storyEdgeThreshold: number;
  /** Minimum aggregate strength for a seed to be considered. */
  seedMinimumStrength: number;
  /** Maximum hops for seed expansion via medium-weight edges. */
  expansionMaxHops: number;
  /** Minimum coherence score for a candidate to be promoted. */
  coherenceMinimumScore: number;
  /** Minimum score for a single-document story to be valid. */
  singleDocumentMinimumScore: number;
  /** Prevent context evidence from exceeding this ratio of total evidence. */
  maxContextEvidenceRatio: number;
  /** Penalty applied when only generic location/actor overlap exists. */
  genericOverlapPenalty: number;
  /** Boost for explicit vs inferred relationships. */
  explicitnessBoost: number;
}

export const DEFAULT_STORY_GRAPH_CONFIG: StoryGraphConfig = {
  storyEdgeThreshold: 0.55,
  seedMinimumStrength: 1.5,
  expansionMaxHops: 2,
  coherenceMinimumScore: 0.40,
  singleDocumentMinimumScore: 0.60,
  maxContextEvidenceRatio: 0.5,
  genericOverlapPenalty: 0.0,
  explicitnessBoost: 1.15,
};

/**
 * Build config from environment variables with fallback to defaults.
 */
export function buildStoryGraphConfig(env: Record<string, string | undefined> = process.env): StoryGraphConfig {
  const parseFloatOr = (key: string, fallback: number): number => {
    const v = env[key];
    if (v === undefined) return fallback;
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
  };

  return {
    storyEdgeThreshold: parseFloatOr("STORY_EDGE_THRESHOLD", DEFAULT_STORY_GRAPH_CONFIG.storyEdgeThreshold),
    seedMinimumStrength: parseFloatOr("STORY_SEED_MIN_STRENGTH", DEFAULT_STORY_GRAPH_CONFIG.seedMinimumStrength),
    expansionMaxHops: parseFloatOr("STORY_EXPANSION_MAX_HOPS", DEFAULT_STORY_GRAPH_CONFIG.expansionMaxHops),
    coherenceMinimumScore: parseFloatOr("STORY_COHERENCE_MIN_SCORE", DEFAULT_STORY_GRAPH_CONFIG.coherenceMinimumScore),
    singleDocumentMinimumScore: parseFloatOr("STORY_SINGLE_DOC_MIN_SCORE", DEFAULT_STORY_GRAPH_CONFIG.singleDocumentMinimumScore),
    maxContextEvidenceRatio: parseFloatOr("STORY_MAX_CONTEXT_RATIO", DEFAULT_STORY_GRAPH_CONFIG.maxContextEvidenceRatio),
    genericOverlapPenalty: parseFloatOr("STORY_GENERIC_PENALTY", DEFAULT_STORY_GRAPH_CONFIG.genericOverlapPenalty),
    explicitnessBoost: parseFloatOr("STORY_EXPLICIT_BOOST", DEFAULT_STORY_GRAPH_CONFIG.explicitnessBoost),
  };
}

// ═════════════════════════════════════════════════════════════════
// 9. OBSERVABILITY / DEBUGGING
// ═════════════════════════════════════════════════════════════════

/**
 * Human-readable explanation of why two evidence items are
 * connected (or why they were rejected).
 */
export interface EdgeExplanation {
  sourceEvidenceId: number;
  targetEvidenceId: number;
  connected: boolean;
  relationshipType?: RelationshipType;
  weight?: number;
  confidence?: number;
  reason: string;
  rejectionReason?: string;
}

/**
 * Diagnostic view of a discovered story for debugging and
 * analyst investigation.
 */
export interface StoryDiagnosticView {
  storyId: number;
  evidenceIds: number[];
  primaryProgram?: string;
  primaryProblem?: string;
  dominantTheme: string;
  relationshipCount: number;
  strongEdges: number;
  mediumEdges: number;
  coherenceScore: number;
  confidence: number;
  whyDocumentsBelong: string[];
  whyNearbyDocumentsRejected: string[];
  causalChainSummary: string;
}
