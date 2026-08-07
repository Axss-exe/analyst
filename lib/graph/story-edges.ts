/**
 * ATIS v4 — Story Graph Layer
 * 
 * Builds and maintains two graph layers from scored relationships:
 * 
 *   CONTEXT GRAPH — All meaningful relationships, including weak
 *   contextual edges. Used for visualization and analyst exploration.
 *   Weak edges here do NOT create stories.
 * 
 *   STORY GRAPH — Only relationships capable of establishing story
 *   membership. Filtered by configurable threshold and suppression
 *   rules. This is the graph used for story discovery.
 * 
 * CRITICAL RULES:
 *   - same_country, same_region: weight 0.00, NEVER create story edges
 *   - same_actor: weight 0.15, weak, cannot independently create stories
 *   - same_sector, same_topic: weight 0.10, weak contextual only
 *   - Generic institutional pages without program refs are penalized
 *   - A weak edge alone between two documents does NOT create story membership
 *   - A weak edge WITH a strong companion is retained for context
 * 
 * This module is pure and deterministic. No LLM calls. No DB access.
 */

import {
  type StoryBearingRelationship,
  type RelationshipType,
  type ContextGraph,
  type StoryGraph,
  type EdgeExplanation,
  type StoryGraphConfig,
  DEFAULT_STORY_GRAPH_CONFIG,
  getRelationshipTier,
  STORY_SUPPRESSED_TYPES,
} from "./story-types";
import {
  type ScoredRelationship,
  type AggregatedEdge,
  type EvidenceQualityProfile,
  type SuppressionInput,
  scoreRelationship,
  aggregateRelationships,
  filterStoryEdges,
  edgePassesStoryThreshold,
  explainRelationshipScore,
} from "./scoring";

// ═════════════════════════════════════════════════════════════════
// 1. EVIDENCE CONTEXT (for suppression rules)
// ═════════════════════════════════════════════════════════════════

/**
 * Per-evidence metadata needed to evaluate suppression rules.
 * This is built from the database during the worker pipeline.
 */
export interface EvidenceContext {
  evidenceId: number;
  title: string;
  textLength: number;
  /** Program IDs referenced by this evidence. */
  programIds: number[];
  /** Actor IDs referenced by this evidence. */
  actorIds: number[];
  /** Country/location names mentioned. */
  countries: string[];
  /** Organization names mentioned (excluding actors). */
  organizations: string[];
  /** Sector/topic keywords. */
  sectors: string[];
  /** True if this is a generic institutional overview page. */
  isGenericInstitutionalPage: boolean;
  /** Number of specific program references. */
  programReferenceCount: number;
}

// ═════════════════════════════════════════════════════════════════
// 2. SUPPRESSION CONTEXT BUILDER
// ═════════════════════════════════════════════════════════════════

/**
 * Build suppression inputs for all evidence pairs.
 * 
 * This is O(n²) in the number of evidence items, but it only
 * processes pairs that have at least one candidate relationship.
 */
export function buildSuppressionMap(
  relationships: StoryBearingRelationship[],
  evidenceContexts: Map<number, EvidenceContext>
): Map<string, SuppressionInput> {
  const map = new Map<string, SuppressionInput>();

  // Group relationships by pair
  const byPair = new Map<string, StoryBearingRelationship[]>();
  for (const rel of relationships) {
    const pair = [rel.sourceEvidenceId, rel.targetEvidenceId].sort((a, b) => a - b);
    const key = `${pair[0]}:${pair[1]}`;
    const existing = byPair.get(key) || [];
    existing.push(rel);
    byPair.set(key, existing);
  }

  for (const [pairKey, rels] of byPair) {
    const [sourceId, targetId] = pairKey.split(":").map(Number);
    const sourceCtx = evidenceContexts.get(sourceId);
    const targetCtx = evidenceContexts.get(targetId);

    if (!sourceCtx || !targetCtx) continue;

    const hasStrongCompanion = rels.some((r) => getRelationshipTier(r.type) !== "weak");
    const isOnlyRelationship = rels.length === 1;

    for (const rel of rels) {
      const input: SuppressionInput = {
        relationshipType: rel.type,
        isOnlyRelationship,
        hasStrongCompanion,
        sourceIsGenericInstitutionalPage: sourceCtx.isGenericInstitutionalPage,
        targetIsGenericInstitutionalPage: targetCtx.isGenericInstitutionalPage,
        sourceHasProgramReference: sourceCtx.programReferenceCount > 0,
        targetHasProgramReference: targetCtx.programReferenceCount > 0,
      };

      // Store per-relationship (same key used for all relationships in pair)
      map.set(`${pairKey}:${rel.type}`, input);
    }
  }

  return map;
}

