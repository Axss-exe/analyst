import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { entities, evidenceEntities, evidence, relationships, timelineEvents } from "@/db/schema"
import { eq, or, sql } from "drizzle-orm"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const entity = db.select().from(entities).where(eq(entities.id, id)).get()
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const linkedEvidence = db
      .select({ evidence: evidence })
      .from(evidenceEntities)
      .innerJoin(evidence, eq(evidenceEntities.evidenceId, evidence.id))
      .where(eq(evidenceEntities.entityId, id))
      .all()

    const rels = db.select().from(relationships)
      .where(or(eq(relationships.sourceId, id), eq(relationships.targetId, id)))
      .all()

    const events = db.select().from(timelineEvents)
      .where(sql`${timelineEvents.entityIds} LIKE '%"${id}"%'`)
      .all()

    return NextResponse.json({
      entity,
      evidence: linkedEvidence.map((le) => le.evidence),
      relationships: rels,
      timelineEvents: events,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Entity detail error:", error)
    return NextResponse.json({ error: "Failed to fetch entity" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const existing = db.select().from(entities).where(eq(entities.id, id)).get()
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json()
    const { name, type, aliases, metadata } = body

    const previousValue = JSON.stringify(existing)
    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (type !== undefined) updates.type = type
    if (aliases !== undefined) updates.aliases = JSON.stringify(aliases)
    if (metadata !== undefined) updates.metadata = JSON.stringify(metadata)

    db.update(entities).set(updates).where(eq(entities.id, id)).run()

    await logAction({
      userId: user.id,
      action: "UPDATE_ENTITY",
      targetType: "entity",
      targetId: id,
      previousValue,
      newValue: JSON.stringify(updates),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Entity update error:", error)
    return NextResponse.json({ error: "Failed to update entity" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const existing = db.select().from(entities).where(eq(entities.id, id)).get()
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    db.delete(entities).where(eq(entities.id, id)).run()

    await logAction({
      userId: user.id,
      action: "DELETE_ENTITY",
      targetType: "entity",
      targetId: id,
      previousValue: JSON.stringify(existing),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (error.message === "Forbidden: Admin access required") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    console.error("Entity delete error:", error)
    return NextResponse.json({ error: "Failed to delete entity" }, { status: 500 })
  }
}
