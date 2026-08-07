/**
 * ATIS v4 — Story Clustering
 * 
 * Discovers stories using a seed-and-expand approach:
 * 
 *   1. DETECT SEEDS — Find tight clusters connected by strong
 *      relationships (same_program, causal_chain, etc.)
 *   2. EXPAND SEEDS — Attach contextual evidence via medium-weight
 *      relationships (same_policy_area, addresses_problem, etc.)
 *   3. DETECT SINGLE-DOCUMENT STORIES — Evidence items with
 *      complete problem→intervention→outcome structure
 *   4. VALIDATE CLUSTERS — Ensure coherence and reject spurious groups
 * 
 * This replaces v3's blind connected-components clustering.
 * 
 * Pure, deterministic, testable. No LLM calls. No DB access.
 */

import {
  type StorySeed,
  type StoryCandidate,
  type CausalLink,
  type StoryBearingRelationship,
  type StoryGraphConfig,
  DEFAULT_STORY_GRAPH_CONFIG,
  getRelationshipTier,
  type Program,
  type Problem,
  type Event,
  type Outcome,
  type Actor,
} from "./story-types";
import {
  type AggregatedEdge,
  type EvidenceQualityProfile,
} from "./scoring";
import {
  type StoryGraph,
} from "./story-edges";

// ═════════════════════════════════════════════════════════════════
// 1. SEED DETECTION
// ═════════════════════════════════════════════════════════════════

/**
 * Detect story seeds from the Story Graph.
 * 
 * A seed is a connected subgraph where edges are predominantly
 * strong (Tier 1) relationships. Seeds are the nuclei around
 * which stories form.
 * 
 * Seed types:
 *   - same_program: Multiple evidence items reference the same program
 *   - causal_chain: Problem → intervention → outcome chain across docs
 *   - problem_intervention_outcome: A document contains the full structure
 *   - event_intervention_outcome: Event triggers program with outcome
 *   - strong_relationship_cluster: Dense cluster of strong edges
 */
export function detectStorySeeds(
  storyGraph: StoryGraph,
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config?: Partial<StoryGraphConfig>
): StorySeed[] {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };
  const seeds: StorySeed[] = [];

  // Seed type 1: same_program clusters
  const programSeeds = detectProgramSeeds(edges, intelligenceMap, mergedConfig);
  seeds.push(...programSeeds);

  // Seed type 2: causal chains
  const causalSeeds = detectCausalChainSeeds(edges, intelligenceMap, mergedConfig);
  seeds.push(...causalSeeds);

  // Seed type 3: problem → intervention → outcome
  const pioSeeds = detectProblemInterventionOutcomeSeeds(edges, intelligenceMap, mergedConfig);
  seeds.push(...pioSeeds);

  // Seed type 4: event → intervention → outcome
  const eioSeeds = detectEventInterventionOutcomeSeeds(edges, intelligenceMap, mergedConfig);
  seeds.push(...eioSeeds);

  // Seed type 5: dense strong-edge clusters
  const denseSeeds = detectDenseClusterSeeds(storyGraph, edges, mergedConfig);
  seeds.push(...denseSeeds);

  // Deduplicate: merge overlapping seeds, keeping the strongest
  return mergeOverlappingSeeds(seeds);
}

// ── Evidence Intelligence (input shape) ─────────────────────────

export interface EvidenceIntelligence {
  evidenceId: number;
  programs: Program[];
  events: Event[];
  problems: Problem[];
  outcomes: Outcome[];
  actors: Actor[];
  text: string;
}

// ── Program Seeds ───────────────────────────────────────────────

