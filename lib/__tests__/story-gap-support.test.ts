import { describe, expect, it } from "vitest";
import { factEstablishesActorRole, factSupportsEntityPair } from "../story-gaps";
import { filterResolvedGaps } from "../story-tasks";

const afdb = { id: 1, name: "African Development Bank", aliases: null };
const zambia = { id: 2, name: "Zambia", aliases: null };

describe("story gap evidence support", () => {
  it("supports a relationship established by a structured fact", () => {
    expect(factSupportsEntityPair({
      subject: "African Development Bank Group",
      predicate: "approved loan amount",
      object: "$75 million for Zambia Renewable Energy Access Project (REAP)",
    }, afdb, zambia)).toBe(true);
  });

  it("does not support a relationship from co-occurrence alone", () => {
    expect(factSupportsEntityPair({
      subject: "African Development Bank",
      predicate: "mentioned alongside",
      object: "Official creditors and Zambia",
    }, afdb, { id: 3, name: "Official creditors", aliases: null })).toBe(false);
  });

  it("recognizes an actor role from an action fact", () => {
    expect(factEstablishesActorRole({
      subject: "Government of Zambia",
      predicate: "will contribute counterpart funding amount",
      object: "$5 million to REAP",
    }, zambia)).toBe(true);
  });

  it("resolves an existing answered research question", () => {
    const gap = { type: "missing_relationship" as const, severity: "medium" as const, description: "", details: "", suggestedQuestion: "What is the relationship between African Development Bank and Zambia?" };
    expect(filterResolvedGaps([gap], new Set([gap.suggestedQuestion.toLowerCase()]))).toHaveLength(0);
  });

  it("keeps a genuinely unanswered research question", () => {
    const gap = { type: "missing_relationship" as const, severity: "medium" as const, description: "", details: "", suggestedQuestion: "What is the relationship between African Development Bank and Official creditors?" };
    expect(filterResolvedGaps([gap], new Set())).toHaveLength(1);
  });

  it("does not resurrect a completed answered task", () => {
    const gap = { type: "missing_relationship" as const, severity: "medium" as const, description: "", details: "", suggestedQuestion: "What is the relationship between African Development Bank and Zambia?" };
    expect(filterResolvedGaps([gap], new Set([gap.suggestedQuestion.toLowerCase()]))).not.toContain(gap);
  });

  it("keeps a new unanswered question available for task creation", () => {
    const gap = { type: "actor_gap" as const, severity: "low" as const, description: "", details: "", suggestedQuestion: "What specific role does a new actor have?" };
    expect(filterResolvedGaps([gap], new Set())).toEqual([gap]);
  });
});