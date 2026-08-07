import { describe, it, expect } from "vitest";
import { runStoryPipeline } from "../story-pipeline";
import type { TypedRelationship } from "@/types";

interface GoldenDocument {
  id: number;
  title: string;
  programs: string[];
  policyAreas: string[];
  problems: string[];
  actors: string[];
  countries: string[];
  sectors: string[];
}

const goldenDataset: GoldenDocument[] = [
  { id: 11, title: "ZEFPP Plan", programs: ["ZEFPP", "AEFPF"], policyAreas: ["food security"], problems: ["food insecurity"], actors: ["AfDB", "Gov"], countries: ["Zimbabwe"], sectors: ["agriculture"] },
  { id: 12, title: "ZEFPP Review", programs: ["ZEFPP"], policyAreas: ["food security"], problems: ["food insecurity"], actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["agriculture"] },
  { id: 5, title: "DRF Policy", programs: ["Zimbabwe Disaster Risk Financing"], policyAreas: ["risk financing"], problems: ["climate vulnerability"], actors: ["AfDB", "Gov"], countries: ["Zimbabwe"], sectors: ["finance"] },
  { id: 6, title: "DRF Implementation", programs: ["Zimbabwe Disaster Risk Financing"], policyAreas: ["risk financing"], problems: ["climate vulnerability"], actors: ["AfDB", "Gov"], countries: ["Zimbabwe"], sectors: ["finance"] },
  { id: 7, title: "DRF Assessment", programs: ["Zimbabwe Disaster Risk Financing"], policyAreas: ["risk financing"], problems: ["climate vulnerability"], actors: ["AfDB", "WB"], countries: ["Zimbabwe"], sectors: ["finance"] },
  { id: 14, title: "TAEP Report", programs: ["TAEP"], policyAreas: ["public financial management reform"], problems: ["weak PFM"], actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["governance"] },
  { id: 20, title: "MAPS Assessment", programs: ["MAPS"], policyAreas: ["public financial management reform"], problems: ["weak PFM"], actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["governance"] },
  { id: 3, title: "Regional Financing Gap", programs: [], policyAreas: ["regional financing"], problems: ["financing gap"], actors: ["AfDB"], countries: ["Zimbabwe", "Mozambique", "Zambia"], sectors: ["finance"] },
  { id: 4, title: "Regional Response", programs: ["Regional Development Financing"], policyAreas: ["regional financing"], problems: ["financing gap"], actors: ["AfDB"], countries: ["Southern Africa"], sectors: ["finance"] },
  { id: 8, title: "PCIREP Plan", programs: ["PCIREP"], policyAreas: ["disaster recovery"], problems: ["cyclone damage"], actors: ["AfDB", "Gov"], countries: ["Zimbabwe", "Mozambique"], sectors: ["infrastructure"] },
  { id: 9, title: "PCIREP Progress", programs: ["PCIREP"], policyAreas: ["disaster recovery"], problems: ["cyclone damage"], actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["infrastructure"] },
  { id: 17, title: "Natural Capital Integration", programs: ["NCI"], policyAreas: ["natural capital"], problems: ["environmental degradation"], actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["environment"] },
  { id: 18, title: "Mission 300 Plan", programs: ["Mission 300"], policyAreas: ["energy access"], problems: ["energy poverty"], actors: ["AfDB"], countries: ["Zimbabwe"], sectors: ["energy"] },
  { id: 19, title: "Mission 300 Update", programs: ["Mission 300"], policyAreas: ["energy access"], problems: ["energy poverty"], actors: ["AfDB", "Gov"], countries: ["Zimbabwe"], sectors: ["energy"] },
  { id: 15, title: "ZAVACLEP Plan", programs: ["ZAVACLEP"], policyAreas: ["agricultural productivity"], problems: ["low productivity"], actors: ["AfDB", "Gov"], countries: ["Zimbabwe"], sectors: ["agriculture"] },
  { id: 16, title: "ZAVACLEP Review", programs: ["ZAVACLEP"], policyAreas: ["agricultural productivity"], problems: ["low productivity"], actors: ["AfDB", "FAO"], countries: ["Zimbabwe"], sectors: ["agriculture"] },
];

function toPipelineEvidence(docs: GoldenDocument[]) {
  return docs.map(d => ({
    id: d.id,
    title: d.title,
    programs: d.programs,
    projects: d.policyAreas,
    problems: d.problems,
    outcomes: [],
    actors: d.actors,
    countries: d.countries,
    sectors: d.sectors,
    dates: ["2024-01"],
    factCount: 5,
    internalProgramCount: d.programs.length,
    internalCausalChains: 0,
    internalProblemResponsePairs: d.problems.length > 0 ? 1 : 0,
    evidenceDensity: 0.6,
  }));
}