function detectProgramSeeds(
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config: StoryGraphConfig
): StorySeed[] {
  const seeds: StorySeed[] = [];

  // Group edges by shared program
  const programToEvidence = new Map<number, Set<number>>();

  for (const edge of edges) {
    const sourceIntel = intelligenceMap.get(edge.sourceEvidenceId);
    const targetIntel = intelligenceMap.get(edge.targetEvidenceId);
    if (!sourceIntel || !targetIntel) continue;

    // Find shared programs
    for (const sp of sourceIntel.programs) {
      for (const tp of targetIntel.programs) {
        if (sp.normalizedName === tp.normalizedName) {
          const set = programToEvidence.get(sp.id) || new Set<number>();
          set.add(edge.sourceEvidenceId);
          set.add(edge.targetEvidenceId);
          programToEvidence.set(sp.id, set);
        }
      }
    }
  }

  for (const [programId, evidenceSet] of programToEvidence) {
    const evidenceIds = Array.from(evidenceSet);
    if (evidenceIds.length < 1) continue;

    // Compute seed strength: sum of edge weights between members
    const strength = computeSeedStrength(evidenceIds, edges);
    if (strength < config.seedMinimumStrength) continue;

    seeds.push({
      evidenceIds,
      seedType: "same_program",
      dominantProgramId: programId,
      strength,
    });
  }

  return seeds;
}

// ── Causal Chain Seeds ──────────────────────────────────────────

function detectCausalChainSeeds(
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config: StoryGraphConfig
): StorySeed[] {
  const seeds: StorySeed[] = [];

  // Find edges that form causal chains: problem → program → outcome
  const causalEdges = edges.filter((e) =>
    e.contributingRelationships.some((r) =>
      ["causes", "triggered_by", "results_in", "produces", "addresses_problem"].includes(r.type)
    )
  );

  // Group by connected components in the causal subgraph
  const causalGraph = buildAdjacencyList(causalEdges);
  const components = findConnectedComponents(causalGraph);

  for (const component of components) {
    if (component.length < 2) continue;

    const strength = computeSeedStrength(component, edges);
    if (strength < config.seedMinimumStrength) continue;

    // Find dominant problem
    const problemCounts = new Map<number, number>();
    for (const eid of component) {
      const intel = intelligenceMap.get(eid);
      if (!intel) continue;
      for (const p of intel.problems) {
        problemCounts.set(p.id, (problemCounts.get(p.id) || 0) + 1);
      }
    }
    const dominantProblem = findDominant(problemCounts);

    seeds.push({
      evidenceIds: component,
      seedType: "causal_chain",
      dominantProblemId: dominantProblem ?? undefined,
      strength,
    });
  }

  return seeds;
}

// ── Problem → Intervention → Outcome Seeds ──────────────────────

function detectProblemInterventionOutcomeSeeds(
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config: StoryGraphConfig
): StorySeed[] {
  const seeds: StorySeed[] = [];

  // Find pairs where one doc has the problem and another has the program+outcome
  for (const edge of edges) {
    const sourceIntel = intelligenceMap.get(edge.sourceEvidenceId);
    const targetIntel = intelligenceMap.get(edge.targetEvidenceId);
    if (!sourceIntel || !targetIntel) continue;

    // Check if source has problem and target has program+outcome
    const sourceHasProblem = sourceIntel.problems.length > 0;
    const targetHasProgram = targetIntel.programs.length > 0;
    const targetHasOutcome = targetIntel.outcomes.length > 0;

    if (sourceHasProblem && targetHasProgram && targetHasOutcome) {
      // Check if there's an addresses_problem or causes relationship
      const hasCausalLink = edge.contributingRelationships.some((r) =>
        ["addresses_problem", "causes", "results_in"].includes(r.type)
      );

      if (hasCausalLink) {
        const evidenceIds = [edge.sourceEvidenceId, edge.targetEvidenceId];
        const strength = edge.finalWeight;

        if (strength >= config.seedMinimumStrength) {
          seeds.push({
            evidenceIds,
            seedType: "problem_intervention_outcome",
            dominantProgramId: targetIntel.programs[0]?.id,
            dominantProblemId: sourceIntel.problems[0]?.id,
            strength,
          });
        }
      }
    }
  }

  return deduplicateSeeds(seeds);
}

// ── Event → Intervention → Outcome Seeds ────────────────────────

