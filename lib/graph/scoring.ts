/**
 * ATIS v4 — Deterministic Relationship Scoring
 * 
 * The LLM extracts semantic facts and types.
 * The ALGORITHM assigns the final graph weight.
 * 
 * Formula:
 *   finalWeight =
 *     relationshipTypeWeight
 *     × extractionConfidence
 *     × evidenceQuality
 *     × explicitnessFactor
 *     × suppressionPenalty
 * 
 * This module contains ONLY pure, deterministic, testable functions.
 * No LLM calls. No database access. No side effects.
 */

import {
  type StoryBearingRelationship,
  type RelationshipType,
  getRelationshipTypeWeight,
  getRelationshipTier,
  type StoryGraphConfig,
  DEFAULT_STORY_GRAPH_CONFIG,
} from "./story-types";

// ═════════════════════════════════════════════════════════════════
// 1. EVIDENCE QUALITY ASSESSMENT
// ═════════════════════════════════════════════════════════════════

/**
 * Characteristics of a single evidence item used to compute
 * its quality score.
 */
export interface EvidenceQualityProfile {
  textLength: number;
  extractionConfidence: number;
  hasProgramReference: boolean;
  hasSpecificMetric: boolean;
  hasTemporalAnchor: boolean;
  isGenericInstitutionalPage: boolean;
  entityCount: number;
  factCount: number;
}

/**
 * Compute an evidence quality score (0.0–1.0) from a profile.
 * 
 * Higher quality evidence produces more reliable relationships.
 * Generic institutional pages receive a steep penalty.
 */
export function computeEvidenceQuality(profile: EvidenceQualityProfile): number {
  if (profile.isGenericInstitutionalPage && !profile.hasProgramReference) {
    // Generic institutional pages without program references are unreliable
    return 0.30;
  }

  let score = 0.50; // Base

  // Text length: longer texts usually contain more detail
  if (profile.textLength > 5000) score += 0.15;
  else if (profile.textLength > 2000) score += 0.10;
  else if (profile.textLength > 500) score += 0.05;
  else if (profile.textLength < 200) score -= 0.10;

  // Extraction confidence
  score += profile.extractionConfidence * 0.20;

  // Specific program reference (strong signal)
  if (profile.hasProgramReference) score += 0.10;

  // Specific metric (outcome with numbers)
  if (profile.hasSpecificMetric) score += 0.05;

  // Temporal anchor
  if (profile.hasTemporalAnchor) score += 0.03;

  // Entity and fact density
  if (profile.entityCount >= 5) score += 0.03;
  if (profile.factCount >= 3) score += 0.02;

  return Math.max(0.10, Math.min(1.0, parseFloat(score.toFixed(4))));
}

/**
 * Compute the combined evidence quality for a pair of evidence items.
 * Uses the geometric mean to penalize pairs where one item is low quality.
 */
export function computePairEvidenceQuality(
  source: EvidenceQualityProfile,
  target: EvidenceQualityProfile
): number {
  const qa = computeEvidenceQuality(source);
  const qb = computeEvidenceQuality(target);
  // Geometric mean: if either is low, the pair quality is low
  const geometricMean = Math.sqrt(qa * qb);
  return parseFloat(geometricMean.toFixed(4));
}

// ═════════════════════════════════════════════════════════════════
// 2. EXPLICITNESS FACTOR
// ═════════════════════════════════════════════════════════════════

/**
 * Compute the explicitness multiplier for a relationship.
 * 
 * Explicit relationships (directly stated in text) receive a boost.
 * Inferred relationships receive a neutral or slight penalty.
 * 
 * The boost is configurable via STORY_EXPLICIT_BOOST env var.
 */
export function computeExplicitnessFactor(
  explicit: boolean,
  config?: Pick<StoryGraphConfig, "explicitnessBoost">
): number {
  const boost = config?.explicitnessBoost ?? DEFAULT_STORY_GRAPH_CONFIG.explicitnessBoost;
  return explicit ? boost : 1.0;
}

// ═════════════════════════════════════════════════════════════════
// 3. SUPPRESSION PENALTY
// ═════════════════════════════════════════════════════════════════

