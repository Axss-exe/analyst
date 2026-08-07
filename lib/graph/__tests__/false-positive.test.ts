import { describe, it, expect } from "vitest";
import { buildStoryGraph } from "../story-graph";
import type { TypedRelationship } from "@/types";

function makeContextRel(a: number, b: number, type: TypedRelationship["type"]): TypedRelationship {
  return {
    sourceEvidenceId: a, targetEvidenceId: b, type,
    weight: 1.0, confidence: 1.0, explicit: true,
    explanation: "test", sourceEvidence: "test", inferred: false,
  };
}

describe("False Positive Prevention", () => {
  it("Zimbabwe + AfDB alone must NOT create a story", () => {
    const rels: TypedRelationship[] = [
      makeContextRel(1, 2, "same_country"),
      makeContextRel(1, 2, "same_actor"),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(0);
  });

  it("Zimbabwe + agriculture alone must NOT create a story", () => {
    const rels: TypedRelationship[] = [
      makeContextRel(1, 2, "same_country"),
      makeContextRel(1, 2, "same_sector"),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(0);
  });

  it("Zimbabwe + finance alone must NOT create a story", () => {
    const rels: TypedRelationship[] = [
      makeContextRel(1, 2, "same_country"),
      makeContextRel(1, 2, "same_sector"),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(0);
  });

  it("AfDB + development alone must NOT create a story", () => {
    const rels: TypedRelationship[] = [
      makeContextRel(1, 2, "same_actor"),
      makeContextRel(1, 2, "generic_topical_similarity"),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(0);
  });

  it("AfDB + resilience alone must NOT create a story", () => {
    const rels: TypedRelationship[] = [
      makeContextRel(1, 2, "same_actor"),
      makeContextRel(1, 2, "generic_topical_similarity"),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(0);
  });

  it("same country + same organization must NOT create a story", () => {
    const rels: TypedRelationship[] = [
      makeContextRel(1, 2, "same_country"),
      makeContextRel(1, 2, "same_actor"),
    ];
    const { storyEdges } = buildStoryGraph(rels);
    expect(storyEdges.length).toBe(0);
  });
});
