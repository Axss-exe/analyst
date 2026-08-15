/**
 * ATIS v4 — Story Discovery Orchestrator
 * 
 * Coordinates the full v4 pipeline:
 * 
 *   Evidence + Intelligence Nodes
 *     → Relationship Generation (algorithmic)
 *     → Relationship Scoring
 *     → Graph Layering (Context + Story)
 *     → Story Clustering (seeds + expansion + single-doc)
 *     → Coherence Validation
 *     → Story Candidates
 * 
 * This module is called by the worker (lib/worker.ts) after
 * extraction is complete. The core pipeline is pure logic;
 * database persistence is handled at the boundary.
 */

import { db } from "@/db";
import {
  storyRelationships,
  storyCandidates,
  storyCandidateEvidence,
  graphClusters,
} from "@/db/schema";
import {
  type StoryBearingRelationship,
  type StoryCandidate,
  type StoryGraphConfig,
  type StructuredIntelligence,
  buildStoryGraphConfig,
} from "@/lib/graph/story-types";
import {
  type EvidenceQualityProfile,
  type AggregatedEdge,
} from "@/lib/graph/scoring";
import {
  type EvidenceContext,
  type GraphBuildResult,
  buildGraphLayers,
} from "@/lib/graph/story-edges";
import {
  type EvidenceIntelligence,
  runStoryClustering,
} from "@/lib/graph/story-cluster";
import {
  validateStoryCandidates,
  buildStoryDiagnosticView,
} from "@/lib/graph/story-coherence";
import {
  generateInferredRelationships,
  type EvidenceWithIntelligence,
} from "@/lib/ai/relationship-extraction";

// ═════════════════════════════════════════════════════════════════
// 1. PIPELINE INPUT / OUTPUT
// ═════════════════════════════════════════════════════════════════

export interface StoryDiscoveryInput {
  evidenceIds: number[];
  intelligenceMap: Map<number, EvidenceIntelligence>;
  singleDocAssessments: Map<number, {
    canBeSingleDocumentStory: boolean;
    narrativeCompletenessScore: number;
    assessmentReason: string;
  }>;
  qualityProfiles: Map<number, EvidenceQualityProfile>;
  evidenceContexts: Map<number, EvidenceContext>;
  config?: Partial<StoryGraphConfig>;
}

export interface StoryDiscoveryOutput {
  contextGraph: GraphBuildResult["contextGraph"];
  storyGraph: GraphBuildResult["storyGraph"];
  edgeExplanations: GraphBuildResult["edgeExplanations"];
  allEdges: AggregatedEdge[];
  storyEdges: AggregatedEdge[];
  candidates: StoryCandidate[];
  singleDocumentStories: StoryCandidate[];
  validatedStories: StoryCandidate[];
  rejectedCandidates: StoryCandidate[];
  unclusteredEvidence: number[];
  diagnostics: {
    totalRelationshipsEvaluated: number;
    storyGraphEdges: number;
    contextGraphEdges: number;
    seedsFound: number;
    expansionsPerformed: number;
    coherenceChecks: number;
    pipelineDurationMs: number;
  };
  stats: GraphBuildResult["stats"] & {
    seedsDetected: number;
    candidatesFormed: number;
    singleDocumentStories: number;
    validatedStories: number;
    rejectedCandidates: number;
  };
}

// ═════════════════════════════════════════════════════════════════
// 2. CORE PIPELINE (pure logic)
// ═════════════════════════════════════════════════════════════════