/**
 * Compute the suppression penalty for a candidate relationship.
 * 
 * Relationships should be rejected or heavily penalized when:
 *   - only shared_country exists
 *   - only shared_organization exists
 *   - only generic sector overlap exists
 *   - only generic keyword overlap exists
 *   - source or target is a generic institutional page without program refs
 * 
 * This function returns a penalty factor (0.0 = fully suppressed,
 * 1.0 = no penalty). It does NOT make the final inclusion decision;
 * that happens in story-edges.ts (TURN 6).
 */
export interface SuppressionInput {
  relationshipType: RelationshipType;
  /** True if this is the ONLY relationship between this evidence pair. */
  isOnlyRelationship: boolean;
  /** True if the pair also has a strong/medium relationship. */
  hasStrongCompanion: boolean;
  sourceIsGenericInstitutionalPage: boolean;
  targetIsGenericInstitutionalPage: boolean;
  sourceHasProgramReference: boolean;
  targetHasProgramReference: boolean;
}

export function computeSuppressionPenalty(input: SuppressionInput): number {
  const tier = getRelationshipTier(input.relationshipType);

  // Tier 3 (weak) relationships are heavily penalized when they are
  // the ONLY relationship between a pair
  if (tier === "weak") {
    if (input.isOnlyRelationship) {
      // Weak-only edges are effectively suppressed for story membership
      return 0.0;
    }
    // If there's a strong companion, weak edges can exist for context
    if (input.hasStrongCompanion) {
      return 0.50; // 50% penalty — retained for context, not story
    }
    return 0.0;
  }

  // Generic institutional pages without program references should not
  // be hubs. Any relationship involving such a page is penalized.
  const genericPageInvolved =
    (input.sourceIsGenericInstitutionalPage && !input.sourceHasProgramReference) ||
    (input.targetIsGenericInstitutionalPage && !input.targetHasProgramReference);

  if (genericPageInvolved) {
    return 0.20; // 80% penalty
  }

  return 1.0; // No penalty
}

// ═════════════════════════════════════════════════════════════════
// 4. CORE SCORING FORMULA
// ═════════════════════════════════════════════════════════════════

export interface ScoredRelationship extends StoryBearingRelationship {
  /** Final computed weight after all factors applied. */
  finalWeight: number;
  /** The component scores that produced the final weight. */
  scoreComponents: {
    typeWeight: number;
    extractionConfidence: number;
    evidenceQuality: number;
    explicitnessFactor: number;
    suppressionPenalty: number;
  };
  /** Whether this relationship can establish story membership. */
  canEstablishStory: boolean;
}

/**
 * Score a single relationship deterministically.
 * 
 * This is the core scoring function. It applies the formula:
 *   finalWeight = typeWeight × confidence × evidenceQuality × explicitness × suppression
 * 
 * @param rel — The raw relationship from extraction
 * @param sourceQuality — Quality profile of the source evidence
 * @param targetQuality — Quality profile of the target evidence
 * @param suppression — Suppression context for this pair
 * @param config — Runtime configuration
 */
export function scoreRelationship(
  rel: StoryBearingRelationship,
  sourceQuality: EvidenceQualityProfile,
  targetQuality: EvidenceQualityProfile,
  suppression: SuppressionInput,
  config?: Partial<StoryGraphConfig>
): ScoredRelationship {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };

  // Component 1: Type weight (from taxonomy)
  const typeWeight = getRelationshipTypeWeight(rel.type);

  // Component 2: Extraction confidence (from LLM or algorithm)
  const extractionConfidence = Math.max(0, Math.min(1, rel.confidence));

  // Component 3: Evidence quality (geometric mean of pair)
  const evidenceQuality = computePairEvidenceQuality(sourceQuality, targetQuality);

  // Component 4: Explicitness factor
  const explicitnessFactor = computeExplicitnessFactor(rel.explicit, mergedConfig);

  // Component 5: Suppression penalty
  const suppressionPenalty = computeSuppressionPenalty(suppression);

  // Apply formula
  let finalWeight =
    typeWeight *
    extractionConfidence *
    evidenceQuality *
    explicitnessFactor *
    suppressionPenalty;

  // Hard floor: relationships below a minimal threshold are zeroed
  // This prevents noise from accumulating
  if (finalWeight < 0.05) {
    finalWeight = 0;
  }

  finalWeight = parseFloat(finalWeight.toFixed(4));

  // Determine if this relationship can establish story membership
  const canEstablishStory =
    finalWeight >= mergedConfig.storyEdgeThreshold &&
    suppressionPenalty > 0 &&
    getRelationshipTier(rel.type) !== "weak";

  return {
    ...rel,
    finalWeight,
    scoreComponents: {
      typeWeight,
      extractionConfidence,
      evidenceQuality,
      explicitnessFactor,
      suppressionPenalty,
    },
    canEstablishStory,
  };
}

