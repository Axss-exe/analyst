import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  evidence,
  entities,
  evidenceEntities,
  facts,
  evidenceConnections,
  timelineEvents,
  relationships,
} from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);

    const [item] = db.select().from(evidence).where(eq(evidence.id, id)).all();
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Join evidenceEntities → entities to get names, types, metadata
    const linkedEntities = db
      .select({
        id: entities.id,
        name: entities.name,
        type: entities.type,
        metadata: entities.metadata,
        linkedAt: evidenceEntities.createdAt,
      })
      .from(evidenceEntities)
      .innerJoin(entities, eq(evidenceEntities.entityId, entities.id))
      .where(eq(evidenceEntities.evidenceId, id))
      .all();

    const factList = db
      .select()
      .from(facts)
      .where(eq(facts.evidenceId, id))
      .all();

    const timeline = db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.evidenceId, id))
      .all();

    // FIX: Return the shape the frontend expects
    return NextResponse.json({
      evidence: item,
      entities: linkedEntities ?? [],
      stories: [], // TODO: query storyEvidence table if you want linked stories
      timeline: timeline ?? [],
      relationships: [], // TODO: wire up evidenceConnections if needed
      facts: factList ?? [],
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get evidence error:", error);
    return NextResponse.json(
      { error: "Failed to fetch evidence" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);
    const body = await request.json();

    db.update(evidence)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(evidence.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Patch evidence error:", error);
    return NextResponse.json(
      { error: "Failed to update evidence" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);

    db.delete(facts).where(eq(facts.evidenceId, id)).run();

    db.delete(evidenceConnections)
      .where(
        or(
          eq(evidenceConnections.evidenceIdA, id),
          eq(evidenceConnections.evidenceIdB, id),
        ),
      )
      .run();

    db.delete(timelineEvents).where(eq(timelineEvents.evidenceId, id)).run();

    db.delete(relationships)
      .where(eq(relationships.evidenceIds, JSON.stringify([id])))
      .run();

    db.delete(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, id))
      .run();

    db.delete(evidence).where(eq(evidence.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete evidence error:", error);
    return NextResponse.json(
      { error: "Failed to delete evidence" },
      { status: 500 },
    );
  }
}