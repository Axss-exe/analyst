import { describe, it, expect } from "vitest";
import { canExpandInto } from "../story-expansion";
import type { StoryGraphEdge } from "@/types";

describe("Weighted Story Expansion", () => {
  const emptyState = { storyEvidenceIds: new Set([1]), boundaryEdges: [] as StoryGraphEdge[], hopCounts: new Map([[1, 0]]) };

  it("expands through program identity (same_program)", () => {
    expect(canExpandInto(emptyState, 2, "same_program", 0.95)).toBe(true);
  });

  it("expands through causal relationship (causes)", () => {
    expect(canExpandInto(emptyState, 2, "causes", 0.80)).toBe(true);
  });

  it("expands through problem-response (addresses_problem)", () => {
    expect(canExpandInto(emptyState, 2, "addresses_problem", 0.78)).toBe(true);
  });

  it("expands through policy relationship (same_policy_area) at threshold", () => {
    expect(canExpandInto(emptyState, 2, "same_policy_area", 0.55)).toBe(true);
  });

  it("refuses weak policy expansion (same_policy_area below threshold)", () => {
    expect(canExpandInto(emptyState, 2, "same_policy_area", 0.50)).toBe(false);
  });

  it("refuses expansion through same_country", () => {
    expect(canExpandInto(emptyState, 2, "same_country", 0.99)).toBe(false);
  });

  it("refuses expansion through same_actor", () => {
    expect(canExpandInto(emptyState, 2, "same_actor", 0.99)).toBe(false);
  });

  it("refuses expansion through same_sector", () => {
    expect(canExpandInto(emptyState, 2, "same_sector", 0.99)).toBe(false);
  });

  it("refuses expansion through generic topical similarity", () => {
    expect(canExpandInto(emptyState, 2, "generic_topical_similarity", 0.99)).toBe(false);
  });

  it("program identity outranks policy for expansion", () => {
    const programAllowed = canExpandInto(emptyState, 2, "same_program", 0.90);
    const policyAllowed = canExpandInto(emptyState, 2, "same_policy_area", 0.90);
    expect(programAllowed).toBe(true);
    expect(policyAllowed).toBe(true);
  });
});