// ═════════════════════════════════════════════════════════════════
// 3. GENERIC INSTITUTIONAL PAGE DETECTION
// ═════════════════════════════════════════════════════════════════

/**
 * Detect whether an evidence item is a generic institutional page
 * that should not become a graph hub.
 * 
 * Heuristics:
 *   - Title contains "overview", "about", "profile", "institutional"
 *   - No specific program/project references
 *   - High ratio of generic organization names to specific programs
 *   - Text is mostly descriptive/background rather than event/report
 */
export function detectGenericInstitutionalPage(
  title: string,
  text: string,
  programCount: number
): boolean {
  const titleLower = title.toLowerCase();
  const textLower = text.toLowerCase();

  // Strong signals
  const hubKeywords = [
    "overview", "about us", "institutional profile", "who we are",
    "corporate profile", "annual report", "portfolio", "operations in",
    "presence in", "engagement in", "activities in",
  ];
  const hasHubKeyword = hubKeywords.some((k) => titleLower.includes(k) || textLower.includes(k));

  // If it has specific program references, it's probably not generic
  if (programCount >= 2) return false;

  // If title is very short and generic
  const isShortGenericTitle = title.length < 40 && !title.includes(":") && !title.includes("—");

  // If text mentions many countries but few specific programs
  const countryMentions = (textLower.match(/\b(zimbabwe|africa|ethiopia|kenya|nigeria|ghana|uganda|tanzania|zambia|malawi)\b/g) || []).length;
  const hasManyCountries = countryMentions >= 3;

  // Generic organizational language
  const genericPhrases = [
    "the bank", "the fund", "our mission", "our vision", "strategic objectives",
    "development agenda", "partnership framework", "country strategy",
  ];
  const genericPhraseCount = genericPhrases.filter((p) => textLower.includes(p)).length;

  // Scoring
  let score = 0;
  if (hasHubKeyword) score += 3;
  if (isShortGenericTitle) score += 1;
  if (hasManyCountries && programCount === 0) score += 2;
  if (genericPhraseCount >= 2) score += 2;
  if (programCount === 0) score += 2;

  return score >= 4;
}

// ═════════════════════════════════════════════════════════════════
// 4. CONTEXT GRAPH BUILDER
// ═════════════════════════════════════════════════════════════════

/**
 * Build the Context Graph from scored relationships.
 * 
 * The Context Graph contains ALL relationships, including weak
 * contextual ones. It is used for:
 *   - Visualization
 *   - Analyst exploration
 *   - Bridge node detection
 *   - Contradiction detection
 * 
 * Weak edges are present but flagged as non-story-establishing.
 */
