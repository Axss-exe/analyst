import type { StorySeed, TypedRelationship } from "@/types";
import type { StoryGraphConfig } from "./story-config";

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

export function detectStorySeeds(
  docs: EvidenceDocument[],
  config?: StoryGraphConfig,
): StorySeed[] {
  const cfg = config ?? { minSeedSize: 2 } as StoryGraphConfig;
  const seeds: StorySeed[] = [];

  // 1. Program cluster seeds: 2+ docs sharing a program name
  const programToDocs: Map<string, number[]> = new Map();
  for (const doc of docs) {
    for (const program of doc.programs) {
      const normalized = program.toLowerCase().trim();
      const list = programToDocs.get(normalized) || [];
      list.push(doc.id);
      programToDocs.set(normalized, list);
    }
  }

  for (const [program, ids] of programToDocs) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length >= cfg.minSeedSize) {
      seeds.push({
        evidenceIds: uniqueIds,
        seedType: "program_cluster",
        strength: Math.min(1.0, 0.7 + (uniqueIds.length - cfg.minSeedSize) * 0.1),
        explanation: `Documents share program: ${program}`,
      });
    }
  }

  // 2. Problem-response seeds: doc with problem + doc addressing it
  const problemDocs = docs.filter((d) => d.problems.length > 0);
  const responseDocs = docs.filter(
    (d) => d.outcomes.length > 0 || d.programs.length > 0,
  );

  const seenProblemResponsePairs = new Set<string>();

  for (const pd of problemDocs) {
    for (const rd of responseDocs) {
      if (pd.id === rd.id) continue;
      const pairKey = [pd.id, rd.id].sort().join(":");
      if (seenProblemResponsePairs.has(pairKey)) continue;
      seenProblemResponsePairs.add(pairKey);

      const sharedActors = pd.actors.filter((a) => rd.actors.includes(a));
      const sharedCountries = pd.countries.filter((c) => rd.countries.includes(c));
      if (sharedActors.length > 0 && sharedCountries.length > 0) {
        seeds.push({
          evidenceIds: [pd.id, rd.id],
          seedType: "problem_response",
          strength: 0.60,
          explanation:
            `Problem document ${pd.id} and response document ${rd.id} ` +
            `share actors (${sharedActors.join(", ")}) and geography (${sharedCountries.join(", ")})`,
        });
      }
    }
  }

  // 3. Policy area seeds: 2+ docs sharing policy area but different programs
  const policyToDocs: Map<string, Array<{ id: number; program: string }>> = new Map();
  for (const doc of docs) {
    // Use sectors as proxy for policy area if not explicitly provided
    const areas = doc.projects.length > 0 ? doc.projects : doc.sectors;
    for (const area of areas) {
      const normalized = area.toLowerCase().trim();
      const list = policyToDocs.get(normalized) || [];
      list.push({ id: doc.id, program: doc.programs[0] || "" });
      policyToDocs.set(normalized, list);
    }
  }

  for (const [area, entries] of policyToDocs) {
    const uniquePrograms = new Set(entries.map((e) => e.program));
    if (uniquePrograms.size >= 2) {
      const uniqueIds = [...new Set(entries.map((e) => e.id))];
      if (uniqueIds.length >= cfg.minSeedSize) {
        seeds.push({
          evidenceIds: uniqueIds,
          seedType: "policy_area",
          strength: 0.55,
          explanation: `Documents share policy area "${area}" across ${uniquePrograms.size} different programs`,
        });
      }
    }
  }

  return seeds;
}
