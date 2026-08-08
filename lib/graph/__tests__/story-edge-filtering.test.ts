import { describe, it, expect } from "vitest";
import { classifyEdge } from "../relationship-scorer";

describe("Story Edge Filtering", () => {
  it("strong same_program edge enters Story Graph", () => {
    const result = classifyEdge("same_program", 0.95);
    expect(result.entersStoryGraph).toBe(true);
  });

  it("strong implements edge enters Story Graph", () => {
    const result = classifyEdge("implements", 0.80);
    expect(result.entersStoryGraph).toBe(true);
  });

  it("strong causes edge enters Story Graph", () => {
    const result = classifyEdge("causes", 0.80);
    expect(result.entersStoryGraph).toBe(true);
  });

  it("weak same_program edge stays in Context Graph", () => {
    const result = classifyEdge("same_program", 0.30);
    expect(result.entersStoryGraph).toBe(false);
    expect(result.reason).toContain("below Story Graph threshold");
  });

  it("same_country edge stays in Context Graph regardless of weight", () => {
    const result = classifyEdge("same_country", 0.99);
    expect(result.entersStoryGraph).toBe(false);
    expect(result.reason).toContain("Context relationship");
  });

  it("same_organization edge stays in Context Graph regardless of weight", () => {
    const result = classifyEdge("same_actor", 0.99);
    expect(result.entersStoryGraph).toBe(false);
  });

  it("same_sector edge stays in Context Graph regardless of weight", () => {
    const result = classifyEdge("same_sector", 0.99);
    expect(result.entersStoryGraph).toBe(false);
  });

  it("generic_topical_similarity stays in Context Graph", () => {
    const result = classifyEdge("generic_topical_similarity", 0.99);
    expect(result.entersStoryGraph).toBe(false);
  });

  it("same_policy_area at threshold 0.50 enters Story Graph", () => {
    const result = classifyEdge("same_policy_area", 0.50);
    expect(result.entersStoryGraph).toBe(true);
  });

  it("same_policy_area below threshold stays in Context Graph", () => {
    const result = classifyEdge("same_policy_area", 0.49);
    expect(result.entersStoryGraph).toBe(false);
  });
});