// ═════════════════════════════════════════════════════════════════
// 5. AGGREGATE EDGE SCORING
// ═════════════════════════════════════════════════════════════════

/**
 * When multiple relationships exist between the same evidence pair,
 * aggregate them into a single edge.
 * 
 * Strategy:
 *   - Use the MAXIMUM final weight (best relationship wins)
 *   - Combine reasons for explainability
 *   - Track which types contributed
 */
export interface AggregatedEdge {
  sourceEvidenceId: number;
  targetEvidenceId: number;
  finalWeight: number;
  /** The highest-weight relationship type. */
  dominantType: RelationshipType;
  /** All relationship types between this pair. */
  allTypes: RelationshipType[];
  /** Combined human-readable explanation. */
  combinedReason: string;
  /** Whether the aggregated edge can establish story membership. */
  canEstablishStory: boolean;
  /** Individual scored relationships that contributed. */
  contributingRelationships: ScoredRelationship[];
}

/**
 * Aggregate multiple scored relationships between the same pair.
 * 
 * This is used after all pairwise relationships have been scored
 * to produce the final edge list for the graph.
 */
export function aggregateRelationships(
  relationships: ScoredRelationship[]
): AggregatedEdge[] {
  const byPair = new Map<string, ScoredRelationship[]>();

  for (const rel of relationships) {
    // Use sorted pair key to treat edges as undirected
    const pair = [rel.sourceEvidenceId, rel.targetEvidenceId].sort((a, b) => a - b);
    const key = `${pair[0]}:${pair[1]}`;
    const existing = byPair.get(key) || [];
    existing.push(rel);
    byPair.set(key, existing);
  }

  const edges: AggregatedEdge[] = [];

  for (const [pairKey, rels] of byPair) {
    if (rels.length === 0) continue;

    // Find the dominant (highest-weight) relationship
    const dominant = rels.reduce((best, current) =>
      current.finalWeight > best.finalWeight ? current : best
    );

    const allTypes = [...new Set(rels.map((r) => r.type))];
    const canEstablishStory = rels.some((r) => r.canEstablishStory);

    // Build combined reason
    const reasons = rels
      .filter((r) => r.finalWeight > 0)
      .map((r) => `[${r.type}, weight=${r.finalWeight.toFixed(2)}] ${r.reason}`);

    const combinedReason = reasons.length === 1
      ? reasons[0]
      : `Multiple relationships connect these documents:
${reasons.map((r) => "  - " + r).join("\n")}`;

    const [sourceId, targetId] = pairKey.split(":").map(Number);

    edges.push({
      sourceEvidenceId: sourceId,
      targetEvidenceId: targetId,
      finalWeight: dominant.finalWeight,
      dominantType: dominant.type,
      allTypes,
      combinedReason,
      canEstablishStory,
      contributingRelationships: rels,
    });
  }

  return edges;
}

// ═════════════════════════════════════════════════════════════════
// 6. THRESHOLD UTILITIES
// ═════════════════════════════════════════════════════════════════

/**
 * Check if a weight passes the story graph threshold.
 */
export function passesStoryThreshold(
  weight: number,
  config?: Pick<StoryGraphConfig, "storyEdgeThreshold">
): boolean {
  const threshold = config?.storyEdgeThreshold ?? DEFAULT_STORY_GRAPH_CONFIG.storyEdgeThreshold;
  return weight >= threshold;
}

