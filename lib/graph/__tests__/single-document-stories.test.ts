import { describe, it, expect } from "vitest";
import { validateSingleDocumentStory } from "../coherence";

describe("Single-Document Stories", () => {
  it("E11 ZEFPP with internal program structure is a valid single-document story", () => {
    const e11 = {
      id: 11,
      internalProgramCount: 2,
      internalCausalChains: 1,
      internalProblemResponsePairs: 1,
      evidenceDensity: 0.8,
    };
    const result = validateSingleDocumentStory(e11);
    expect(result.isValid).toBe(true);
    expect(result.evidenceIds).toContain(11);
    expect(result.coherence).toBeGreaterThan(0.6);
  });

  it("document with no internal structure is NOT a valid single-document story", () => {
    const weakDoc = {
      id: 99,
      internalProgramCount: 0,
      internalCausalChains: 0,
      internalProblemResponsePairs: 0,
      evidenceDensity: 0.2,
    };
    const result = validateSingleDocumentStory(weakDoc);
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toBeDefined();
  });

  it("document with program but low density is NOT valid", () => {
    const thinDoc = {
      id: 100,
      internalProgramCount: 1,
      internalCausalChains: 0,
      internalProblemResponsePairs: 0,
      evidenceDensity: 0.3,
    };
    const result = validateSingleDocumentStory(thinDoc);
    expect(result.isValid).toBe(false);
  });

  it("algorithm must NOT discard isolated nodes without checking internal structure", () => {
    const isolatedButRich = {
      id: 11,
      internalProgramCount: 1,
      internalCausalChains: 1,
      internalProblemResponsePairs: 1,
      evidenceDensity: 0.7,
    };
    const result = validateSingleDocumentStory(isolatedButRich);
    expect(result.isValid).toBe(true);
    expect(result.evidenceIds).toContain(11);
  });
});
