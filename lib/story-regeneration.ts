import { db } from "@/db";
import {
  actors,
  entities,
  evidence,
  evidenceActors,
  evidenceEntities,
  evidenceEvents,
  evidenceOutcomes,
  evidenceProblems,
  evidencePrograms,
  evidenceStoryAssessment,
  events,
  facts,
  outcomes,
  problems,
  programs,
  relationships,
  stories,
  storyEvidence,
  timelineEvents,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { regenerateStoryFromEvidence, type StoryRegenerationEvidence } from "@/lib/ai/stories";

export interface RegeneratedStory {
  id: number;
  title: string;
  overview: string;
  confidence: number;
  evidenceCount: number;
  updatedAt: string;
}

const activeRegenerations = new Map<number, Promise<RegeneratedStory>>();

export function regenerateExistingStory(storyId: number): Promise<RegeneratedStory> {
  const active = activeRegenerations.get(storyId);
  if (active) return active;

  const operation = regenerateExistingStoryInternal(storyId);
  activeRegenerations.set(storyId, operation);
  void operation.then(
    () => {
      if (activeRegenerations.get(storyId) === operation) activeRegenerations.delete(storyId);
    },
    () => {
      if (activeRegenerations.get(storyId) === operation) activeRegenerations.delete(storyId);
    },
  );
  return operation;
}

async function regenerateExistingStoryInternal(storyId: number): Promise<RegeneratedStory> {
  const story = db.select().from(stories).where(eq(stories.id, storyId)).get();
  if (!story) throw new Error("Story not found");

  const links = db
    .select({ evidenceId: storyEvidence.evidenceId })
    .from(storyEvidence)
    .where(eq(storyEvidence.storyId, storyId))
    .all();
  const evidenceIds = links.map((link) => link.evidenceId);
  if (evidenceIds.length === 0) {
    throw new Error("Cannot re-evaluate a story with no attached evidence");
  }

  const evidenceRows = db.select().from(evidence).where(inArray(evidence.id, evidenceIds)).all();
  if (evidenceRows.length !== evidenceIds.length) {
    throw new Error("One or more attached evidence records could not be loaded");
  }

  const factRows = db.select().from(facts).where(inArray(facts.evidenceId, evidenceIds)).all();
  const entityRows = db
    .select({ evidenceId: evidenceEntities.evidenceId, name: entities.name, type: entities.type })
    .from(evidenceEntities)
    .innerJoin(entities, eq(evidenceEntities.entityId, entities.id))
    .where(inArray(evidenceEntities.evidenceId, evidenceIds))
    .all();
  const timelineRows = db.select().from(timelineEvents).where(inArray(timelineEvents.evidenceId, evidenceIds)).all();
  const assessmentRows = db
    .select()
    .from(evidenceStoryAssessment)
    .where(inArray(evidenceStoryAssessment.evidenceId, evidenceIds))
    .all();
  const programRows = db
    .select({ evidenceId: evidencePrograms.evidenceId, name: programs.name, description: programs.description })
    .from(evidencePrograms)
    .innerJoin(programs, eq(evidencePrograms.programId, programs.id))
    .where(inArray(evidencePrograms.evidenceId, evidenceIds))
    .all();
  const eventRows = db
    .select({ evidenceId: evidenceEvents.evidenceId, name: events.name, description: events.description, temporalInfo: events.temporalInfo })
    .from(evidenceEvents)
    .innerJoin(events, eq(evidenceEvents.eventId, events.id))
    .where(inArray(evidenceEvents.evidenceId, evidenceIds))
    .all();
  const problemRows = db
    .select({ evidenceId: evidenceProblems.evidenceId, name: problems.name, description: problems.description, severity: problems.severity })
    .from(evidenceProblems)
    .innerJoin(problems, eq(evidenceProblems.problemId, problems.id))
    .where(inArray(evidenceProblems.evidenceId, evidenceIds))
    .all();
  const outcomeRows = db
    .select({ evidenceId: evidenceOutcomes.evidenceId, name: outcomes.name, description: outcomes.description, metric: outcomes.metric })
    .from(evidenceOutcomes)
    .innerJoin(outcomes, eq(evidenceOutcomes.outcomeId, outcomes.id))
    .where(inArray(evidenceOutcomes.evidenceId, evidenceIds))
    .all();
  const actorRows = db
    .select({ evidenceId: evidenceActors.evidenceId, name: actors.name, actorType: actors.actorType })
    .from(evidenceActors)
    .innerJoin(actors, eq(evidenceActors.actorId, actors.id))
    .where(inArray(evidenceActors.evidenceId, evidenceIds))
    .all();

  const relationshipRows = db.select().from(relationships).all().filter((relationship) => {
    try {
      const ids = JSON.parse(relationship.evidenceIds || "[]");
      return Array.isArray(ids) && ids.some((id) => evidenceIds.includes(Number(id)));
    } catch {
      return false;
    }
  });

  const items: StoryRegenerationEvidence[] = evidenceIds.map((evidenceId) => {
    const item = evidenceRows.find((row) => row.id === evidenceId)!;
    const assessment = assessmentRows.find((row) => row.evidenceId === evidenceId);
    return {
      id: item.id,
      title: item.title,
      source: item.source,
      content: item.content || "",
      summary: item.summary || "",
      facts: factRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        confidence: row.confidence,
      })),
      entities: entityRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({ name: row.name, type: row.type })),
      relationships: relationshipRows.filter((row) => {
        try {
          const ids = JSON.parse(row.evidenceIds || "[]");
          return Array.isArray(ids) && ids.some((id) => Number(id) === evidenceId);
        } catch {
          return false;
        }
      }).map((row) => ({
          source: String(row.sourceId),
          target: String(row.targetId),
          type: row.type,
          confidence: row.confidence,
        })),
      timelineEvents: timelineRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({
        date: row.date,
        title: row.title,
        description: row.description,
      })),
      events: eventRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({
        name: row.name,
        description: row.description,
        temporalInfo: row.temporalInfo,
      })),
      programs: programRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({ name: row.name, description: row.description })),
      problems: problemRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({ name: row.name, description: row.description, severity: row.severity })),
      outcomes: outcomeRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({ name: row.name, description: row.description, metric: row.metric })),
      actors: actorRows.filter((row) => row.evidenceId === evidenceId).map((row) => ({ name: row.name, actorType: row.actorType })),
      assessment: assessment ? {
        hasProblem: assessment.hasProblem,
        hasIntervention: assessment.hasIntervention,
        hasOutcome: assessment.hasOutcome,
        hasProgram: assessment.hasProgram,
        hasEvent: assessment.hasEvent,
        narrativeCompletenessScore: assessment.narrativeCompletenessScore,
        assessmentReason: assessment.assessmentReason,
      } : null,
    };
  });

  const proposal = await regenerateStoryFromEvidence(story.title, story.overview, items);
  const updatedAt = new Date().toISOString();
  db.update(stories)
    .set({
      title: proposal.title,
      overview: proposal.overview,
      confidence: proposal.confidence,
      updatedAt,
    })
    .where(eq(stories.id, storyId))
    .run();

  return {
    id: storyId,
    title: proposal.title,
    overview: proposal.overview,
    confidence: proposal.confidence,
    evidenceCount: evidenceIds.length,
    updatedAt,
  };
}