export function buildContextGraph(
  edges: AggregatedEdge[],
  evidenceIds: number[]
): ContextGraph {
  const nodes: ContextGraph["nodes"] = [];
  const nodeIds = new Set<string>();

  // Create evidence nodes
  for (const id of evidenceIds) {
    const nodeId = `evidence:${id}`;
    if (!nodeIds.has(nodeId)) {
      nodes.push({
        id: nodeId,
        label: `E${id}`,
        type: "evidence",
        evidenceId: id,
      });
      nodeIds.add(nodeId);
    }
  }

  // Create entity nodes from edge types (for visualization)
  const graphEdges: ContextGraph["edges"] = edges.map((edge, idx) => ({
    id: `edge:${idx}`,
    source: `evidence:${edge.sourceEvidenceId}`,
    target: `evidence:${edge.targetEvidenceId}`,
    label: edge.dominantType,
    type: edge.dominantType,
    weight: edge.finalWeight,
    confidence: edge.contributingRelationships[0]?.confidence ?? 0.8,
    explicit: edge.contributingRelationships[0]?.explicit ?? false,
    reason: edge.combinedReason,
  }));

  return {
    nodes,
    edges: graphEdges,
    evidenceIds,
  };
}

// ═════════════════════════════════════════════════════════════════
// 5. STORY GRAPH BUILDER
// ═════════════════════════════════════════════════════════════════

/**
 * Build the Story Graph from aggregated edges.
 * 
 * The Story Graph contains ONLY edges that:
 *   1. Pass the configured story edge threshold
 *   2. Are flagged as canEstablishStory
 *   3. Are NOT purely weak contextual edges
 * 
 * This is the graph used for story discovery, clustering, and
 * coherence validation.
 */
export function buildStoryGraph(
  edges: AggregatedEdge[],
  evidenceIds: number[],
  config?: Partial<StoryGraphConfig>
): StoryGraph {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };

  // Filter to story-establishing edges only
  const storyEdges = filterStoryEdges(edges, mergedConfig);

  const nodes: StoryGraph["nodes"] = [];
  const nodeIds = new Set<string>();

  // Only include evidence nodes that are connected by story edges
  const connectedEvidenceIds = new Set<number>();
  for (const edge of storyEdges) {
    connectedEvidenceIds.add(edge.sourceEvidenceId);
    connectedEvidenceIds.add(edge.targetEvidenceId);
  }

  for (const id of connectedEvidenceIds) {
    const nodeId = `evidence:${id}`;
    if (!nodeIds.has(nodeId)) {
      nodes.push({
        id: nodeId,
        label: `E${id}`,
        type: "evidence",
        evidenceId: id,
      });
      nodeIds.add(nodeId);
    }
  }

  const graphEdges: StoryGraph["edges"] = storyEdges.map((edge, idx) => ({
    id: `story-edge:${idx}`,
    source: `evidence:${edge.sourceEvidenceId}`,
    target: `evidence:${edge.targetEvidenceId}`,
    label: edge.dominantType,
    type: edge.dominantType,
    weight: edge.finalWeight,
    confidence: edge.contributingRelationships[0]?.confidence ?? 0.8,
    explicit: edge.contributingRelationships[0]?.explicit ?? false,
    reason: edge.combinedReason,
  }));

  return {
    nodes,
    edges: graphEdges,
    threshold: mergedConfig.storyEdgeThreshold,
    evidenceIds: Array.from(connectedEvidenceIds),
  };
}

// ═════════════════════════════════════════════════════════════════
// 6. EDGE EXPLANATIONS
// ═════════════════════════════════════════════════════════════════

/**
 * Generate human-readable explanations for every edge in the graph,
 * including why edges were rejected.
 * 
 * This is critical for observability and analyst trust.
 */