function buildGoldenRelationships(docs: GoldenDocument[]): TypedRelationship[] {
  const rels: TypedRelationship[] = [];
  const makeRel = (a: number, b: number, type: TypedRelationship["type"], explanation: string): TypedRelationship => ({
    sourceEvidenceId: a, targetEvidenceId: b, type,
    weight: 1.0, confidence: 0.9, explicit: true,
    explanation, sourceEvidence: "golden dataset", inferred: false,
  });

  // ZEFPP cluster
  rels.push(makeRel(11, 12, "same_program", "Both mention ZEFPP"));

  // DRF cluster
  rels.push(makeRel(5, 6, "same_program", "Both mention DRF"));
  rels.push(makeRel(5, 7, "same_program", "Both mention DRF"));
  rels.push(makeRel(6, 7, "same_program", "Both mention DRF"));

  // TAEP-MAPS policy area
  rels.push(makeRel(14, 20, "same_policy_area", "Both concern PFM reform"));

  // PCIREP cluster
  rels.push(makeRel(8, 9, "same_program", "Both mention PCIREP"));

  // Mission 300 cluster
  rels.push(makeRel(18, 19, "same_program", "Both mention Mission 300"));

  // ZAVACLEP cluster
  rels.push(makeRel(15, 16, "same_program", "Both mention ZAVACLEP"));

  // Context relationships (should NOT create stories)
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i], b = docs[j];
      if (a.countries.some(c => b.countries.includes(c))) {
        rels.push(makeRel(a.id, b.id, "same_country", `Both mention ${a.countries.find(c => b.countries.includes(c))}`));
      }
      if (a.actors.some(ac => b.actors.includes(ac))) {
        rels.push(makeRel(a.id, b.id, "same_actor", `Both mention ${a.actors.find(ac => b.actors.includes(ac))}`));
      }
    }
  }

  return rels;
}

describe("Golden Dataset — Zimbabwe 20-Document Conceptual Validation", () => {
  const evidence = toPipelineEvidence(goldenDataset);
  const rels = buildGoldenRelationships(goldenDataset);
  const output = runStoryPipeline(evidence, rels);

  it("produces multiple distinct stories", () => {
    expect(output.stories.length).toBeGreaterThanOrEqual(3);
  });

  it("ZEFPP documents cluster together", () => {
    const zefppStory = output.stories.find(s => s.evidenceIds.includes(11) && s.evidenceIds.includes(12));
    expect(zefppStory).toBeDefined();
  });

  it("Disaster Risk Financing documents cluster together", () => {
    const drfStory = output.stories.find(s => s.evidenceIds.includes(5) && s.evidenceIds.includes(6) && s.evidenceIds.includes(7));
    expect(drfStory).toBeDefined();
  });

  it("TAEP and MAPS connect through policy area", () => {
    const pfmStory = output.stories.find(s => s.evidenceIds.includes(14) && s.evidenceIds.includes(20));
    expect(pfmStory).toBeDefined();
  });

  it("ZEFPP must NOT merge with ZAVACLEP merely through agriculture + Zimbabwe + AfDB", () => {
    const zefppStory = output.stories.find(s => s.evidenceIds.includes(11));
    const zavaclepStory = output.stories.find(s => s.evidenceIds.includes(15));
    expect(zefppStory).toBeDefined();
    expect(zavaclepStory).toBeDefined();
    if (zefppStory && zavaclepStory) {
      const zefppIds = new Set(zefppStory.evidenceIds);
      const zavaclepIds = new Set(zavaclepStory.evidenceIds);
      const overlap = [...zefppIds].filter(id => zavaclepIds.has(id));
      expect(overlap.length).toBe(0);
    }
  });

  it("ZEFPP must NOT merge with Disaster Risk Financing merely through resilience/Zimbabwe/AfDB", () => {
    const zefppStory = output.stories.find(s => s.evidenceIds.includes(11));
    const drfStory = output.stories.find(s => s.evidenceIds.includes(5));
    expect(zefppStory).toBeDefined();
    expect(drfStory).toBeDefined();
    if (zefppStory && drfStory) {
      const zefppIds = new Set(zefppStory.evidenceIds);
      const drfIds = new Set(drfStory.evidenceIds);
      const overlap = [...zefppIds].filter(id => drfIds.has(id));
      expect(overlap.length).toBe(0);
    }
  });
});