/**
 * Check if an aggregated edge passes the story graph threshold.
 */
export function edgePassesStoryThreshold(
  edge: AggregatedEdge,
  config?: Pick<StoryGraphConfig, "storyEdgeThreshold">
): boolean {
  return passesStoryThreshold(edge.finalWeight, config) && edge.canEstablishStory;
}

/**
 * Filter a list of aggregated edges to only those that can
 * establish story membership.
 */
export function filterStoryEdges(
  edges: AggregatedEdge[],
  config?: Pick<StoryGraphConfig, "storyEdgeThreshold">
): AggregatedEdge[] {
  return edges.filter((e) => edgePassesStoryThreshold(e, config));
}

// ═════════════════════════════════════════════════════════════════
// 7. DIAGNOSTIC SCORING
// ═════════════════════════════════════════════════════════════════

/**
 * Produce a human-readable breakdown of how a relationship's
 * weight was computed. Used for debugging and analyst investigation.
 */
export function explainRelationshipScore(rel: ScoredRelationship): string {
  const c = rel.scoreComponents;
  return `Relationship Score Breakdown for E${rel.sourceEvidenceId} → E${rel.targetEvidenceId}

Type: ${rel.type}
Tier: ${getRelationshipTier(rel.type)}

Components:
  1. Type weight:           ${c.typeWeight.toFixed(2)}
  2. Extraction confidence: ${c.extractionConfidence.toFixed(2)}
  3. Evidence quality:      ${c.evidenceQuality.toFixed(2)}
  4. Explicitness factor:   ${c.explicitnessFactor.toFixed(2)}
  5. Suppression penalty:   ${c.suppressionPenalty.toFixed(2)}

Calculation:
  ${c.typeWeight.toFixed(2)} × ${c.extractionConfidence.toFixed(2)} × ${c.evidenceQuality.toFixed(2)} × ${c.explicitnessFactor.toFixed(2)} × ${c.suppressionPenalty.toFixed(2)} = ${rel.finalWeight.toFixed(4)}

Can establish story: ${rel.canEstablishStory ? "YES" : "NO"}
Reason: ${rel.reason}`;
}

// ═════════════════════════════════════════════════════════════════
// 8. BATCH SCORING (convenience)
// ═════════════════════════════════════════════════════════════════

/**
 * Score a batch of relationships in one call.
 * 
 * @param relationships — Raw relationships from extraction
 * @param qualityMap — Map from evidenceId to quality profile
 * @param suppressionMap — Map from pairKey to suppression input
 * @param config — Runtime configuration
 */
export function scoreRelationshipBatch(
  relationships: StoryBearingRelationship[],
  qualityMap: Map<number, EvidenceQualityProfile>,
  suppressionMap: Map<string, SuppressionInput>,
  config?: Partial<StoryGraphConfig>
): ScoredRelationship[] {
  return relationships.map((rel) => {
    const sourceQuality = qualityMap.get(rel.sourceEvidenceId) ?? defaultQualityProfile();
    const targetQuality = qualityMap.get(rel.targetEvidenceId) ?? defaultQualityProfile();
    const pair = [rel.sourceEvidenceId, rel.targetEvidenceId].sort((a, b) => a - b);
    const suppression = suppressionMap.get(`${pair[0]}:${pair[1]}`) ?? defaultSuppressionInput(rel.type);

    return scoreRelationship(rel, sourceQuality, targetQuality, suppression, config);
  });
}

function defaultQualityProfile(): EvidenceQualityProfile {
  return {
    textLength: 1000,
    extractionConfidence: 0.8,
    hasProgramReference: false,
    hasSpecificMetric: false,
    hasTemporalAnchor: false,
    isGenericInstitutionalPage: false,
    entityCount: 3,
    factCount: 2,
  };
}

function defaultSuppressionInput(type: RelationshipType): SuppressionInput {
  return {
    relationshipType: type,
    isOnlyRelationship: false,
    hasStrongCompanion: false,
    sourceIsGenericInstitutionalPage: false,
    targetIsGenericInstitutionalPage: false,
    sourceHasProgramReference: true,
    targetHasProgramReference: true,
  };
}