function detectEventInterventionOutcomeSeeds(
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  config: StoryGraphConfig
): StorySeed[] {
  const seeds: StorySeed[] = [];

  for (const edge of edges) {
    const sourceIntel = intelligenceMap.get(edge.sourceEvidenceId);
    const targetIntel = intelligenceMap.get(edge.targetEvidenceId);
    if (!sourceIntel || !targetIntel) continue;

    const sourceHasEvent = sourceIntel.events.length > 0;
    const targetHasProgram = targetIntel.programs.length > 0;
    const targetHasOutcome = targetIntel.outcomes.length > 0;

    if (sourceHasEvent && targetHasProgram && targetHasOutcome) {
      const hasTriggerLink = edge.contributingRelationships.some((r) =>
        ["triggered_by", "causes", "precedes_event", "follows_event"].includes(r.type)
      );

      if (hasTriggerLink) {
        const evidenceIds = [edge.sourceEvidenceId, edge.targetEvidenceId];
        const strength = edge.finalWeight;

        if (strength >= config.seedMinimumStrength) {
          seeds.push({
            evidenceIds,
            seedType: "event_intervention_outcome",
            dominantProgramId: targetIntel.programs[0]?.id,
            strength,
          });
        }
      }
    }
  }

  return deduplicateSeeds(seeds);
}

// ── Dense Cluster Seeds ─────────────────────────────────────────

function detectDenseClusterSeeds(
  storyGraph: StoryGraph,
  edges: AggregatedEdge[],
  config: StoryGraphConfig
): StorySeed[] {
  const seeds: StorySeed[] = [];

  // Find connected components in the story graph
  const adjacency = buildAdjacencyList(edges);
  const components = findConnectedComponents(adjacency);

  for (const component of components) {
    if (component.length < 2) continue;

    // Check density: ratio of actual edges to possible edges
    const possibleEdges = (component.length * (component.length - 1)) / 2;
    const actualEdges = countInternalEdges(component, edges);
    const density = possibleEdges > 0 ? actualEdges / possibleEdges : 0;

    // Only dense clusters (≥ 50% density) become seeds
    if (density < 0.5) continue;

    const strength = computeSeedStrength(component, edges);
    if (strength < config.seedMinimumStrength) continue;

    seeds.push({
      evidenceIds: component,
      seedType: "strong_relationship_cluster",
      strength,
    });
  }

  return seeds;
}

// ═════════════════════════════════════════════════════════════════
// 2. SEED EXPANSION
// ═════════════════════════════════════════════════════════════════

/**
 * Expand story seeds by attaching nearby evidence through
 * medium-weight relationships.
 * 
 * Expansion rules:
 *   - Only use edges that pass the story threshold
 *   - Medium-weight edges (Tier 2) can attach context evidence
 *   - Weak edges (Tier 3) cannot expand seeds
 *   - Stop when no more qualifying edges exist within max hops
 *   - Context evidence cannot exceed maxContextEvidenceRatio of total
 */
export function expandStorySeeds(
  seeds: StorySeed[],
  storyGraph: StoryGraph,
  edges: AggregatedEdge[],
  config?: Partial<StoryGraphConfig>
): StoryCandidate[] {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };
  const candidates: StoryCandidate[] = [];

  for (const seed of seeds) {
    const expanded = expandSingleSeed(seed, edges, mergedConfig);
    candidates.push(expanded);
  }

  return candidates;
}