export function generateEdgeExplanations(
  allEdges: AggregatedEdge[],
  storyGraph: StoryGraph,
  config?: Partial<StoryGraphConfig>
): EdgeExplanation[] {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };
  const storyEdgeIds = new Set(
    storyGraph.edges.map((e) => `${e.source}:${e.target}`)
  );

  const explanations: EdgeExplanation[] = [];

  for (const edge of allEdges) {
    const pairKey = `evidence:${edge.sourceEvidenceId}:evidence:${edge.targetEvidenceId}`;
    const isInStoryGraph = storyEdgeIds.has(pairKey) ||
      storyEdgeIds.has(`evidence:${edge.targetEvidenceId}:evidence:${edge.sourceEvidenceId}`);

    if (isInStoryGraph) {
      // Accepted into story graph
      explanations.push({
        sourceEvidenceId: edge.sourceEvidenceId,
        targetEvidenceId: edge.targetEvidenceId,
        connected: true,
        relationshipType: edge.dominantType,
        weight: edge.finalWeight,
        confidence: edge.contributingRelationships[0]?.confidence ?? 0.8,
        reason: edge.combinedReason,
      });
    } else {
      // Rejected — explain why
      const rejectionReason = explainRejection(edge, mergedConfig);
      explanations.push({
        sourceEvidenceId: edge.sourceEvidenceId,
        targetEvidenceId: edge.targetEvidenceId,
        connected: false,
        relationshipType: edge.dominantType,
        weight: edge.finalWeight,
        confidence: edge.contributingRelationships[0]?.confidence ?? 0.8,
        reason: edge.combinedReason,
        rejectionReason,
      });
    }
  }

  return explanations;
}

function explainRejection(
  edge: AggregatedEdge,
  config: StoryGraphConfig
): string {
  const reasons: string[] = [];

  if (edge.finalWeight < config.storyEdgeThreshold) {
    reasons.push(
      `Weight (${edge.finalWeight.toFixed(2)}) is below the story threshold (${config.storyEdgeThreshold})`
    );
  }

  if (!edge.canEstablishStory) {
    reasons.push("This relationship type cannot independently establish story membership");
  }

  if (STORY_SUPPRESSED_TYPES.includes(edge.dominantType)) {
    reasons.push(
      `Relationship type "${edge.dominantType}" is suppressed — generic overlap alone does not create stories`
    );
  }

  // Check for generic institutional page involvement
  const hasGenericPage = edge.contributingRelationships.some((r) =>
    r.scoreComponents.suppressionPenalty < 1.0
  );
  if (hasGenericPage) {
    reasons.push("One or both documents is a generic institutional page without specific program references");
  }

  if (reasons.length === 0) {
    reasons.push("Relationship did not meet story graph inclusion criteria");
  }

  return reasons.join(". ");
}

// ═════════════════════════════════════════════════════════════════
// 7. HUB PREVENTION
// ═════════════════════════════════════════════════════════════════

/**
 * Prevent generic institutional pages from becoming graph hubs.
 * 
 * A hub is an evidence node with an unusually high degree in the
 * story graph. If a generic institutional page becomes a hub,
 * it can connect otherwise unrelated stories.
 * 
 * Strategy:
 *   1. Identify potential hubs (high degree nodes)
 *   2. Check if they are generic institutional pages
 *   3. If so, remove their edges that are based solely on weak signals
 *   4. Keep only edges supported by strong relationships
 */
export function preventHubFormation(
  edges: AggregatedEdge[],
  evidenceContexts: Map<number, EvidenceContext>,
  hubDegreeThreshold = 5
): AggregatedEdge[] {
  // Compute degree per evidence node
  const degree = new Map<number, number>();
  for (const edge of edges) {
    degree.set(edge.sourceEvidenceId, (degree.get(edge.sourceEvidenceId) || 0) + 1);
    degree.set(edge.targetEvidenceId, (degree.get(edge.targetEvidenceId) || 0) + 1);
  }

  // Identify hub candidates
  const hubs = new Set<number>();
  for (const [evidenceId, deg] of degree) {
    if (deg >= hubDegreeThreshold) {
      const ctx = evidenceContexts.get(evidenceId);
      if (ctx && detectGenericInstitutionalPage(ctx.title, "", ctx.programReferenceCount)) {
        hubs.add(evidenceId);
      }
    }
  }

  if (hubs.size === 0) return edges;

  // Filter edges: remove weak edges to/from hubs
  return edges.filter((edge) => {
    const sourceIsHub = hubs.has(edge.sourceEvidenceId);
    const targetIsHub = hubs.has(edge.targetEvidenceId);

    if (!sourceIsHub && !targetIsHub) return true;

    // If a hub is involved, only keep strong edges
    const isStrongEdge = edge.contributingRelationships.some((r) =>
      getRelationshipTier(r.type) === "strong"
    );

    return isStrongEdge;
  });
}

