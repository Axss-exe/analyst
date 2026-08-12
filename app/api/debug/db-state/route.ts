import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidence,
  facts,
  entities,
  evidenceEntities,
  programs,
  events,
  problems,
  outcomes,
  actors,
  evidencePrograms,
  evidenceEvents,
  evidenceProblems,
  evidenceOutcomes,
  evidenceActors,
  evidenceStoryAssessment,
  storyRelationships,
  storyCandidates,
  storyCandidateEvidence,
  narratives,
} from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    // ── Count all key tables ─────────────────────────────────
    const evidenceCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidence).get() as any)?.count || 0;
    const factCount = (db.select({ count: sql<number>`COUNT(*)` }).from(facts).get() as any)?.count || 0;
    const entityCount = (db.select({ count: sql<number>`COUNT(*)` }).from(entities).get() as any)?.count || 0;
    const programCount = (db.select({ count: sql<number>`COUNT(*)` }).from(programs).get() as any)?.count || 0;
    const eventCount = (db.select({ count: sql<number>`COUNT(*)` }).from(events).get() as any)?.count || 0;
    const problemCount = (db.select({ count: sql<number>`COUNT(*)` }).from(problems).get() as any)?.count || 0;
    const outcomeCount = (db.select({ count: sql<number>`COUNT(*)` }).from(outcomes).get() as any)?.count || 0;
    const actorCount = (db.select({ count: sql<number>`COUNT(*)` }).from(actors).get() as any)?.count || 0;
    const relCount = (db.select({ count: sql<number>`COUNT(*)` }).from(storyRelationships).get() as any)?.count || 0;
    const candidateCount = (db.select({ count: sql<number>`COUNT(*)` }).from(storyCandidates).get() as any)?.count || 0;
    const narrativeCount = (db.select({ count: sql<number>`COUNT(*)` }).from(narratives).get() as any)?.count || 0;
    const assessmentCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidenceStoryAssessment).get() as any)?.count || 0;

    // ── Evidence-to-intelligence link counts ────────────────
    const evProgCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidencePrograms).get() as any)?.count || 0;
    const evEventCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidenceEvents).get() as any)?.count || 0;
    const evProblemCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidenceProblems).get() as any)?.count || 0;
    const evOutcomeCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidenceOutcomes).get() as any)?.count || 0;
    const evActorCount = (db.select({ count: sql<number>`COUNT(*)` }).from(evidenceActors).get() as any)?.count || 0;

    // ── Sample evidence with intelligence ────────────────────
    const sampleEvidence = db.select({
      id: evidence.id,
      title: evidence.title,
    }).from(evidence).limit(5).all();

    const sampleWithIntel = (sampleEvidence as any[]).map((ev) => {
      const progLinks = db.select({ programId: evidencePrograms.programId })
        .from(evidencePrograms).where(sql`${evidencePrograms.evidenceId} = ${ev.id}`).all();
      const probLinks = db.select({ problemId: evidenceProblems.problemId })
        .from(evidenceProblems).where(sql`${evidenceProblems.evidenceId} = ${ev.id}`).all();
      const outLinks = db.select({ outcomeId: evidenceOutcomes.outcomeId })
        .from(evidenceOutcomes).where(sql`${evidenceOutcomes.evidenceId} = ${ev.id}`).all();
      const evtLinks = db.select({ eventId: evidenceEvents.eventId })
        .from(evidenceEvents).where(sql`${evidenceEvents.evidenceId} = ${ev.id}`).all();
      const actLinks = db.select({ actorId: evidenceActors.actorId })
        .from(evidenceActors).where(sql`${evidenceActors.evidenceId} = ${ev.id}`).all();
      const entLinks = db.select({ entityId: evidenceEntities.entityId })
        .from(evidenceEntities).where(sql`${evidenceEntities.evidenceId} = ${ev.id}`).all();
      const assessment = db.select()
        .from(evidenceStoryAssessment)
        .where(sql`${evidenceStoryAssessment.evidenceId} = ${ev.id}`)
        .get();

      return {
        id: ev.id,
        title: ev.title,
        programs: (progLinks as any[]).length,
        problems: (probLinks as any[]).length,
        outcomes: (outLinks as any[]).length,
        events: (evtLinks as any[]).length,
        actors: (actLinks as any[]).length,
        entities: (entLinks as any[]).length,
        hasAssessment: !!assessment,
        canBeSingleDoc: (assessment as any)?.canBeSingleDocumentStory ?? false,
        narrativeScore: (assessment as any)?.narrativeCompletenessScore ?? 0,
      };
    });

    // ── Story candidate details ──────────────────────────────
    const candidateDetails = db.select({
      id: storyCandidates.id,
      name: storyCandidates.name,
      status: storyCandidates.status,
      coherenceScore: storyCandidates.coherenceScore,
      confidence: storyCandidates.confidence,
    }).from(storyCandidates).limit(10).all();

    const candidateEvidenceCounts = (candidateDetails as any[]).map((c) => {
      const evCount = (db.select({ count: sql<number>`COUNT(*)` })
        .from(storyCandidateEvidence)
        .where(sql`${storyCandidateEvidence.storyCandidateId} = ${c.id}`)
        .get() as any)?.count || 0;
      return { ...c, evidenceCount: evCount };
    });

    // ── Story relationship sample ────────────────────────────
    const relSample = db.select({
      sourceEvidenceId: storyRelationships.sourceEvidenceId,
      targetEvidenceId: storyRelationships.targetEvidenceId,
      relationshipType: storyRelationships.relationshipType,
      weight: storyRelationships.weight,
    }).from(storyRelationships).limit(10).all();

    return NextResponse.json({
      counts: {
        evidence: evidenceCount,
        facts: factCount,
        entities: entityCount,
        programs: programCount,
        events: eventCount,
        problems: problemCount,
        outcomes: outcomeCount,
        actors: actorCount,
        storyRelationships: relCount,
        storyCandidates: candidateCount,
        narratives: narrativeCount,
        assessments: assessmentCount,
      },
      linkCounts: {
        evidencePrograms: evProgCount,
        evidenceEvents: evEventCount,
        evidenceProblems: evProblemCount,
        evidenceOutcomes: evOutcomeCount,
        evidenceActors: evActorCount,
      },
      sampleEvidence: sampleWithIntel,
      candidates: candidateEvidenceCounts,
      relationshipSample: relSample,
    });
  } catch (err: any) {
    console.error("[api/debug/db-state] failed:", err);
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}