function expandSingleSeed(
  seed: StorySeed,
  edges: AggregatedEdge[],
  config: StoryGraphConfig
): StoryCandidate {
  const seedSet = new Set(seed.evidenceIds);
  const memberSet = new Set(seed.evidenceIds); // All members (seed + expanded)
  const contextSet = new Set<number>(); // Context-only members

  // BFS expansion up to maxHops
  const visited = new Set(seed.evidenceIds);
  let frontier = [...seed.evidenceIds];
  let hops = 0;

  while (frontier.length > 0 && hops < config.expansionMaxHops) {
    const nextFrontier: number[] = [];

    for (const currentId of frontier) {
      // Find all edges from currentId that pass the threshold
      const connected = edges.filter((e) => {
        const otherId = e.sourceEvidenceId === currentId
          ? e.targetEvidenceId
          : e.sourceEvidenceId === currentId
            ? e.sourceEvidenceId
            : null;

        if (otherId === null) return false;
        if (visited.has(otherId)) return false;

        // Must pass story threshold
        if (e.finalWeight < config.storyEdgeThreshold) return false;

        // Must be able to establish story
        if (!e.canEstablishStory) return false;

        // Context evidence: medium-weight edges from non-seed nodes
        const isFromSeed = seedSet.has(currentId);
        const isMediumEdge = e.contributingRelationships.some((r) =>
          getRelationshipTier(r.type) === "medium"
        );

        // Strong edges can always expand
        const isStrongEdge = e.contributingRelationships.some((r) =>
          getRelationshipTier(r.type) === "strong"
        );

        if (isStrongEdge) return true;
        if (isFromSeed && isMediumEdge) return true;

        // Medium edges from context nodes: only if within hop limit
        if (isMediumEdge && hops < config.expansionMaxHops - 1) return true;

        return false;
      });

      for (const edge of connected) {
        const otherId = edge.sourceEvidenceId === currentId
          ? edge.targetEvidenceId
          : edge.sourceEvidenceId;

        if (visited.has(otherId)) continue;

        visited.add(otherId);
        memberSet.add(otherId);
        nextFrontier.push(otherId);

        // Mark as context if not in original seed and attached via medium edge
        if (!seedSet.has(otherId)) {
          const isMediumOnly = edge.contributingRelationships.every((r) =>
            getRelationshipTier(r.type) === "medium"
          );
          if (isMediumOnly) {
            contextSet.add(otherId);
          }
        }
      }
    }

    frontier = nextFrontier;
    hops++;
  }

  // Enforce max context ratio
  const maxContext = Math.floor(memberSet.size * config.maxContextEvidenceRatio);
  if (contextSet.size > maxContext) {
    // Remove excess context evidence (arbitrary order — could be distance-based)
    const contextArray = Array.from(contextSet);
    const toRemove = contextArray.slice(maxContext);
    for (const id of toRemove) {
      contextSet.delete(id);
      memberSet.delete(id);
    }
  }

  const evidenceIds = Array.from(memberSet).sort((a, b) => a - b);
  const seedEvidenceIds = Array.from(seedSet).sort((a, b) => a - b);
  const contextEvidenceIds = Array.from(contextSet).sort((a, b) => a - b);

  return buildStoryCandidate(seed, evidenceIds, seedEvidenceIds, contextEvidenceIds, edges);
}

// ═════════════════════════════════════════════════════════════════
// 3. SINGLE-DOCUMENT STORY DETECTION
// ═════════════════════════════════════════════════════════════════

/**
 * Detect stories that consist of a single evidence item.
 * 
 * A single document can be a valid story if it contains a complete
 * problem → intervention → outcome structure (requirement §11).
 * 
 * This is NOT the same as unclustered evidence. Single-document
 * stories are promoted to full story candidates with their own
 * coherence scores.
 */