// ═════════════════════════════════════════════════════════════════
// 8. FULL PIPELINE (convenience)
// ═════════════════════════════════════════════════════════════════

export interface GraphBuildResult {
  contextGraph: ContextGraph;
  storyGraph: StoryGraph;
  edgeExplanations: EdgeExplanation[];
  allEdges: AggregatedEdge[];
  storyEdges: AggregatedEdge[];
  stats: {
    totalEdges: number;
    storyEdges: number;
    suppressedEdges: number;
    weakEdges: number;
    strongEdges: number;
    hubNodesRemoved: number;
  };
}

/**
 * Build both graph layers from raw relationships.
 * 
 * This is the main entry point for the graph building pipeline.
 * It orchestrates scoring, aggregation, suppression, hub prevention,
 * and graph construction.
 */
export function buildGraphLayers(
  relationships: StoryBearingRelationship[],
  evidenceContexts: Map<number, EvidenceContext>,
  qualityProfiles: Map<number, EvidenceQualityProfile>,
  evidenceIds: number[],
  config?: Partial<StoryGraphConfig>
): GraphBuildResult {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };

  // Step 1: Build suppression map
  const suppressionMap = buildSuppressionMap(relationships, evidenceContexts);

  // Step 2: Score all relationships
  const scored = relationships.map((rel) => {
    const sourceQuality = qualityProfiles.get(rel.sourceEvidenceId) ?? defaultQualityProfile();
    const targetQuality = qualityProfiles.get(rel.targetEvidenceId) ?? defaultQualityProfile();
    const pair = [rel.sourceEvidenceId, rel.targetEvidenceId].sort((a, b) => a - b);
    const suppression = suppressionMap.get(`${pair[0]}:${pair[1]}:${rel.type}`) ?? {
      relationshipType: rel.type,
      isOnlyRelationship: false,
      hasStrongCompanion: false,
      sourceIsGenericInstitutionalPage: false,
      targetIsGenericInstitutionalPage: false,
      sourceHasProgramReference: true,
      targetHasProgramReference: true,
    };

    return scoreRelationship(rel, sourceQuality, targetQuality, suppression, mergedConfig);
  });

  // Step 3: Aggregate by pair
  let aggregated = aggregateRelationships(scored);

  // Step 4: Prevent hub formation
  const beforeHubFilter = aggregated.length;
  aggregated = preventHubFormation(aggregated, evidenceContexts);
  const hubNodesRemoved = beforeHubFilter - aggregated.length;

  // Step 5: Build Context Graph (all edges)
  const contextGraph = buildContextGraph(aggregated, evidenceIds);

  // Step 6: Build Story Graph (filtered edges)
  const storyGraph = buildStoryGraph(aggregated, evidenceIds, mergedConfig);

  // Step 7: Generate explanations
  const edgeExplanations = generateEdgeExplanations(aggregated, storyGraph, mergedConfig);

  // Step 8: Stats
  const storyEdges = filterStoryEdges(aggregated, mergedConfig);
  const weakEdges = aggregated.filter((e) =>
    e.contributingRelationships.every((r) => getRelationshipTier(r.type) === "weak")
  );
  const strongEdges = aggregated.filter((e) =>
    e.contributingRelationships.some((r) => getRelationshipTier(r.type) === "strong")
  );

  return {
    contextGraph,
    storyGraph,
    edgeExplanations,
    allEdges: aggregated,
    storyEdges,
    stats: {
      totalEdges: aggregated.length,
      storyEdges: storyEdges.length,
      suppressedEdges: aggregated.length - storyEdges.length,
      weakEdges: weakEdges.length,
      strongEdges: strongEdges.length,
      hubNodesRemoved,
    },
  };
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
