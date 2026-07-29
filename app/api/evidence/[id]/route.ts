import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, entities, evidenceEntities, timelineEvents } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const item = db.select().from(evidence).where(eq(evidence.id, id)).get()
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const linkedStories = db.select().from(storyEvidence).where(eq(storyEvidence.evidenceId, id)).all()
    const linkedEntities = db
      .select({ entity: entities })
      .from(evidenceEntities)
      .innerJoin(entities, eq(evidenceEntities.entityId, entities.id))
      .where(eq(evidenceEntities.evidenceId, id))
      .all()
    const events = db.select().from(timelineEvents).where(eq(timelineEvents.evidenceId, id)).all()

    return NextResponse.json({
      evidence: item,
      linkedStories,
      linkedEntities: linkedEntities.map((le) => le.entity),
      timelineEvents: events,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Evidence detail error:", error)
    return NextResponse.json({ error: "Failed to fetch evidence" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const existing = db.select().from(evidence).where(eq(evidence.id, id)).get()
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json()
    const { title, summary, source, sourceType, publicationDate, confidence, tags } = body

    const previousValue = JSON.stringify(existing)
    const updates: any = {}
    if (title !== undefined) updates.title = title
    if (summary !== undefined) updates.summary = summary
    if (source !== undefined) updates.source = source
    if (sourceType !== undefined) updates.sourceType = sourceType
    if (publicationDate !== undefined) updates.publicationDate = publicationDate
    if (confidence !== undefined) updates.confidence = confidence
    if (tags !== undefined) updates.tags = JSON.stringify(tags)

    db.update(evidence).set(updates).where(eq(evidence.id, id)).run()

    await logAction({
      userId: user.id,
      action: "UPDATE_EVIDENCE",
      targetType: "evidence",
      targetId: id,
      previousValue,
      newValue: JSON.stringify(updates),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Evidence update error:", error)
    return NextResponse.json({ error: "Failed to update evidence" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const existing = db.select().from(evidence).where(eq(evidence.id, id)).get()
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    db.delete(evidence).where(eq(evidence.id, id)).run()

    await logAction({
      userId: user.id,
      action: "DELETE_EVIDENCE",
      targetType: "evidence",
      targetId: id,
      previousValue: JSON.stringify(existing),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (error.message === "Forbidden: Admin access required") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    console.error("Evidence delete error:", error)
    return NextResponse.json({ error: "Failed to delete evidence" }, { status: 500 })
  }
}
