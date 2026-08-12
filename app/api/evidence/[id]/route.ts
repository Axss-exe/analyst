import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  evidence,
  facts,
  entities,
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
  storyRelationships,
} from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { parseSummary } from "@/lib/ai/summaries";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid evidence ID" },
        { status: 400 }
      );
    }

    // 1. Base evidence
    const item = await db
      .select()
      .from(evidence)
      .where(eq(evidence.id, id))
      .get();

    if (!item) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 }
      );
    }

    // 2. Parse summary if present
    const summary = item.summary ? parseSummary(item.summary) : null;

    // 3. Facts
    const factList = await db
      .select()
      .from(facts)
      .where(eq(facts.evidenceId, id))
      .all();

    // 4. Entities
    const entityList = await db
      .select()
      .from(entities)
      .where(eq(entities.evidenceId, id))
      .all();

    // 5. Intelligence
    const intelligence = await loadIntelligence(id);

    // 6. Relationships
    const relationships = await db
      .select()
      .from(storyRelationships)
      .where(
        or(
          eq(storyRelationships.sourceEvidenceId, id),
          eq(storyRelationships.targetEvidenceId, id)
        )
      )
      .all();

    // 7. Related evidence
    const relatedIds = new Set<number>();
    for (const rel of relationships) {
      if (rel.sourceEvidenceId !== id) relatedIds.add(rel.sourceEvidenceId);
      if (rel.targetEvidenceId !== id) relatedIds.add(rel.targetEvidenceId);
    }

    let relatedEvidence: Array<{
      id: number;
      title: string;
      source: string | null;
      relationshipType: string;
      weight: number;
    }> = [];

    if (relatedIds.size > 0) {
      const allEvidence = await db
        .select({ id: evidence.id, title: evidence.title, source: evidence.source })
        .from(evidence)
        .all();
      const evidenceMap = new Map(allEvidence.map((e) => [e.id, e]));

      relatedEvidence = Array.from(relatedIds).slice(0, 20).map((rid) => {
        const rel = relationships.find(
          (r) => r.sourceEvidenceId === rid || r.targetEvidenceId === rid
        );
        const ev = evidenceMap.get(rid);
        return {
          id: rid,
          title: ev?.title || `Evidence ${rid}`,
          source: ev?.source || null,
          relationshipType: rel?.relationshipType || "related",
          weight: rel?.weight ?? 0,
        };
      });
    }

    return NextResponse.json({
      ...item,
      summary,
      facts: factList,
      entities: entityList,
      intelligence,
      relationships,
      relatedEvidence,
    });
  } catch (error) {
    console.error(`[api/evidence/${params.id}] GET failed:`, error);
    return NextResponse.json(
      { error: "Failed to fetch evidence detail" },
      { status: 500 }
    );
  }
}

async function loadIntelligence(evidenceId: number) {
  const result = {
    programs: [] as Array<{ id: number; name: string; type: string | null; description: string | null }>,
    events: [] as Array<{ id: number; name: string; eventType: string | null; temporalInfo: string | null; description: string | null }>,
    problems: [] as Array<{ id: number; name: string; severity: string | null; description: string | null }>,
    outcomes: [] as Array<{ id: number; name: string; metric: string | null; description: string | null }>,
    actors: [] as Array<{ id: number; name: string; actorType: string | null; description: string | null }>,
  };

  try {
    const progLinks = await db
      .select({ programId: evidencePrograms.programId })
      .from(evidencePrograms)
      .where(eq(evidencePrograms.evidenceId, evidenceId))
      .all();
    if (progLinks.length > 0) {
      const progIds = progLinks.map((p) => p.programId);
      const allProgs = await db.select().from(programs).all();
      result.programs = allProgs.filter((p) => progIds.includes(p.id));
    }
  } catch (e) { console.warn("[intelligence] programs load failed:", e); }

  try {
    const eventLinks = await db
      .select({ eventId: evidenceEvents.eventId })
      .from(evidenceEvents)
      .where(eq(evidenceEvents.evidenceId, evidenceId))
      .all();
    if (eventLinks.length > 0) {
      const eventIds = eventLinks.map((e) => e.eventId);
      const allEvents = await db.select().from(events).all();
      result.events = allEvents.filter((e) => eventIds.includes(e.id));
    }
  } catch (e) { console.warn("[intelligence] events load failed:", e); }

  try {
    const probLinks = await db
      .select({ problemId: evidenceProblems.problemId })
      .from(evidenceProblems)
      .where(eq(evidenceProblems.evidenceId, evidenceId))
      .all();
    if (probLinks.length > 0) {
      const probIds = probLinks.map((p) => p.problemId);
      const allProblems = await db.select().from(problems).all();
      result.problems = allProblems.filter((p) => probIds.includes(p.id));
    }
  } catch (e) { console.warn("[intelligence] problems load failed:", e); }

  try {
    const outLinks = await db
      .select({ outcomeId: evidenceOutcomes.outcomeId })
      .from(evidenceOutcomes)
      .where(eq(evidenceOutcomes.evidenceId, evidenceId))
      .all();
    if (outLinks.length > 0) {
      const outIds = outLinks.map((o) => o.outcomeId);
      const allOutcomes = await db.select().from(outcomes).all();
      result.outcomes = allOutcomes.filter((o) => outIds.includes(o.id));
    }
  } catch (e) { console.warn("[intelligence] outcomes load failed:", e); }

  try {
    const actorLinks = await db
      .select({ actorId: evidenceActors.actorId })
      .from(evidenceActors)
      .where(eq(evidenceActors.evidenceId, evidenceId))
      .all();
    if (actorLinks.length > 0) {
      const actorIds = actorLinks.map((a) => a.actorId);
      const allActors = await db.select().from(actors).all();
      result.actors = allActors.filter((a) => actorIds.includes(a.id));
    }
  } catch (e) { console.warn("[intelligence] actors load failed:", e); }

  return result;
}
