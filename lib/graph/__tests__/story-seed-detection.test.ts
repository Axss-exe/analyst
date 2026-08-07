import { describe, it, expect } from "vitest";
import { detectStorySeeds } from "../story-seeds";

interface EvidenceDocument {
  id: number;
  title: string;
  programs: string[];
  projects: string[];
  problems: string[];
  outcomes: string[];
  actors: string[];
  countries: string[];
  sectors: string[];
}

describe("Story Seed Detection", () => {
  const e05: EvidenceDocument = {
    id: 5, title: "Disaster Risk Financing 1",
    programs: ["Zimbabwe Disaster Risk Financing Programme"],
    projects: [], problems: ["climate vulnerability"], outcomes: [],
    actors: ["AfDB", "Zimbabwe Government"], countries: ["Zimbabwe"], sectors: ["finance"],
  };
  const e06: EvidenceDocument = {
    id: 6, title: "Disaster Risk Financing 2",
    programs: ["Zimbabwe Disaster Risk Financing Programme"],
    projects: [], problems: [], outcomes: ["risk reduction"],
    actors: ["AfDB", "Zimbabwe Government"], countries: ["Zimbabwe"], sectors: ["finance"],
  };
  const e07: EvidenceDocument = {
    id: 7, title: "Disaster Risk Financing 3",
    programs: ["Zimbabwe Disaster Risk Financing Programme"],
    projects: [], problems: [], outcomes: ["insurance coverage"],
    actors: ["AfDB", "World Bank"], countries: ["Zimbabwe"], sectors: ["finance"],
  };
  const e15: EvidenceDocument = {
    id: 15, title: "ZAVACLEP 1",
    programs: ["ZAVACLEP"],
    projects: [], problems: ["agricultural productivity"], outcomes: [],
    actors: ["AfDB", "Zimbabwe Government"], countries: ["Zimbabwe"], sectors: ["agriculture"],
  };
  const e16: EvidenceDocument = {
    id: 16, title: "ZAVACLEP 2",
    programs: ["ZAVACLEP"],
    projects: [], problems: [], outcomes: ["crop yields"],
    actors: ["AfDB", "FAO"], countries: ["Zimbabwe"], sectors: ["agriculture"],
  };
  const e11: EvidenceDocument = {
    id: 11, title: "ZEFPP Standalone",
    programs: ["ZEFPP", "AEFPF"],
    projects: [], problems: ["food insecurity"], outcomes: ["emergency production"],
    actors: ["AfDB", "Zimbabwe Government"], countries: ["Zimbabwe"], sectors: ["agriculture"],
  };

  it("E05 + E06 + E07 should form a strong program cluster seed", () => {
    const seeds = detectStorySeeds([e05, e06, e07]);
    const programSeeds = seeds.filter(s => s.seedType === "program_cluster");
    expect(programSeeds.length).toBeGreaterThanOrEqual(1);
    const drfSeed = programSeeds.find(s => s.explanation.includes("disaster risk financing"));
    expect(drfSeed).toBeDefined();
    expect(drfSeed!.evidenceIds).toContain(5);
    expect(drfSeed!.evidenceIds).toContain(6);
    expect(drfSeed!.evidenceIds).toContain(7);
    expect(drfSeed!.strength).toBeGreaterThan(0.80);
  });

  it("E15 + E16 should form a strong program cluster seed", () => {
    const seeds = detectStorySeeds([e15, e16]);
    const programSeeds = seeds.filter(s => s.seedType === "program_cluster");
    expect(programSeeds.length).toBeGreaterThanOrEqual(1);
    const zavaclepSeed = programSeeds.find(s => s.explanation.includes("zavaclep"));
    expect(zavaclepSeed).toBeDefined();
    expect(zavaclepSeed!.evidenceIds).toContain(15);
    expect(zavaclepSeed!.evidenceIds).toContain(16);
  });

  it("should NOT merge ZEFPP with ZAVACLEP merely because both are agriculture", () => {
    const seeds = detectStorySeeds([e11, e15, e16]);
    const zefppSeed = seeds.find(s => s.explanation.toLowerCase().includes("zefpp"));
    const zavaclepSeed = seeds.find(s => s.explanation.toLowerCase().includes("zavaclep"));
    expect(zefppSeed).toBeDefined();
    expect(zavaclepSeed).toBeDefined();
    expect(zefppSeed!.evidenceIds).not.toEqual(zavaclepSeed!.evidenceIds);
  });

  it("should NOT merge Disaster Risk Financing with ZEFPP merely because both share Zimbabwe and AfDB", () => {
    const seeds = detectStorySeeds([e05, e06, e11]);
    const drfSeed = seeds.find(s => s.explanation.toLowerCase().includes("disaster risk financing"));
    const zefppSeed = seeds.find(s => s.explanation.toLowerCase().includes("zefpp"));
    expect(drfSeed).toBeDefined();
    expect(zefppSeed).toBeDefined();
    const drfIds = new Set(drfSeed!.evidenceIds);
    const zefppIds = new Set(zefppSeed!.evidenceIds);
    const overlap = [...drfIds].filter(id => zefppIds.has(id));
    expect(overlap.length).toBe(0);
  });
});