export function detectSingleDocumentStories(
  intelligenceMap: Map<number, EvidenceIntelligence>,
  singleDocAssessments: Map<number, { canBeSingleDocumentStory: boolean; narrativeCompletenessScore: number; assessmentReason: string }>,
  config?: Partial<StoryGraphConfig>
): StoryCandidate[] {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };
  const candidates: StoryCandidate[] = [];

  for (const [evidenceId, assessment] of singleDocAssessments) {
    if (!assessment.canBeSingleDocumentStory) continue;

    const intel = intelligenceMap.get(evidenceId);
    if (!intel) continue;

    const score = assessment.narrativeCompletenessScore;
    if (score < mergedConfig.singleDocumentMinimumScore) continue;

    // Build a single-document story candidate
    const dominantProgram = intel.programs[0];
    const dominantProblem = intel.problems[0];

    const reasons: string[] = [
      `Single-document story: ${assessment.assessmentReason}`,
    ];
    if (dominantProgram) {
      reasons.push(`Contains specific program reference: ${dominantProgram.name}`);
    }
    if (dominantProblem) {
      reasons.push(`Identifies problem: ${dominantProblem.name}`);
    }

    const candidate: StoryCandidate = {
      name: dominantProgram
        ? `${dominantProgram.name} Story`
        : dominantProblem
          ? `${dominantProblem.name} Response`
          : `Story E${evidenceId}`,
      description: `Self-contained narrative in evidence E${evidenceId}. ${assessment.assessmentReason}`,
      evidenceIds: [evidenceId],
      seedEvidenceIds: [evidenceId],
      contextEvidenceIds: [],
      coherenceScore: score,
      confidence: score * 0.9, // Slightly lower confidence for single-doc
      dominantProgram: dominantProgram,
      dominantProblem: dominantProblem,
      dominantTheme: inferTheme(intel),
      causalChain: [],
      reasons,
      status: "candidate",
      relationshipCounts: { strong: 0, medium: 0, weak: 0, total: 0 },
      diagnostics: {
        programIdentityScore: dominantProgram ? 0.9 : 0.0,
        causalContinuityScore: score,
        problemConsistencyScore: dominantProblem ? 0.8 : 0.0,
        eventContinuityScore: intel.events.length > 0 ? 0.7 : 0.0,
        outcomeConsistencyScore: intel.outcomes.length > 0 ? 0.8 : 0.0,
        temporalCoherenceScore: intel.events.some((e) => e.temporalInfo) ? 0.6 : 0.0,
        evidenceDensityScore: 0.5, // Single document = moderate density
        genericLocationPenalty: 0.0,
        genericActorPenalty: 0.0,
        unrelatedSectorPenalty: 0.0,
        contradictoryProgramPenalty: 0.0,
      },
    };

    candidates.push(candidate);
  }

  return candidates;
}

// ═════════════════════════════════════════════════════════════════
// 4. CLUSTER MERGING & DEDUPLICATION
// ═════════════════════════════════════════════════════════════════

/**
 * Merge overlapping story candidates.
 * 
 * If two candidates share ≥ 50% of their evidence, they are merged
 * into a single candidate with the union of evidence.
 */
export function mergeOverlappingCandidates(
  candidates: StoryCandidate[],
  overlapThreshold = 0.5
): StoryCandidate[] {
  if (candidates.length <= 1) return candidates;

  const merged: StoryCandidate[] = [];
  const used = new Set<number>();

  // Sort by coherence score descending (merge stronger into weaker)
  const sorted = [...candidates].sort((a, b) => b.coherenceScore - a.coherenceScore);

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;

    let current = sorted[i];
    const currentSet = new Set(current.evidenceIds);
    used.add(i);

    // Try to merge with other candidates
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;

      const other = sorted[j];
      const otherSet = new Set(other.evidenceIds);

      const intersection = new Set([...currentSet].filter((x) => otherSet.has(x)));
      const union = new Set([...currentSet, ...otherSet]);

      const overlap = intersection.size / Math.min(currentSet.size, otherSet.size);

      if (overlap >= overlapThreshold) {
        // Merge: union of evidence, higher coherence score
        const mergedEvidence = Array.from(union).sort((a, b) => a - b);
        const mergedSeed = Array.from(new Set([...current.seedEvidenceIds, ...other.seedEvidenceIds]));
        const mergedContext = Array.from(new Set([...current.contextEvidenceIds, ...other.contextEvidenceIds]))
          .filter((id) => !mergedSeed.includes(id));

        current = {
          ...current,
          evidenceIds: mergedEvidence,
          seedEvidenceIds: mergedSeed,
          contextEvidenceIds: mergedContext,
          coherenceScore: Math.max(current.coherenceScore, other.coherenceScore),
          confidence: Math.max(current.confidence, other.confidence),
          reasons: [...current.reasons, ...other.reasons],
        };

        used.add(j);
      }
    }

    merged.push(current);
  }

  return merged;
}

// ═════════════════════════════════════════════════════════════════
// 5. HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════

function computeSeedStrength(evidenceIds: number[], edges: AggregatedEdge[]): number {
  const idSet = new Set(evidenceIds);
  let strength = 0;

  for (const edge of edges) {
    if (idSet.has(edge.sourceEvidenceId) && idSet.has(edge.targetEvidenceId)) {
      strength += edge.finalWeight;
    }
  }

  return parseFloat(strength.toFixed(3));
}

