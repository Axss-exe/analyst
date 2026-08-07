import type { TypedRelationship, TypedRelationshipType } from "@/types";
import type { StoryGraphConfig } from "./story-config";
import { STORY_BEARING_TYPES, CONTEXT_TYPES } from "./story-config";

export function isStoryBearing(type: TypedRelationshipType): boolean {
  return STORY_BEARING_TYPES.includes(type);
}

export function isContextRelationship(type: TypedRelationshipType): boolean {
  return CONTEXT_TYPES.includes(type);
}

export function scoreRelationship(
  rel: TypedRelationship,
  config?: StoryGraphConfig,
): number {
  const cfg = config ?? {
    storyGraphThreshold: 0.50,
    contextCap: 0.45,
    minSeedSize: 2,
    maxExpansionHops: 3,
    minCoherenceForValidation: 0.45,
    singleDocumentMinDensity: 0.5,
    baseScores: {
      same_program: 0.95,
      part_of_program: 0.85,
      implements: 0.80,
      funds: 0.75,
      causes: 0.80,
      triggered_by: 0.80,
      results_in: 0.75,
      addresses_problem: 0.78,
      same_policy_area: 0.70,
      same_strategic_objective: 0.68,
      same_causal_chain: 0.72,
      operationalizes: 0.75,
      produces: 0.70,
      supports: 0.68,
      evaluates: 0.70,
      same_country: 0.25,
      same_region: 0.20,
      same_actor: 0.30,
      same_sector: 0.22,
      generic_topical_similarity: 0.15,
    },
  };

  if (isStoryBearing(rel.type)) {
    const base = cfg.baseScores[rel.type] ?? 0.65;
    return Math.min(1.0, base * rel.confidence);
  }

  if (isContextRelationship(rel.type)) {
    const base = cfg.baseScores[rel.type] ?? 0.15;
    return Math.min(cfg.contextCap, base * rel.confidence);
  }

  return 0.1;
}

export function classifyEdge(
  relationshipType: TypedRelationshipType,
  weight: number,
  config?: StoryGraphConfig,
): { entersStoryGraph: boolean; reason: string } {
  const cfg = config ?? {
    storyGraphThreshold: 0.50,
    contextCap: 0.45,
    minSeedSize: 2,
    maxExpansionHops: 3,
    minCoherenceForValidation: 0.45,
    singleDocumentMinDensity: 0.5,
    baseScores: {
      same_program: 0.95,
      part_of_program: 0.85,
      implements: 0.80,
      funds: 0.75,
      causes: 0.80,
      triggered_by: 0.80,
      results_in: 0.75,
      addresses_problem: 0.78,
      same_policy_area: 0.70,
      same_strategic_objective: 0.68,
      same_causal_chain: 0.72,
      operationalizes: 0.75,
      produces: 0.70,
      supports: 0.68,
      evaluates: 0.70,
      same_country: 0.25,
      same_region: 0.20,
      same_actor: 0.30,
      same_sector: 0.22,
      generic_topical_similarity: 0.15,
    },
  };

  const isStory = isStoryBearing(relationshipType);
  const entersStoryGraph = isStory && weight >= cfg.storyGraphThreshold;

  if (!isStory) {
    return {
      entersStoryGraph: false,
      reason: `Context relationship "${relationshipType}" cannot enter Story Graph`,
    };
  }
  if (weight < cfg.storyGraphThreshold) {
    return {
      entersStoryGraph: false,
      reason: `Weight ${weight.toFixed(3)} below Story Graph threshold ${cfg.storyGraphThreshold}`,
    };
  }
  return {
    entersStoryGraph: true,
    reason: `Story-bearing relationship "${relationshipType}" meets threshold`,
  };
}
