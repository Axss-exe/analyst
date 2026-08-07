import { describe, it, expect } from "vitest";
import { runStoryPipeline } from "../story-pipeline";
import type { TypedRelationship } from "@/types";

describe("Full Pipeline Integration", () => {
  it("pipeline produces output with correct structure", () => {
    const evidence = [
      {
        id: 11, title: "ZEFPP Implementation Plan", programs: ["ZEFPP", "AEFPF"],
        projects: [], problems: ["food insecurity"], outcomes: ["emergency food production"],
        actors: ["AfDB", "Zimbabwe"], countries: ["Zimbabwe"], sectors: ["agriculture"],
        dates: ["2024-01"], factCount: 8,
        internalProgramCount: 2, internalCausalChains: 1, internalProblemResponsePairs: 1, evidenceDensity: 0.8,
      },
      {
        id: 12, title: "ZEFPP Mid-term Review", programs: ["ZEFPP"],
        projects: [], problems: ["food insecurity"], outcomes: ["production targets"],
        actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["agriculture"],
        dates: ["2024-03"], factCount: 10,
        internalProgramCount: 1, internalCausalChains: 0, internalProblemResponsePairs: 1, evidenceDensity: 0.7,
      },
    ];

    const rels: TypedRelationship[] = [
      {
        sourceEvidenceId: 11, targetEvidenceId: 12, type: "same_program",
        weight: 1.0, confidence: 0.95, explicit: true,
        explanation: "Both mention ZEFPP", sourceEvidence: "E11, E12", inferred: false,
      },
    ];

    const output = runStoryPipeline(evidence, rels);

    expect(output).toHaveProperty("stories");
    expect(output).toHaveProperty("contextGraph");
    expect(output).toHaveProperty("unassignedEvidence");
    expect(Array.isArray(output.stories)).toBe(true);
    expect(Array.isArray(output.contextGraph)).toBe(true);
    expect(Array.isArray(output.unassignedEvidence)).toBe(true);
  });

  it("pipeline produces at least one story for connected ZEFPP evidence", () => {
    const evidence = [
      {
        id: 11, title: "ZEFPP Plan", programs: ["ZEFPP"],
        projects: [], problems: ["food insecurity"], outcomes: [],
        actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["agriculture"],
        dates: ["2024-01"], factCount: 5,
        internalProgramCount: 1, internalCausalChains: 0, internalProblemResponsePairs: 0, evidenceDensity: 0.6,
      },
      {
        id: 12, title: "ZEFPP Review", programs: ["ZEFPP"],
        projects: [], problems: ["food insecurity"], outcomes: [],
        actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["agriculture"],
        dates: ["2024-02"], factCount: 6,
        internalProgramCount: 1, internalCausalChains: 0, internalProblemResponsePairs: 0, evidenceDensity: 0.6,
      },
    ];

    const rels: TypedRelationship[] = [
      {
        sourceEvidenceId: 11, targetEvidenceId: 12, type: "same_program",
        weight: 1.0, confidence: 0.95, explicit: true,
        explanation: "Both mention ZEFPP", sourceEvidence: "E11, E12", inferred: false,
      },
    ];

    const output = runStoryPipeline(evidence, rels);
    expect(output.stories.length).toBeGreaterThanOrEqual(1);
    const validStories = output.stories.filter(s => s.isValid);
    expect(validStories.length).toBeGreaterThanOrEqual(1);
  });

  it("pipeline separates stories from context graph", () => {
    const evidence = [
      {
        id: 1, title: "Doc A", programs: ["Prog1"],
        projects: [], problems: [], outcomes: [],
        actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["agriculture"],
        dates: ["2024-01"], factCount: 3,
        internalProgramCount: 1, internalCausalChains: 0, internalProblemResponsePairs: 0, evidenceDensity: 0.6,
      },
      {
        id: 2, title: "Doc B", programs: ["Prog1"],
        projects: [], problems: [], outcomes: [],
        actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["agriculture"],
        dates: ["2024-02"], factCount: 3,
        internalProgramCount: 1, internalCausalChains: 0, internalProblemResponsePairs: 0, evidenceDensity: 0.6,
      },
    ];

    const rels: TypedRelationship[] = [
      {
        sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_program",
        weight: 1.0, confidence: 0.9, explicit: true,
        explanation: "Same program", sourceEvidence: "test", inferred: false,
      },
      {
        sourceEvidenceId: 1, targetEvidenceId: 2, type: "same_country",
        weight: 1.0, confidence: 1.0, explicit: true,
        explanation: "Same country", sourceEvidence: "test", inferred: false,
      },
    ];

    const output = runStoryPipeline(evidence, rels);
    expect(output.stories.length).toBeGreaterThanOrEqual(1);
    expect(output.contextGraph.length).toBeGreaterThanOrEqual(1);
  });
});
