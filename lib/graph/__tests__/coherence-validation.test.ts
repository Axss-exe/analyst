import { describe, it, expect } from "vitest";
import { computeCoherence } from "../coherence";

describe("Coherence Validation", () => {
  it("strong program identity + consistent problem scores higher than generic entity match", () => {
    const programCluster = [
      { programs: ["ZEFPP"], problems: ["food insecurity"], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 8 },
      { programs: ["ZEFPP"], problems: ["food insecurity"], countries: ["Zimbabwe"], dates: ["2024-03"], factCount: 10 },
      { programs: ["ZEFPP"], problems: ["food insecurity"], countries: ["Zimbabwe"], dates: ["2024-06"], factCount: 7 },
    ];
    const genericCluster = [
      { programs: [], problems: [], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 2 },
      { programs: [], problems: [], countries: ["Zimbabwe"], dates: ["2024-02"], factCount: 3 },
      { programs: [], problems: [], countries: ["Zimbabwe"], dates: ["2024-03"], factCount: 2 },
    ];
    const programScore = computeCoherence(programCluster);
    const genericScore = computeCoherence(genericCluster);
    expect(programScore.overall).toBeGreaterThan(genericScore.overall);
    expect(programScore.dimensions.programIdentity).toBeGreaterThan(genericScore.dimensions.programIdentity);
  });

  it("consistent geography improves coherence", () => {
    const consistentGeo = [
      { programs: ["DRF"], problems: ["climate risk"], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 5 },
      { programs: ["DRF"], problems: ["climate risk"], countries: ["Zimbabwe"], dates: ["2024-02"], factCount: 6 },
    ];
    const scatteredGeo = [
      { programs: ["DRF"], problems: ["climate risk"], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 5 },
      { programs: ["DRF"], problems: ["climate risk"], countries: ["Mozambique"], dates: ["2024-02"], factCount: 6 },
    ];
    const consistentScore = computeCoherence(consistentGeo);
    const scatteredScore = computeCoherence(scatteredGeo);
    expect(consistentScore.dimensions.geographicConsistency).toBeGreaterThan(scatteredScore.dimensions.geographicConsistency);
  });

  it("temporal coherence penalizes widely scattered dates", () => {
    const tightTimeline = [
      { programs: ["PCI"], problems: ["cyclone recovery"], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 5 },
      { programs: ["PCI"], problems: ["cyclone recovery"], countries: ["Zimbabwe"], dates: ["2024-02"], factCount: 5 },
    ];
    const wideTimeline = [
      { programs: ["PCI"], problems: ["cyclone recovery"], countries: ["Zimbabwe"], dates: ["2020-01"], factCount: 5 },
      { programs: ["PCI"], problems: ["cyclone recovery"], countries: ["Zimbabwe"], dates: ["2024-12"], factCount: 5 },
    ];
    const tightScore = computeCoherence(tightTimeline);
    const wideScore = computeCoherence(wideTimeline);
    expect(tightScore.dimensions.temporalCoherence).toBeGreaterThan(wideScore.dimensions.temporalCoherence);
  });

  it("evidence density rewards fact-rich documents", () => {
    const denseDocs = [
      { programs: ["NCI"], problems: ["natural capital"], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 12 },
      { programs: ["NCI"], problems: ["natural capital"], countries: ["Zimbabwe"], dates: ["2024-02"], factCount: 15 },
    ];
    const sparseDocs = [
      { programs: ["NCI"], problems: ["natural capital"], countries: ["Zimbabwe"], dates: ["2024-01"], factCount: 1 },
      { programs: ["NCI"], problems: ["natural capital"], countries: ["Zimbabwe"], dates: ["2024-02"], factCount: 2 },
    ];
    const denseScore = computeCoherence(denseDocs);
    const sparseScore = computeCoherence(sparseDocs);
    expect(denseScore.dimensions.evidenceDensity).toBeGreaterThan(sparseScore.dimensions.evidenceDensity);
  });
});
