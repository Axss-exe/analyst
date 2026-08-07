import type {
  TypedRelationship,
  StoryGraphEdge,
  ContextGraphEdge,
} from "@/types";
import type { StoryGraphConfig } from "./story-config";
import { scoreRelationship, classifyEdge, isStoryBearing } from "./relationship-scorer";

export function buildStoryGraph(
  relationships: TypedRelationship[],
  config?: StoryGraphConfig,
): { storyEdges: StoryGraphEdge[]; contextEdges: ContextGraphEdge[] } {
  const storyEdges: StoryGraphEdge[] = [];
  const contextEdges: ContextGraphEdge[] = [];

  for (const rel of relationships) {
    const weight = scoreRelationship(rel, config);
    const classification = classifyEdge(rel.type, weight, config);

    if (classification.entersStoryGraph && isStoryBearing(rel.type)) {
      storyEdges.push({
        sourceEvidenceId: rel.sourceEvidenceId,
        targetEvidenceId: rel.targetEvidenceId,
        relationshipType: rel.type,
        weight,
        confidence: rel.confidence,
        explicit: rel.explicit,
        explanation: rel.explanation,
        sourceEvidence: rel.sourceEvidence,
        inferred: rel.inferred,
        inferenceChain: rel.inferenceChain,
      });
    } else {
      contextEdges.push({
        sourceEvidenceId: rel.sourceEvidenceId,
        targetEvidenceId: rel.targetEvidenceId,
        relationshipType: rel.type as ContextGraphEdge["relationshipType"],
        weight,
        confidence: rel.confidence,
        explanation: `${rel.explanation} (${classification.reason})`,
        sourceEvidence: rel.sourceEvidence,
      });
    }
  }

  return { storyEdges, contextEdges };
}

export function getNeighborsInStoryGraph(
  evidenceId: number,
  storyEdges: StoryGraphEdge[],
): Array<{ evidenceId: number; edge: StoryGraphEdge }> {
  const neighbors: Array<{ evidenceId: number; edge: StoryGraphEdge }> = [];
  for (const edge of storyEdges) {
    if (edge.sourceEvidenceId === evidenceId) {
      neighbors.push({ evidenceId: edge.targetEvidenceId, edge });
    } else if (edge.targetEvidenceId === evidenceId) {
      neighbors.push({ evidenceId: edge.sourceEvidenceId, edge });
    }
  }
  return neighbors;
}
