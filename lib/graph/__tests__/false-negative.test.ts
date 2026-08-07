import { describe, it, expect } from "vitest";
import { buildStoryGraph } from "../story-graph";
import type { TypedRelationship } from "@/types";

function makeStoryRel(a: number, b: number, type: TypedRelationship["type"], confidence: number): TypedRelationship {
  return {
    sourceEvidenceId: a, targetEvidenceId: b, type,
    weight: 1.0, confidence, explicit: true,
    explanation: "test", sourceEvidence: "test", inferred: false,
  };
}

describe("False Negative Prevention", () => {
  it("discovers TAEP ↔ MAPS relationship through public financial management reform", () => {
    const rels: TypedRelationship[] = [
      makeStoryRel(14, 20, "same_policy_area", 0.9),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(1);
    expect(storyEdges[0].relationshipType).toBe("same_policy_area");
  });

  it("discovers regional financing diagnosis ↔ response connection", () => {
    const rels: TypedRelationship[] = [
      makeStoryRel(3, 4, "addresses_problem", 0.9),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(1);
    expect(storyEdges[0].relationshipType).toBe("addresses_problem");
  });

  it("discovers portfolio review ↔ evaluated project connection", () => {
    const rels: TypedRelationship[] = [
      makeStoryRel(8, 9, "evaluates", 0.9),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(1);
    expect(storyEdges[0].relationshipType).toBe("evaluates");
  });
});
