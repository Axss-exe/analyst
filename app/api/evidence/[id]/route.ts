import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  evidence,
  facts,
  evidenceConnections,
  timelineEvents,
  relationships,
  evidenceEntities,
  storyEvidence,
} from "@/db/schema";
import { eq, like, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);

    const item = db.select().from(evidence).where(eq(evidence.id, id)).get();
    if (!item) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 },
      );
    }

    // Load linked entities
    const linkedEntities = db
      .select({
        id: evidenceEntities.entityId,
      })
      .from(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, id))
      .all();

    // Load linked timeline events
    const events = db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.evidenceId, id))
      .all();

    // Load facts
    const factRows = db
      .select()
      .from(facts)
      .where(eq(facts.evidenceId, id))
      .all();

    return NextResponse.json({
      evidence: item,
      entities: linkedEntities,
      timelineEvents: events,
      facts: factRows,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Evidence detail error:", error);
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

    const existing = db
      .select()
      .from(evidence)
      .where(eq(evidence.id, id))
      .get();
    if (!existing) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 },
      );
    }

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.source !== undefined) updateData.source = body.source;
    if (body.sourceType !== undefined) updateData.sourceType = body.sourceType;
    if (body.publicationDate !== undefined)
      updateData.publicationDate = body.publicationDate;
    if (body.confidence !== undefined) updateData.confidence = body.confidence;
    if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);
    if (body.aiMetadata !== undefined)
      updateData.aiMetadata = JSON.stringify(body.aiMetadata);

    db.update(evidence).set(updateData).where(eq(evidence.id, id)).run();

    await logAction({
      userId: user.id,
      action: "UPDATE_EVIDENCE",
      targetType: "evidence",
      targetId: id,
      previousValue: JSON.stringify(existing),
      newValue: JSON.stringify(updateData),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Evidence update error:", error);
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

    const existing = db
      .select()
      .from(evidence)
      .where(eq(evidence.id, id))
      .get();
    if (!existing) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 },
      );
    }

    // Delete related records (cascade where schema supports it)
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
    db.delete(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, id))
      .run();

    // Remove from story_evidence links
    db.delete(storyEvidence).where(eq(storyEvidence.evidenceId, id)).run();

    // Delete relationships that reference this evidence ID in their evidenceIds JSON array
    // This is a best-effort cleanup since evidenceIds is stored as JSON text
    const allRelationships = db.select().from(relationships).all();
    for (const rel of allRelationships) {
      try {
        const relEvidenceIds = JSON.parse(rel.evidenceIds || "[]");
        if (Array.isArray(relEvidenceIds) && relEvidenceIds.includes(id)) {
          if (relEvidenceIds.length === 1) {
            db.delete(relationships).where(eq(relationships.id, rel.id)).run();
          } else {
            const updatedIds = relEvidenceIds.filter(
              (eid: number) => eid !== id,
            );
            db.update(relationships)
              .set({ evidenceIds: JSON.stringify(updatedIds) })
              .where(eq(relationships.id, rel.id))
              .run();
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Finally delete the evidence
    db.delete(evidence).where(eq(evidence.id, id)).run();

    await logAction({
      userId: user.id,
      action: "DELETE_EVIDENCE",
      targetType: "evidence",
      targetId: id,
      previousValue: JSON.stringify(existing),
    });

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