export function runStoryDiscoveryPipeline(
  input: StoryDiscoveryInput
): StoryDiscoveryOutput {
  const startTime = Date.now();
  const config = { ...buildStoryGraphConfig(), ...input.config };

  // Stage 1: Generate relationships (algorithmic, O(n²))
  const allRelationships: StoryBearingRelationship[] = [];
  const evidenceIds = input.evidenceIds;

  for (let i = 0; i < evidenceIds.length; i++) {
    const aId = evidenceIds[i];
    const aIntel = input.intelligenceMap.get(aId);
    if (!aIntel) continue;

    for (let j = i + 1; j < evidenceIds.length; j++) {
      const bId = evidenceIds[j];
      const bIntel = input.intelligenceMap.get(bId);
      if (!bIntel) continue;

      const rels = generateInferredRelationships(
        evidenceIntelligenceToInput(aIntel),
        evidenceIntelligenceToInput(bIntel)
      );
      allRelationships.push(...rels);
    }
  }

  // Stage 2: Build graph layers
  const graphResult = buildGraphLayers(
    allRelationships,
    input.evidenceContexts,
    input.qualityProfiles,
    evidenceIds,
    config
  );

  // Stage 3: Story clustering
  const clusteringResult = runStoryClustering(
    graphResult.storyGraph,
    graphResult.allEdges,
    input.intelligenceMap,
    input.singleDocAssessments,
    evidenceIds,
    config
  );

  // Stage 4: Coherence validation
  const validationResults = validateStoryCandidates(
    clusteringResult.candidates,
    graphResult.allEdges,
    input.intelligenceMap,
    config
  );

  const validatedStories = validationResults
    .filter((r) => r.action === "promote")
    .map((r) => ({ ...r.candidate, status: "validated" as const }));

  const rejectedCandidates = validationResults
    .filter((r) => r.action === "reject")
    .map((r) => ({ ...r.candidate, status: "rejected" as const }));

  const keptCandidates = validationResults
    .filter((r) => r.action === "keep")
    .map((r) => r.candidate);

  const finalCandidates = [...validatedStories, ...keptCandidates];
  const duration = Date.now() - startTime;

  return {
    contextGraph: graphResult.contextGraph,
    storyGraph: graphResult.storyGraph,
    edgeExplanations: graphResult.edgeExplanations,
    allEdges: graphResult.allEdges,
    storyEdges: graphResult.storyEdges,
    candidates: finalCandidates,
    singleDocumentStories: clusteringResult.singleDocumentStories,
    validatedStories,
    rejectedCandidates,
    unclusteredEvidence: clusteringResult.unclusteredEvidence,
    diagnostics: {
      totalRelationshipsEvaluated: allRelationships.length,
      storyGraphEdges: graphResult.storyGraph.edges.length,
      contextGraphEdges: graphResult.contextGraph.edges.length,
      seedsFound: clusteringResult.stats.seedsDetected,
      expansionsPerformed: finalCandidates.reduce((sum, c) => sum + c.contextEvidenceIds.length, 0),
      coherenceChecks: validationResults.length,
      pipelineDurationMs: duration,
    },
    stats: {
      ...graphResult.stats,
      seedsDetected: clusteringResult.stats.seedsDetected,
      candidatesFormed: clusteringResult.stats.candidatesFormed,
      singleDocumentStories: clusteringResult.stats.singleDocumentStories,
      validatedStories: validatedStories.length,
      rejectedCandidates: rejectedCandidates.length,
    },
  };
}

// ═════════════════════════════════════════════════════════════════
// 3. DATABASE PERSISTENCE
// ═════════════════════════════════════════════════════════════════

export async function persistStoryDiscovery(
  output: StoryDiscoveryOutput
): Promise<void> {
  await persistStoryRelationships(output.allEdges);
  await persistStoryCandidates(output.candidates, output.rejectedCandidates);
  await persistGraphClusters(output);
}

async function persistStoryRelationships(edges: AggregatedEdge[]): Promise<void> {
  let created = 0;
  let skipped = 0;
  try {
    for (const edge of edges) {
      for (const rel of edge.contributingRelationships) {
        try {
          await db.insert(storyRelationships).values({
            sourceEvidenceId: rel.sourceEvidenceId,
            targetEvidenceId: rel.targetEvidenceId,
            relationshipType: rel.type,
            weight: rel.finalWeight ?? rel.weight,
            confidence: rel.confidence,
            explicit: rel.explicit,
            reason: rel.reason,
          }).onConflictDoNothing();
          created++;
        } catch (innerErr: any) {
          if (innerErr.message?.includes("UNIQUE constraint failed")) {
            skipped++;
          } else {
            console.error(`[story-discovery] Failed to persist relationship ${rel.sourceEvidenceId}-${rel.targetEvidenceId}:`, innerErr);
          }
        }
      }
    }
    console.log(`[story-discovery] Persisted ${created} story relationships (${skipped} duplicates skipped)`);
  } catch (err) {
    console.error("[story-discovery] Failed to persist story relationships:", err);
  }
}