function buildAdjacencyList(edges: AggregatedEdge[]): Map<number, number[]> {
  const adj = new Map<number, number[]>();

  for (const edge of edges) {
    const add = (from: number, to: number) => {
      const existing = adj.get(from) || [];
      if (!existing.includes(to)) existing.push(to);
      adj.set(from, existing);
    };

    add(edge.sourceEvidenceId, edge.targetEvidenceId);
    add(edge.targetEvidenceId, edge.sourceEvidenceId);
  }

  return adj;
}

function findConnectedComponents(adjacency: Map<number, number[]>): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue;

    const component: number[] = [];
    const stack = [node];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    components.push(component.sort((a, b) => a - b));
  }

  return components;
}

function countInternalEdges(component: number[], edges: AggregatedEdge[]): number {
  const idSet = new Set(component);
  return edges.filter((e) =>
    idSet.has(e.sourceEvidenceId) && idSet.has(e.targetEvidenceId)
  ).length;
}

function findDominant(counts: Map<number, number>): number | null {
  let maxId: number | null = null;
  let maxCount = 0;

  for (const [id, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxId = id;
    }
  }

  return maxId;
}

function deduplicateSeeds(seeds: StorySeed[]): StorySeed[] {
  const seen = new Set<string>();
  const result: StorySeed[] = [];

  for (const seed of seeds) {
    const key = seed.evidenceIds.sort((a, b) => a - b).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(seed);
  }

  return result;
}

function mergeOverlappingSeeds(seeds: StorySeed[]): StorySeed[] {
  if (seeds.length <= 1) return seeds;

  const merged: StorySeed[] = [];
  const used = new Set<number>();

  // Sort by strength descending
  const sorted = [...seeds].sort((a, b) => b.strength - a.strength);

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;

    let current = sorted[i];
    const currentSet = new Set(current.evidenceIds);
    used.add(i);

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;

      const other = sorted[j];
      const otherSet = new Set(other.evidenceIds);

      const intersection = new Set([...currentSet].filter((x) => otherSet.has(x)));
      if (intersection.size === 0) continue;

      // Merge if they share any evidence
      const union = new Set([...currentSet, ...otherSet]);
      current = {
        evidenceIds: Array.from(union).sort((a, b) => a - b),
        seedType: current.seedType,
        dominantProgramId: current.dominantProgramId ?? other.dominantProgramId,
        dominantProblemId: current.dominantProblemId ?? other.dominantProblemId,
        strength: Math.max(current.strength, other.strength),
      };

      used.add(j);
    }

    merged.push(current);
  }

  return merged;
}

function inferTheme(intel: EvidenceIntelligence): string {
  if (intel.programs.length > 0) return intel.programs[0].name;
  if (intel.problems.length > 0) return intel.problems[0].name;
  if (intel.events.length > 0) return intel.events[0].name;
  if (intel.outcomes.length > 0) return intel.outcomes[0].name;
  return "General";
}

