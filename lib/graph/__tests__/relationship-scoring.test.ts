import { describe, it, expect } from "vitest";
import { scoreRelationship, isStoryBearing, isContextRelationship } from "../relationship-scorer";
import type { TypedRelationship } from "@/types";

describe("Relationship Scoring", () => {
  it("same_program should score near 0.95 with high confidence", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_program",
      weight: 1.0, confidence: 1.0, explicit: true,
      explanation: "Both documents explicitly name ZEFPP",
      sourceEvidence: "Document E11 mentions ZEFPP", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeGreaterThan(0.90);
    expect(scoreRelationship(rel)).toBeLessThanOrEqual(1.0);
  });

  it("part_of_program should score above 0.70", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "part_of_program",
      weight: 1.0, confidence: 0.9, explicit: true,
      explanation: "Document A describes a project under TAEP",
      sourceEvidence: "TAEP umbrella mentioned", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeGreaterThan(0.70);
  });

  it("implements should score above 0.75", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "implements",
      weight: 1.0, confidence: 0.95, explicit: true,
      explanation: "Government implements program described in policy doc",
      sourceEvidence: "Implementation clause", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeGreaterThan(0.75);
  });

  it("causes should score above 0.75", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "causes",
      weight: 1.0, confidence: 0.9, explicit: true,
      explanation: "Drought causes food insecurity per causal analysis",
      sourceEvidence: "Causal chain extraction", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeGreaterThan(0.75);
  });

  it("addresses_problem should score above 0.70", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "addresses_problem",
      weight: 1.0, confidence: 0.9, explicit: true,
      explanation: "Program directly addresses identified problem",
      sourceEvidence: "Problem-solution alignment", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeGreaterThan(0.70);
  });

  it("same_policy_area should score above 0.60 but below story-program threshold", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_policy_area",
      weight: 1.0, confidence: 0.9, explicit: false,
      explanation: "Both concern public financial management reform",
      sourceEvidence: "Policy domain classification", inferred: false,
    };
    const score = scoreRelationship(rel);
    expect(score).toBeGreaterThan(0.60);
    expect(score).toBeLessThan(0.85);
  });

  it("same_actor should score below 0.45 (context cap)", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_actor",
      weight: 1.0, confidence: 1.0, explicit: true,
      explanation: "Both mention AfDB", sourceEvidence: "Actor mention", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeLessThanOrEqual(0.45);
  });

  it("same_country should score below 0.35 (context cap)", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_country",
      weight: 1.0, confidence: 1.0, explicit: true,
      explanation: "Both mention Zimbabwe", sourceEvidence: "Location mention", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeLessThanOrEqual(0.35);
  });

  it("same_sector should score below 0.35 (context cap)", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_sector",
      weight: 1.0, confidence: 1.0, explicit: true,
      explanation: "Both concern agriculture", sourceEvidence: "Sector classification", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeLessThanOrEqual(0.35);
  });

  it("generic_topical_similarity should score below 0.25", () => {
    const rel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "generic_topical_similarity",
      weight: 1.0, confidence: 1.0, explicit: false,
      explanation: "Both concern development and resilience",
      sourceEvidence: "Topic overlap", inferred: false,
    };
    expect(scoreRelationship(rel)).toBeLessThanOrEqual(0.25);
  });

  it("story-bearing relationships must ALWAYS outrank context relationships regardless of confidence", () => {
    const storyRel: TypedRelationship = {
      sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_program",
      weight: 1.0, confidence: 0.5, explicit: false,
      explanation: "Inferred same program", sourceEvidence: "Inferred", inferred: false,
    };
    const contextRel: TypedRelationship = {
      sourceEvidenceId: 3, targetEvidenceId: 4, type: "same_country",
      weight: 1.0, confidence: 1.0, explicit: true,
      explanation: "Explicitly both about Zimbabwe", sourceEvidence: "Explicit", inferred: false,
    };
    expect(scoreRelationship(storyRel)).toBeGreaterThan(scoreRelationship(contextRel));
  });
});
