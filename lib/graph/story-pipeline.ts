import type {
  StoryCandidate,
  StoryPipelineOutput,
  StoryGraphEdge,
  TypedRelationship,
} from "@/types";
import type { StoryGraphConfig } from "./story-config";
import { buildStoryGraph } from "./story-graph";
import { detectStorySeeds } from "./story-seeds";
import { expandStory } from "./story-expansion";
import { computeCoherence, validateSingleDocumentStory } from "./coherence";

interface PipelineEvidence {
  id: number;
  title: string;
  programs: string[];
  projects: string[];
  problems: string[];
  outcomes: string[];
  actors: string[];
  countries: string[];
  sectors: string[];
  dates: string[];
  factCount: number;
  internalProgramCount: number;
  internalCausalChains: number;
  internalProblemResponsePairs: number;
  evidenceDensity: number;
}

export function runStoryPipeline(
  evidence: PipelineEvidence[],
  typedRelationships: TypedRelationship[],
  config?: StoryGraphConfig,
): StoryPipelineOutput {
  const cfg = config ?? {
    storyGraphThreshold: 0.5,
    contextCap: 0.45,
    minSeedSize: 2,
    maxExpansionHops: 3,
    minCoherenceForValidation: 0.45,
    singleDocumentMinDensity: 0.5,
    baseScores: {} as Record<TypedRelationship["type"], number>,
  };

  const { storyEdges, contextEdges } = buildStoryGraph(typedRelationships, cfg);
  const seeds = detectStorySeeds(evidence, cfg);

  const candidates: StoryCandidate[] = [];
  const assignedEvidence = new Set<number>();

  for (const seed of seeds) {
    const { expandedIds, usedEdges } = expandStory(seed.evidenceIds, storyEdges, cfg);

    const docs = evidence.filter((e) => expandedIds.includes(e.id));
    const coherence = computeCoherence(
      docs.map((d) => ({
        programs: d.programs,
        problems: d.problems,
        countries: d.countries,
        dates: d.dates,
        factCount: d.factCount,
      })),
    );

    const isValid = coherence.overall >= cfg.minCoherenceForValidation;

    candidates.push({
      evidenceIds: expandedIds,
      coherence,
      isValid,
      rejectionReason: isValid
        ? undefined
        : `Coherence ${coherence.overall.toFixed(3)} below threshold ${cfg.minCoherenceForValidation}`,
      seedType: seed.seedType,
      provenanceEdges: usedEdges,
    });

    for (const id of expandedIds) {
      assignedEvidence.add(id);
    }
  }

  for (const doc of evidence) {
    if (assignedEvidence.has(doc.id)) continue;

    const singleDoc = validateSingleDocumentStory({
      id: doc.id,
      internalProgramCount: doc.internalProgramCount,
      internalCausalChains: doc.internalCausalChains,
      internalProblemResponsePairs: doc.internalProblemResponsePairs,
      evidenceDensity: doc.evidenceDensity,
    });

    if (singleDoc.isValid) {
      candidates.push({
        evidenceIds: [doc.id],
        coherence: {
          overall: singleDoc.coherence,
          dimensions: {
            programIdentity: doc.internalProgramCount > 0 ? 0.7 : 0,
            problemConsistency: doc.internalProblemResponsePairs > 0 ? 0.6 : 0,
            geographicConsistency: 0.5,
            temporalCoherence: 0.5,
            evidenceDensity: doc.evidenceDensity,
          },
          explanation: `Single-document story with internal structure`,
        },
        isValid: true,
        seedType: "program_cluster",
        provenanceEdges: [],
      });
      assignedEvidence.add(doc.id);
    }
  }

  const unassignedEvidence = evidence
    .map((e) => e.id)
    .filter((id) => !assignedEvidence.has(id));

  return {
    stories: candidates,
    contextGraph: contextEdges,
    unassignedEvidence,
  };
}
