import { describe, it, expect } from "vitest";
import { buildStoryGraph } from "../story-graph";
import type { TypedRelationship, StoryGraphEdge } from "@/types";

function makeRel(a: number, b: number, type: TypedRelationship["type"], opts: Partial<TypedRelationship> = {}): TypedRelationship {
  return {
    sourceEvidenceId: a, targetEvidenceId: b, type,
    weight: 1.0, confidence: 0.9, explicit: true,
    explanation: "test explanation", sourceEvidence: "test evidence",
    inferred: false, ...opts,
  };
}

describe("Provenance Requirements", () => {
  it("story-bearing edge must have all provenance fields", () => {
    const rels: TypedRelationship[] = [
      makeRel(1, 2, "same_program", {
        explanation: "Both documents explicitly name ZEFPP in program context",
        sourceEvidence: "E11: 'ZEFPP implementation plan'; E12: 'ZEFPP mid-term review'",
      }),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(1);
    const edge = storyEdges[0];
    expect(edge.relationshipType).toBe("same_program");
    expect(edge.weight).toBeGreaterThan(0);
    expect(edge.confidence).toBeGreaterThan(0);
    expect(edge.explanation).toBeTruthy();
    expect(edge.sourceEvidence).toBeTruthy();
  });

  it("must be able to answer 'Why do these documents belong together?'", () => {
    const rels: TypedRelationship[] = [
      makeRel(1, 2, "implements", {
        explanation: "Document E05 describes the DRF policy; Document E06 describes Zimbabwe Government's implementation of that policy",
        sourceEvidence: "E05 policy text; E06 implementation report",
      }),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges[0].explanation).toContain("E05");
    expect(storyEdges[0].explanation).toContain("E06");
    expect(storyEdges[0].relationshipType).toBe("implements");
  });

  it("rejected edge still has provenance explaining weak connection", () => {
    const rels: TypedRelationship[] = [
      makeRel(1, 3, "same_country", {
        confidence: 1.0,
        explanation: "Both mention Zimbabwe",
        sourceEvidence: "E01: 'Zimbabwe'; E03: 'Zimbabwe'",
      }),
    ];
    const { contextEdges } = buildStoryGraph(rels);
    expect(contextEdges.length).toBe(1);
    expect(contextEdges[0].explanation).toContain("Context");
  });

  it("inferred edge must include inference chain", () => {
    const rels: TypedRelationship[] = [
      makeRel(1, 3, "same_policy_area", {
        confidence: 0.8, explicit: false,
        explanation: "Inferred same policy area through shared strategic objective",
        sourceEvidence: "Strategic objective alignment analysis",
        inferred: true,
        inferenceChain: ["shared_strategic_objective", "policy_domain_classifier"],
      }),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(1);
    expect(storyEdges[0].inferred).toBe(true);
    expect(storyEdges[0].inferenceChain).toBeDefined();
    expect(storyEdges[0].inferenceChain!.length).toBeGreaterThan(0);
  });
});