async function persistStoryCandidates(
  candidates: StoryCandidate[],
  rejected: StoryCandidate[]
): Promise<void> {
  try {
    const allExisting = db.select().from(storyCandidates).all() as any[];
    const existingSignatures = new Map<string, number>();
    for (const ec of allExisting) {
      try {
        const ids: number[] = JSON.parse(ec.evidenceIds || "[]");
        const sig = ids.sort((a: number, b: number) => a - b).join(",");
        existingSignatures.set(sig, ec.id);
      } catch { /* ignore */ }
    }

    for (const candidate of [...candidates, ...rejected]) {
      const sig = [...candidate.evidenceIds].sort((a, b) => a - b).join(",");
      let candidateId = existingSignatures.get(sig);

      if (candidateId) {
        console.log(`[story-discovery] Reusing existing candidate ${candidateId} for signature [${sig}]`);
      } else {
        const result = db.insert(storyCandidates).values({
          name: candidate.name,
          description: candidate.description,
          evidenceIds: JSON.stringify(candidate.evidenceIds),
          seedType: (candidate as any).seedType || "program_cluster",
          coherenceScore: candidate.coherenceScore,
          confidence: candidate.confidence,
          dominantProgramId: candidate.dominantProgram?.id ?? null,
          dominantProblemId: candidate.dominantProblem?.id ?? null,
          dominantTheme: candidate.dominantTheme,
          causalChain: JSON.stringify(candidate.causalChain),
          reasons: JSON.stringify(candidate.reasons),
          status: candidate.status,
          relationshipCounts: JSON.stringify(candidate.relationshipCounts),
          diagnostics: JSON.stringify(candidate.diagnostics),
          isValid: candidate.status === "validated" || candidate.status === "promoted" || candidate.status === "story",
          provenanceEdges: JSON.stringify((candidate as any).provenanceEdges || []),
        }).run();

        candidateId = Number(result.lastInsertRowid);
        if (!candidateId || candidateId === 0) continue;
        existingSignatures.set(sig, candidateId);
        console.log(`[story-discovery] Created candidate ${candidateId}: "${candidate.name}" (${candidate.evidenceIds.length} evidence)`);
      }

      // Seed evidence
      for (const eid of candidate.seedEvidenceIds) {
        await db.insert(storyCandidateEvidence).values({
          storyCandidateId: candidateId,
          evidenceId: eid,
          role: "seed",
          attachmentReason: "Seed evidence",
        }).onConflictDoNothing();
      }

      // Context evidence
      for (const eid of candidate.contextEvidenceIds) {
        await db.insert(storyCandidateEvidence).values({
          storyCandidateId: candidateId,
          evidenceId: eid,
          role: "context",
          attachmentReason: "Expanded via medium-weight relationship",
        }).onConflictDoNothing();
      }

      // Regular members
      const memberIds = candidate.evidenceIds.filter(
        (eid) => !candidate.seedEvidenceIds.includes(eid) && !candidate.contextEvidenceIds.includes(eid)
      );
      for (const eid of memberIds) {
        await db.insert(storyCandidateEvidence).values({
          storyCandidateId: candidateId,
          evidenceId: eid,
          role: "member",
          attachmentReason: "Story member",
        }).onConflictDoNothing();
      }
    }
  } catch (err) {
    console.error("[worker] Failed to persist story candidates:", err);
  }
}

async function persistGraphClusters(output: StoryDiscoveryOutput): Promise<void> {
  try {
    const allExisting = db.select().from(graphClusters).all() as any[];
    const existingSignatures = new Set<string>();
    for (const ec of allExisting) {
      try {
        const ids: number[] = JSON.parse(ec.evidenceIds || "[]");
        existingSignatures.add(ids.sort((a: number, b: number) => a - b).join(","));
      } catch { /* ignore */ }
    }

    for (const candidate of output.candidates) {
      const sig = [...candidate.evidenceIds].sort((a, b) => a - b).join(",");
      if (existingSignatures.has(sig)) {
        console.log(`[story-discovery] Skipping duplicate graph cluster for signature [${sig}]`);
        continue;
      }

      await db.insert(graphClusters).values({
        name: candidate.name,
        description: candidate.description,
        density: candidate.coherenceScore,
        status: candidate.status === "validated" ? "stable" : "new",
        evidenceCount: candidate.evidenceIds.length,
        entityCount: 0,
        evidenceIds: JSON.stringify(candidate.evidenceIds),
      }).run();
      existingSignatures.add(sig);
      console.log(`[story-discovery] Created graph cluster for "${candidate.name}" (${candidate.evidenceIds.length} evidence)`);
    }
  } catch (err) {
    console.error("[story-discovery] Failed to persist graph clusters:", err);
  }
}

// ═════════════════════════════════════════════════════════════════
// 4. HELPER
// ═════════════════════════════════════════════════════════════════

function evidenceIntelligenceToInput(intel: EvidenceIntelligence): EvidenceWithIntelligence {
  return {
    evidenceId: intel.evidenceId,
    title: "",
    text: intel.text,
    programs: intel.programs,
    events: intel.events,
    problems: intel.problems,
    outcomes: intel.outcomes,
    actors: intel.actors,
    facts: [],
    entities: [],
    hasProgramReference: intel.programs.length > 0,
    isGenericInstitutionalPage: false,
  };
}
