import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidence, facts, entities, storyRelationships } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { parseSummary } from "@/lib/ai/summary";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid evidence ID" }, { status: 400 });
    }

    const item = await db.select().from(evidence).where(eq(evidence.id, id)).get();
    if (!item) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    const summary = item.summary ? parseSummary(item.summary) : null;

    const factList = await db.select().from(facts).where(eq(facts.evidenceId, id)).all();
    const entityList = await db.select().from(entities).where(eq(entities.evidenceId, id)).all();

    // Load intelligence via raw SQL to avoid Drizzle column name mapping issues
    const intelligence = await loadIntelligenceRaw(id);

    const relationships = await db
      .select()
      .from(storyRelationships)
      .where(or(eq(storyRelationships.sourceEvidenceId, id), eq(storyRelationships.targetEvidenceId, id)))
      .all();

    // Related evidence
    const relatedIds = new Set<number>();
    for (const rel of relationships) {
      if (rel.sourceEvidenceId !== id) relatedIds.add(rel.sourceEvidenceId);
      if (rel.targetEvidenceId !== id) relatedIds.add(rel.targetEvidenceId);
    }

    let relatedEvidence: any[] = [];
    if (relatedIds.size > 0) {
      const allEvidence = await db.select({ id: evidence.id, title: evidence.title, source: evidence.source }).from(evidence).all();
      const evidenceMap = new Map(allEvidence.map((e) => [e.id, e]));
      relatedEvidence = Array.from(relatedIds).slice(0, 20).map((rid) => {
        const rel = relationships.find((r) => r.sourceEvidenceId === rid || r.targetEvidenceId === rid);
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
    return NextResponse.json({ error: "Failed to fetch evidence detail" }, { status: 500 });
  }
}

async function loadIntelligenceRaw(evidenceId: number) {
  const result = {
    programs: [] as any[],
    events: [] as any[],
    problems: [] as any[],
    outcomes: [] as any[],
    actors: [] as any[],
  };

  const client = (db as any).$client || (db as any).session?.client;
  if (!client) return result;

  try {
    // Programs via evidence_programs junction
    const progRows = client
      .prepare(`SELECT p.* FROM programs p JOIN evidence_programs ep ON p.id = ep.program_id WHERE ep.evidence_id = ?`)
      .all(evidenceId) as any[];
    result.programs = progRows;
  } catch (e) { /* table may not exist */ }

  try {
    const eventRows = client
      .prepare(`SELECT e.* FROM events e JOIN evidence_events ee ON e.id = ee.event_id WHERE ee.evidence_id = ?`)
      .all(evidenceId) as any[];
    result.events = eventRows;
  } catch (e) { /* table may not exist */ }

  try {
    const probRows = client
      .prepare(`SELECT p.* FROM problems p JOIN evidence_problems ep ON p.id = ep.problem_id WHERE ep.evidence_id = ?`)
      .all(evidenceId) as any[];
    result.problems = probRows;
  } catch (e) { /* table may not exist */ }

  try {
    const outRows = client
      .prepare(`SELECT o.* FROM outcomes o JOIN evidence_outcomes eo ON o.id = eo.outcome_id WHERE eo.evidence_id = ?`)
      .all(evidenceId) as any[];
    result.outcomes = outRows;
  } catch (e) { /* table may not exist */ }

  try {
    const actorRows = client
      .prepare(`SELECT a.* FROM actors a JOIN evidence_actors ea ON a.id = ea.actor_id WHERE ea.evidence_id = ?`)
      .all(evidenceId) as any[];
    result.actors = actorRows;
  } catch (e) { /* table may not exist */ }

  return result;
}
