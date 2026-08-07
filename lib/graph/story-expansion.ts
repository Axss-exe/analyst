import type { StoryGraphEdge, StoryGraphConfig, TypedRelationshipType } from "@/types";
import type { StoryGraphConfig as ConfigType } from "./story-config";

interface ExpansionState {
  storyEvidenceIds: Set<number>;
  boundaryEdges: StoryGraphEdge[];
  hopCounts: Map<number, number>; // evidenceId -> hops from seed
}

const DEFAULT_EXPANSION_RULES: Record<TypedRelationshipType, { minWeight: number; maxHops: number }> = {
  same_program: { minWeight: 0.85, maxHops: 3 },
  part_of_program: { minWeight: 0.70, maxHops: 2 },
  implements: { minWeight: 0.70, maxHops: 2 },
  funds: { minWeight: 0.65, maxHops: 2 },
  causes: { minWeight: 0.70, maxHops: 2 },
  triggered_by: { minWeight: 0.70, maxHops: 2 },
  results_in: { minWeight: 0.65, maxHops: 2 },
  addresses_problem: { minWeight: 0.65, maxHops: 2 },
  same_policy_area: { minWeight: 0.55, maxHops: 1 },
  same_strategic_objective: { minWeight: 0.55, maxHops: 1 },
  same_causal_chain: { minWeight: 0.60, maxHops: 2 },
  operationalizes: { minWeight: 0.65, maxHops: 2 },
  produces: { minWeight: 0.60, maxHops: 2 },
  supports: { minWeight: 0.60, maxHops: 2 },
  evaluates: { minWeight: 0.60, maxHops: 2 },
  // Context relationships — cannot expand stories
  same_country: { minWeight: 1.0, maxHops: 0 },
  same_region: { minWeight: 1.0, maxHops: 0 },
  same_actor: { minWeight: 1.0, maxHops: 0 },
  same_sector: { minWeight: 1.0, maxHops: 0 },
  generic_topical_similarity: { minWeight: 1.0, maxHops: 0 },
};

export function canExpandInto(
  state: ExpansionState,
  candidateId: number,
  edgeType: TypedRelationshipType,
  weight: number,
  config?: ConfigType,
): boolean {
  const rules = DEFAULT_EXPANSION_RULES;
  const rule = rules[edgeType];
  if (!rule) return false;
  if (rule.maxHops === 0) return false;
  if (weight < rule.minWeight) return false;

  // Check hop limit from nearest seed member
  const nearestHop = Math.min(
    ...Array.from(state.hopCounts.entries())
      .filter(([id]) => state.storyEvidenceIds.has(id))
      .map(([, hops]) => hops),
    0,
  );

  const candidateHop = (state.hopCounts.get(candidateId) ?? Infinity);
  const newHop = nearestHop + 1;

  if (newHop > rule.maxHops) return false;
  if (candidateHop <= newHop) return false; // Already reached via shorter path

  return true;
}

export function expandStory(
  seedEvidenceIds: number[],
  allStoryEdges: StoryGraphEdge[],
  config?: ConfigType,
): { expandedIds: number[]; usedEdges: StoryGraphEdge[] } {
  const expandedIds = new Set<number>(seedEvidenceIds);
  const usedEdges: StoryGraphEdge[] = [];
  const hopCounts = new Map<number, number>();

  for (const id of seedEvidenceIds) {
    hopCounts.set(id, 0);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of allStoryEdges) {
      const inStory = expandedIds.has(edge.sourceEvidenceId);
      const candidateId = inStory ? edge.targetEvidenceId : edge.sourceEvidenceId;
      const sourceId = inStory ? edge.sourceEvidenceId : edge.targetEvidenceId;

      if (!inStory && !expandedIds.has(edge.targetEvidenceId)) continue;
      if (expandedIds.has(candidateId)) continue;

      const state: ExpansionState = {
        storyEvidenceIds: expandedIds,
        boundaryEdges: usedEdges,
        hopCounts,
      };

      if (canExpandInto(state, candidateId, edge.relationshipType, edge.weight, config)) {
        expandedIds.add(candidateId);
        usedEdges.push(edge);
        const sourceHop = hopCounts.get(sourceId) ?? 0;
        hopCounts.set(candidateId, sourceHop + 1);
        changed = true;
      }
    }
  }

  return { expandedIds: Array.from(expandedIds), usedEdges };
}
