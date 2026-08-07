/**
 * ATIS v4 — Global Type Definitions
 * 
 * This file contains all cross-cutting types used by the AI layer,
 * graph layer, API routes, and UI components.
 * 
 * v3 types are preserved for backward compatibility.
 * v4 types are additive and live in the "story-graph" namespace.
 */

// ═════════════════════════════════════════════════════════════════
// v3 — Structured Extraction & Facts
// ═════════════════════════════════════════════════════════════════

export interface StructuredExtraction {
  entities: ExtractedEntity[];
  facts: Fact[];
  relationships: ExtractedRelationship[];
  timeline?: TimelineEvent[];
  topics?: string[];
  confidence: number;
}

export interface ExtractedEntity {
  name: string;
  type: string;
  mentions: number;
  context?: string;
}

export interface Fact {
  id?: number;
  subject: string;
  predicate: string;
  object: string;
  evidenceId: number;
  confidence: number;
  createdAt?: Date;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  type: string;
  evidence?: string;
  confidence: number;
}

export interface TimelineEvent {
  date: string;
  description: string;
  entityNames?: string[];
}

// ═════════════════════════════════════════════════════════════════
// v3 — Connection Signals (legacy, still used by Context Graph)
// ═════════════════════════════════════════════════════════════════

export interface ConnectionSignal {
  id?: number;
  evidenceIdA: number;
  evidenceIdB: number;
  signalType: string;
  strength: number;
  reason: string;
  createdAt?: Date;
}

// ═════════════════════════════════════════════════════════════════
// v3 — Graph Clusters & Narratives
// ═════════════════════════════════════════════════════════════════

export interface GraphCluster {
  id: number;
  name: string;
  description: string;
  density: number;
  status: "new" | "strengthened" | "merged" | "stable";
  evidenceCount: number;
  entityCount: number;
  evidenceIds: number[];
  entityIds: number[];
  narrative?: Narrative;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Narrative {
  id?: number;
  title: string;
  overview: string;
  clusterIds: number[];
  evidenceIds: number[];
  confidence: number;
  generationType: "manual" | "auto";
  createdAt?: Date;
  updatedAt?: Date;
}

// ═════════════════════════════════════════════════════════════════
// v3 — Hidden Paths, Bridge Nodes, Contradictions
// ═════════════════════════════════════════════════════════════════

export interface HiddenPath {
  path: number[]; // evidence IDs
  bridgeEvidenceIds: number[];
  explanation: string;
  signalTypes: string[];
}

export interface BridgeNode {
  entityId: number;
  entityName: string;
  connectedEvidenceIds: number[];
  betweennessScore: number;
}

export interface Contradiction {
  evidenceIdA: number;
  evidenceIdB: number;
  subject: string;
  claimA: string;
  claimB: string;
  confidence: number;
}

// ═════════════════════════════════════════════════════════════════
// v3 — Graph Visualization
// ═════════════════════════════════════════════════════════════════

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  confidence: number;
}

export interface GraphStats {
  evidenceCount: number;
  entityCount: number;
  relationshipCount: number;
  connectionCount: number;
  clusterCount: number;
  averageClusterDensity: number;
  bridgeNodeCount: number;
}

// ═════════════════════════════════════════════════════════════════
// v3 — API Response Shapes
// ═════════════════════════════════════════════════════════════════

export interface DiscoverResponse {
  clusters: GraphCluster[];
  unlinkedCount: number;
  clusteredCount: number;
  totalNarratives: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  hiddenPaths: HiddenPath[];
  bridgeNodes: BridgeNode[];
  contradictions: Contradiction[];
  narratives: Narrative[];
  unclusteredCount: number;
  stats: GraphStats;
}

export interface StoriesResponse {
  stories: StoryItem[];
  total: number;
  manualCount: number;
  autoCount: number;
}

export interface StoryItem {
  id: number;
  title: string;
  overview: string;
  status: string;
  updatedAt: string;
  evidenceCount: number;
  generationType: "manual" | "auto";
  confidence?: number;
  clusterIds?: number[];
}

// ═════════════════════════════════════════════════════════════════
// v4 — Re-exports from story-types (single source of truth)
// ═════════════════════════════════════════════════════════════════

export {
  RELATIONSHIP_TYPE_WEIGHTS,
  STORY_ESTABLISHING_TYPES,
  STORY_SUPPRESSED_TYPES,
  DEFAULT_STORY_GRAPH_CONFIG,
  getRelationshipTier,
  getRelationshipTypeWeight,
  buildStoryGraphConfig,
} from "@/lib/graph/story-types";

export type {
  RelationshipType,
  RelationshipTier,
  Program,
  Event,
  Problem,
  Outcome,
  Actor,
  IntelligenceNode,
  IntelligenceNodeType,
  StoryBearingRelationship,
  ContextGraph,
  StoryGraph,
  StorySeed,
  CausalLink,
  StoryDiagnostics,
  StoryCandidate,
  StoryCoherenceScore,
  SuppressionContext,
  EdgeSuppressionResult,
  StructuredIntelligence,
  StoryGraphConfig,
  EdgeExplanation,
  StoryDiagnosticView,
} from "@/lib/graph/story-types";

// ═════════════════════════════════════════════════════════════════
// v4 — API Response Extensions (additive to v3 shapes)
// ═════════════════════════════════════════════════════════════════

/**
 * Extended discover response that includes v4 story candidates
 * alongside legacy v3 clusters. Frontends can consume either.
 */
export interface DiscoverResponseV4 extends DiscoverResponse {
  storyCandidates: StoryCandidate[];
  rejectedCandidates: StoryCandidate[];
  singleDocumentStories: StoryCandidate[];
  diagnostics: {
    totalRelationshipsEvaluated: number;
    storyGraphEdges: number;
    contextGraphEdges: number;
    seedsFound: number;
    expansionsPerformed: number;
  };
}

/**
 * Extended graph response that exposes both graph layers.
 */
export interface GraphResponseV4 extends GraphResponse {
  contextGraph: ContextGraph;
  storyGraph: StoryGraph;
  edgeExplanations: EdgeExplanation[];
}

/**
 * Extended story item that includes v4 provenance metadata.
 */
export interface StoryItemV4 extends StoryItem {
  dominantProgram?: string;
  dominantProblem?: string;
  dominantTheme?: string;
  causalChain?: CausalLink[];
  relationshipCounts?: {
    strong: number;
    medium: number;
    weak: number;
    total: number;
  };
  diagnostics?: StoryDiagnostics;
  reasons?: string[];
  whyDocumentsBelong?: string[];
  whyNearbyDocumentsRejected?: string[];
}
