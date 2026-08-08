import type { StoryGraphConfig, TypedRelationshipType } from "@/types";

export const DEFAULT_STORY_GRAPH_CONFIG: StoryGraphConfig = {
  storyGraphThreshold: 0.50,
  contextCap: 0.45,
  minSeedSize: 2,
  maxExpansionHops: 3,
  minCoherenceForValidation: 0.45,
  singleDocumentMinDensity: 0.5,
  baseScores: {
    // Story-bearing relationships
    same_program: 0.95,
    part_of_program: 0.85,
    implements: 0.80,
    funds: 0.75,
    causes: 0.85,
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
    // Context relationships (capped by contextCap in scorer)
    same_country: 0.25,
    same_region: 0.20,
    same_actor: 0.30,
    same_sector: 0.22,
    generic_topical_similarity: 0.15,
  },
};

export const STORY_BEARING_TYPES: TypedRelationshipType[] = [
  "same_program",
  "part_of_program",
  "implements",
  "funds",
  "causes",
  "triggered_by",
  "results_in",
  "addresses_problem",
  "same_policy_area",
  "same_strategic_objective",
  "same_causal_chain",
  "operationalizes",
  "produces",
  "supports",
  "evaluates",
];

export const CONTEXT_TYPES: TypedRelationshipType[] = [
  "same_country",
  "same_region",
  "same_actor",
  "same_sector",
  "generic_topical_similarity",
];
