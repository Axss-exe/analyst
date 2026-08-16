/**
 * ATIS Story Continuity — Evidence-to-Story Relevance Matcher
 *
 * Scores newly uploaded evidence against all existing active stories
 * and auto-attaches when relevance exceeds threshold.
 */
import { db } from "@/db";
import {
  stories,
  storyEvidence,
  evidence,
  evidenceEntities,
  entities,
  evidencePrograms,
  programs,
  evidenceProblems,
  problems,
  evidenceActors,
  actors,
  evidenceEvents,
  events,
  evidenceOutcomes,
  outcomes,
  facts,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

const RELEVANCE_THRESHOLD = 0.40; // minimum score to attach
const STRONG_MATCH_THRESHOLD = 0.70;

export interface StoryMatch {
  storyId: number;
  score: number;
  relationshipType: string;
  reasons: string[];
}

/**
 * Compute a 0–1 relevance score between a single evidence item and a story.
 * Weights: entities 35%, programs 25%, problems 20%, facts 15%, actors 5%.
 */
export async function scoreEvidenceAgainstStory(
  evidenceId: number,
  storyId: number,
): Promise<{ score: number; reasons: string[] }> {
  const reasons: string[] = [];

  // ── Load story evidence set ──
  const storyLinks = db
    .select({ evidenceId: storyEvidence.evidenceId })
    .from(storyEvidence)
    .where(eq(storyEvidence.storyId, storyId))
    .all();
  const storyEvidenceIds = storyLinks.map((l) => l.evidenceId);
  if (storyEvidenceIds.length === 0) {
    // Story has no evidence yet — we cannot score meaningfully
    return { score: 0, reasons: ["Story has no linked evidence yet"] };
  }

  // ── Entity overlap ──
  const newEntLinks = db
    .select({ entityId: evidenceEntities.entityId })
    .from(evidenceEntities)
    .where(eq(evidenceEntities.evidenceId, evidenceId))
    .all();
  const newEntityIds = newEntLinks.map((e) => e.entityId);

  const storyEntLinks = db
    .select({ entityId: evidenceEntities.entityId })
    .from(evidenceEntities)
    .where(inArray(evidenceEntities.evidenceId, storyEvidenceIds))
    .all();
  const storyEntitySet = new Set(storyEntLinks.map((e) => e.entityId));

  const sharedEntities = newEntityIds.filter((id) => storyEntitySet.has(id));
  const entityScore =
    storyEntitySet.size > 0
      ? sharedEntities.length / Math.max(newEntityIds.length, storyEntitySet.size)
      : 0;
  if (sharedEntities.length > 0) {
    const names = db
      .select({ name: entities.name })
      .from(entities)
      .where(inArray(entities.id, sharedEntities.slice(0, 5)))
      .all();
    reasons.push(`Shares ${sharedEntities.length} entity(s): ${names.map((n) => n.name).join(", ")}`);
  }

  // ── Program overlap ──
  const newProgLinks = db
    .select({ programId: evidencePrograms.programId })
    .from(evidencePrograms)
    .where(eq(evidencePrograms.evidenceId, evidenceId))
    .all();
  const newProgramIds = newProgLinks.map((p) => p.programId);

  const storyProgLinks = db
    .select({ programId: evidencePrograms.programId })
    .from(evidencePrograms)
    .where(inArray(evidencePrograms.evidenceId, storyEvidenceIds))
    .all();
  const storyProgramSet = new Set(storyProgLinks.map((p) => p.programId));

  const sharedPrograms = newProgramIds.filter((id) => storyProgramSet.has(id));
  const programScore =
    storyProgramSet.size > 0
      ? sharedPrograms.length / Math.max(newProgramIds.length, storyProgramSet.size)
      : 0;
  if (sharedPrograms.length > 0) {
    const names = db
      .select({ name: programs.name })
      .from(programs)
      .where(inArray(programs.id, sharedPrograms.slice(0, 5)))
      .all();
    reasons.push(`Shares ${sharedPrograms.length} program(s): ${names.map((n) => n.name).join(", ")}`);
  }

  // ── Problem overlap ──
  const newProbLinks = db
    .select({ problemId: evidenceProblems.problemId })
    .from(evidenceProblems)
    .where(eq(evidenceProblems.evidenceId, evidenceId))
    .all();
  const newProblemIds = newProbLinks.map((p) => p.problemId);

  const storyProbLinks = db
    .select({ problemId: evidenceProblems.problemId })
    .from(evidenceProblems)
    .where(inArray(evidenceProblems.evidenceId, storyEvidenceIds))
    .all();
  const storyProblemSet = new Set(storyProbLinks.map((p) => p.problemId));

  const sharedProblems = newProblemIds.filter((id) => storyProblemSet.has(id));
  const problemScore =
    storyProblemSet.size > 0
      ? sharedProblems.length / Math.max(newProblemIds.length, storyProblemSet.size)
      : 0;
  if (sharedProblems.length > 0) {
    const names = db
      .select({ name: problems.name })
      .from(problems)
      .where(inArray(problems.id, sharedProblems.slice(0, 5)))
      .all();
    reasons.push(`Shares ${sharedProblems.length} problem(s): ${names.map((n) => n.name).join(", ")}`);
  }

  // ── Fact subject overlap ──
  const newFactsRows = db
    .select({ subject: facts.subject })
    .from(facts)
    .where(eq(facts.evidenceId, evidenceId))
    .all();
  const newSubjects = new Set(newFactsRows.map((f) => f.subject.toLowerCase().trim()));

  const storyFactsRows = db
    .select({ subject: facts.subject })
    .from(facts)
    .where(inArray(facts.evidenceId, storyEvidenceIds))
    .all();
  const storySubjects = new Set(storyFactsRows.map((f) => f.subject.toLowerCase().trim()));

  let sharedSubjects = 0;
  for (const subj of newSubjects) {
    if (storySubjects.has(subj)) sharedSubjects++;
  }
  const factScore =
    storySubjects.size > 0
      ? sharedSubjects / Math.max(newSubjects.size, storySubjects.size)
      : 0;
  if (sharedSubjects > 0) {
    reasons.push(`Shares ${sharedSubjects} fact subject(s) with existing evidence`);
  }

  // ── Actor overlap ──
  const newActorLinks = db
    .select({ actorId: evidenceActors.actorId })
    .from(evidenceActors)
    .where(eq(evidenceActors.evidenceId, evidenceId))
    .all();
  const newActorIds = newActorLinks.map((a) => a.actorId);

  const storyActorLinks = db
    .select({ actorId: evidenceActors.actorId })
    .from(evidenceActors)
    .where(inArray(evidenceActors.evidenceId, storyEvidenceIds))
    .all();
  const storyActorSet = new Set(storyActorLinks.map((a) => a.actorId));

  const sharedActors = newActorIds.filter((id) => storyActorSet.has(id));
  const actorScore =
    storyActorSet.size > 0
      ? sharedActors.length / Math.max(newActorIds.length, storyActorSet.size)
      : 0;
  if (sharedActors.length > 0) {
    const names = db
      .select({ name: actors.name })
      .from(actors)
      .where(inArray(actors.id, sharedActors.slice(0, 5)))
      .all();
    reasons.push(`Shares ${sharedActors.length} actor(s): ${names.map((n) => n.name).join(", ")}`);
  }

  // ── Weighted composite ──
  const score =
    entityScore * 0.35 +
    programScore * 0.25 +
    problemScore * 0.20 +
    factScore * 0.15 +
    actorScore * 0.05;

  return {
    score: Math.min(1, Math.round(score * 100) / 100),
    reasons,
  };
}

/**
 * Evaluate a single evidence item against ALL active stories.
 * Auto-attaches when score >= RELEVANCE_THRESHOLD.
 * Returns list of matches for logging / UI feedback.
 */
export async function matchEvidenceToExistingStories(
  evidenceId: number,
): Promise<StoryMatch[]> {
  const allStories = db
    .select()
    .from(stories)
    .where(eq(stories.status, "active"))
    .all();

  const matches: StoryMatch[] = [];

  for (const story of allStories) {
    const { score, reasons } = await scoreEvidenceAgainstStory(evidenceId, story.id);

    if (score >= RELEVANCE_THRESHOLD) {
      // Check for existing link
      const existing = db
        .select()
        .from(storyEvidence)
        .where(
          sql`${storyEvidence.storyId} = ${story.id} AND ${storyEvidence.evidenceId} = ${evidenceId}`,
        )
        .get();

      const relationshipType =
        score >= STRONG_MATCH_THRESHOLD ? "strong_match" : "related";

      if (!existing) {
        db.insert(storyEvidence)
          .values({
            storyId: story.id,
            evidenceId,
            confidence: score,
            relationshipType,
          })
          .run();

        // Bump story updatedAt
        db.update(stories)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(stories.id, story.id))
          .run();

        console.log(
          `[matcher] Attached evidence ${evidenceId} to story ${story.id} "${story.title}" (score: ${score.toFixed(2)})`,
        );
      } else {
        // Update confidence if score improved
        if (score > (existing.confidence ?? 0)) {
          db.update(storyEvidence)
            .set({ confidence: score, relationshipType })
            .where(eq(storyEvidence.id, existing.id))
            .run();
        }
      }

      matches.push({ storyId: story.id, score, relationshipType, reasons });
    }
  }

  return matches;
}
