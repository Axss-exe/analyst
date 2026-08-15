import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidence, facts, entities, evidenceEntities, storyEvidence, storyRelationships, timelineEvents, stories } from "@/db/schema";
import { eq, or, inArray } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid evidence ID" }, { status: 400 });
    }

    // 1. Base evidence
    const item = await db.select().from(evidence).where(eq(evidence.id, id)).get();
    if (!item) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    // 2. Parse summary if present (stored as JSON string)
    let summary = null;
    if (item.summary && item.summary.trim().length > 0) {
      try {
        summary = JSON.parse(item.summary);
      } catch {
        // Not valid JSON — treat as plain text fallback
        summary = { overview: item.summary, keyFindings: [], implications: [], relevance: "", confidence: 0 };
      }
    }

    // 3. Facts
    let factList: any[] = [];
    try {
      factList = await db.select().from(facts).where(eq(facts.evidenceId, id)).all();
    } catch (e) { console.warn("[evidence detail] facts query failed:", e); }

    // 4. Entities via evidenceEntities junction table
    // FIX: entities table has NO evidenceId column. Must join through evidenceEntities.
    let entityList: any[] = [];
    try {
      entityList = await db
        .select({
          id: entities.id,
          name: entities.name,
          type: entities.type,
          aliases: entities.aliases,
          metadata: entities.metadata,
        })
        .from(evidenceEntities)
        .innerJoin(entities, eq(evidenceEntities.entityId, entities.id))
        .where(eq(evidenceEntities.evidenceId, id))
        .all();
    } catch (e) { console.warn("[evidence detail] entities query failed:", e); }

    // 5. Story relationships
    let relationships: any[] = [];
    try {
      relationships = await db
        .select()
        .from(storyRelationships)
        .where(or(eq(storyRelationships.sourceEvidenceId, id), eq(storyRelationships.targetEvidenceId, id)))
        .all();
    } catch (e) { console.warn("[evidence detail] relationships query failed:", e); }

    // 6. Linked stories via storyEvidence junction
    let linkedStories: any[] = [];
    try {
      const storyLinks = await db
        .select({ storyId: storyEvidence.storyId, relationshipType: storyEvidence.relationshipType })
        .from(storyEvidence)
        .where(eq(storyEvidence.evidenceId, id))
        .all();
      if (storyLinks.length > 0) {
        const storyIds = storyLinks.map((sl) => sl.storyId);
        const storyRows = await db.select().from(stories).where(inArray(stories.id, storyIds)).all();
        const storyMap = new Map(storyRows.map((s) => [s.id, s]));
        linkedStories = storyLinks.map((sl) => ({
          id: sl.storyId,
          title: storyMap.get(sl.storyId)?.title || `Story ${sl.storyId}`,
          status: storyMap.get(sl.storyId)?.status || "active",
          relationshipType: sl.relationshipType,
        }));
      }
    } catch (e) { console.warn("[evidence detail] linked stories query failed:", e); }

    // 7. Timeline events
    let timelineEventList: any[] = [];
    try {
      timelineEventList = await db.select().from(timelineEvents).where(eq(timelineEvents.evidenceId, id)).all();
    } catch (e) { console.warn("[evidence detail] timeline events query failed:", e); }

    // 8. Related evidence
    const relatedIds = new Set<number>();
    for (const rel of relationships) {
      if (rel.sourceEvidenceId !== id) relatedIds.add(rel.sourceEvidenceId);
      if (rel.targetEvidenceId !== id) relatedIds.add(rel.targetEvidenceId);
    }

    let relatedEvidence: any[] = [];
    if (relatedIds.size > 0) {
      try {
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
        relatedEvidence.sort((a, b) => b.weight - a.weight);
      } catch (e) { console.warn("[evidence detail] related evidence query failed:", e); }
    }

    // 9. Intelligence (optional — try each table individually)
    const intelligence = {
      programs: [] as any[],
      events: [] as any[],
      problems: [] as any[],
      outcomes: [] as any[],
      actors: [] as any[],
    };

    const client = (db as any).$client || (db as any).session?.client;
    if (client) {
      const tables = [
        { key: "programs", table: "programs", junction: "evidence_programs", fk: "program_id" },
        { key: "events", table: "events", junction: "evidence_events", fk: "event_id" },
        { key: "problems", table: "problems", junction: "evidence_problems", fk: "problem_id" },
        { key: "outcomes", table: "outcomes", junction: "evidence_outcomes", fk: "outcome_id" },
        { key: "actors", table: "actors", junction: "evidence_actors", fk: "actor_id" },
      ];
      for (const t of tables) {
        try {
          const rows = client
            .prepare(`SELECT t.* FROM ${t.table} t JOIN ${t.junction} j ON t.id = j.${t.fk} WHERE j.evidence_id = ?`)
            .all(id);
          (intelligence as any)[t.key] = rows;
        } catch (e) {
          // Table or junction doesn't exist — skip silently
        }
      }
    }

    // FIX: Wrap response in the shape frontend expects
    return NextResponse.json({
      evidence: {
        ...item,
        summary,
      },
      linkedEntities: entityList,
      linkedStories,
      timelineEvents: timelineEventList,
      facts: factList,
      intelligence,
      relationships,
      relatedEvidence,
    });
  } catch (error) {
    console.error(`[api/evidence/${params.id}] GET failed:`, error);
    return NextResponse.json({ error: "Failed to fetch evidence detail" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid evidence ID" }, { status: 400 });
    }
    await db.delete(evidence).where(eq(evidence.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[api/evidence/${params.id}] DELETE failed:`, error);
    return NextResponse.json({ error: "Failed to delete evidence" }, { status: 500 });
  }
}