function buildStoryCandidate(
  seed: StorySeed,
  evidenceIds: number[],
  seedEvidenceIds: number[],
  contextEvidenceIds: number[],
  edges: AggregatedEdge[]
): StoryCandidate {
  const idSet = new Set(evidenceIds);

  // Count relationship types within the candidate
  let strongCount = 0;
  let mediumCount = 0;
  let weakCount = 0;

  for (const edge of edges) {
    if (!idSet.has(edge.sourceEvidenceId) || !idSet.has(edge.targetEvidenceId)) continue;

    for (const rel of edge.contributingRelationships) {
      const tier = getRelationshipTier(rel.type);
      if (tier === "strong") strongCount++;
      else if (tier === "medium") mediumCount++;
      else weakCount++;
    }
  }

  const reasons: string[] = [
    `Seed type: ${seed.seedType}`,
    `Seed strength: ${seed.strength.toFixed(2)}`,
    `${seedEvidenceIds.length} seed evidence, ${contextEvidenceIds.length} context evidence`,
  ];

  if (seed.dominantProgramId) {
    reasons.push(`Dominant program connection`);
  }
  if (seed.dominantProblemId) {
    reasons.push(`Problem-driven cluster`);
  }

  return {
    name: `Story Candidate ${seed.seedType}`,
    description: `Discovered via ${seed.seedType} seed with strength ${seed.strength.toFixed(2)}`,
    evidenceIds,
    seedEvidenceIds,
    contextEvidenceIds,
    coherenceScore: 0, // Computed in TURN 8
    confidence: 0,      // Computed in TURN 8
    dominantTheme: "",  // Computed in TURN 8
    causalChain: [],    // Computed in TURN 8
    reasons,
    status: "candidate",
    relationshipCounts: {
      strong: strongCount,
      medium: mediumCount,
      weak: weakCount,
      total: strongCount + mediumCount + weakCount,
    },
    diagnostics: {
      programIdentityScore: 0,
      causalContinuityScore: 0,
      problemConsistencyScore: 0,
      eventContinuityScore: 0,
      outcomeConsistencyScore: 0,
      temporalCoherenceScore: 0,
      evidenceDensityScore: 0,
      genericLocationPenalty: 0,
      genericActorPenalty: 0,
      unrelatedSectorPenalty: 0,
      contradictoryProgramPenalty: 0,
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// 6. FULL PIPELINE (convenience)
// ═════════════════════════════════════════════════════════════════

export interface ClusteringResult {
  candidates: StoryCandidate[];
  singleDocumentStories: StoryCandidate[];
  unclusteredEvidence: number[];
  stats: {
    seedsDetected: number;
    candidatesFormed: number;
    singleDocumentStories: number;
    totalEvidenceInStories: number;
    averageCandidateSize: number;
  };
}

/**
 * Run the full story clustering pipeline.
 * 
 * @param storyGraph — The filtered Story Graph
 * @param edges — All aggregated edges
 * @param intelligenceMap — Per-evidence intelligence nodes
 * @param singleDocAssessments — Pre-computed single-document assessments
 * @param allEvidenceIds — All evidence IDs in the corpus
 * @param config — Runtime configuration
 */
export function runStoryClustering(
  storyGraph: StoryGraph,
  edges: AggregatedEdge[],
  intelligenceMap: Map<number, EvidenceIntelligence>,
  singleDocAssessments: Map<number, { canBeSingleDocumentStory: boolean; narrativeCompletenessScore: number; assessmentReason: string }>,
  allEvidenceIds: number[],
  config?: Partial<StoryGraphConfig>
): ClusteringResult {
  const mergedConfig = { ...DEFAULT_STORY_GRAPH_CONFIG, ...config };

  // Step 1: Detect seeds
  const seeds = detectStorySeeds(storyGraph, edges, intelligenceMap, mergedConfig);

  // Step 2: Expand seeds
  const expandedCandidates = expandStorySeeds(seeds, storyGraph, edges, mergedConfig);

  // Step 3: Detect single-document stories
  const singleDocStories = detectSingleDocumentStories(intelligenceMap, singleDocAssessments, mergedConfig);

  // Step 4: Merge overlapping candidates
  const allCandidates = mergeOverlappingCandidates([...expandedCandidates, ...singleDocStories]);

  // Step 5: Find unclustered evidence
  const clusteredEvidence = new Set<number>();
  for (const candidate of allCandidates) {
    for (const eid of candidate.evidenceIds) {
      clusteredEvidence.add(eid);
    }
  }
  const unclustered = allEvidenceIds.filter((id) => !clusteredEvidence.has(id));

  // Step 6: Stats
  const totalEvidenceInStories = clusteredEvidence.size;
  const avgSize = allCandidates.length > 0
    ? allCandidates.reduce((sum, c) => sum + c.evidenceIds.length, 0) / allCandidates.length
    : 0;

  return {
    candidates: allCandidates,
    singleDocumentStories,
    unclusteredEvidence: unclustered,
    stats: {
      seedsDetected: seeds.length,
      candidatesFormed: allCandidates.length,
      singleDocumentStories: singleDocStories.length,
      totalEvidenceInStories,
      averageCandidateSize: parseFloat(avgSize.toFixed(2)),
    },
  };
}
