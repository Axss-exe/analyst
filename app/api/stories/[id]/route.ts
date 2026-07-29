import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { stories, evidence, storyEvidence, entities, evidenceEntities, timelineEvents, researchTasks, generatedBriefs, relationships } from "@/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import { requireAuth, requireAdmin } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const story = db.select().from(stories).where(eq(stories.id, id)).get()
    if (!story) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const linkedEvidence = db
      .select({ evidence: evidence, junction: storyEvidence })
      .from(storyEvidence)
      .innerJoin(evidence, eq(storyEvidence.evidenceId, evidence.id))
      .where(eq(storyEvidence.storyId, id))
      .all()

    const events = db.select().from(timelineEvents).where(eq(timelineEvents.storyId, id)).orderBy(timelineEvents.date).all()
    const tasks = db.select().from(researchTasks).where(sql`${researchTasks.objective} LIKE '%story:${id}%'`).all()
    const briefs = db.select().from(generatedBriefs).where(eq(generatedBriefs.storyId, id)).orderBy(desc(generatedBriefs.createdAt)).all()

    const evidenceIds = linkedEvidence.map((le) => le.evidence.id)
    const allEntityLinks = evidenceIds.length > 0
      ? db.select().from(evidenceEntities).where(sql`${evidenceEntities.evidenceId} IN (${evidenceIds.join(",")})`).all()
      : []
    const entityIdSet = new Set(allEntityLinks.map((el) => el.entityId))
    const storyEntities = entityIdSet.size > 0
      ? db.select().from(entities).where(sql`${entities.id} IN (${Array.from(entityIdSet).join(",")})`).all()
      : []

    const entityIdArray = Array.from(entityIdSet)
    const rels = entityIdArray.length > 0
      ? db.select().from(relationships)
        .where(sql`${relationships.sourceId} IN (${entityIdArray.join(",")}) OR ${relationships.targetId} IN (${entityIdArray.join(",")})`)
        .all()
      : []

    return NextResponse.json({
      story,
      evidence: linkedEvidence.map((le) => ({ ...le.evidence, junction: le.junction })),
      timelineEvents: events,
      tasks,
      briefs,
      entities: storyEntities,
      relationships: rels,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Story detail error:", error)
    return NextResponse.json({ error: "Failed to fetch story" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const existing = db.select().from(stories).where(eq(stories.id, id)).get()
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json()
    const { title, overview, status } = body

    const previousValue = JSON.stringify(existing)
    const updates: any = { updatedAt: new Date().toISOString() }
    if (title !== undefined) updates.title = title
    if (overview !== undefined) updates.overview = overview
    if (status !== undefined) updates.status = status

    db.update(stories).set(updates).where(eq(stories.id, id)).run()

    await logAction({
      userId: user.id,
      action: "UPDATE_STORY",
      targetType: "story",
      targetId: id,
      previousValue,
      newValue: JSON.stringify(updates),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Story update error:", error)
    return NextResponse.json({ error: "Failed to update story" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const existing = db.select().from(stories).where(eq(stories.id, id)).get()
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    db.delete(stories).where(eq(stories.id, id)).run()

    await logAction({
      userId: user.id,
      action: "DELETE_STORY",
      targetType: "story",
      targetId: id,
      previousValue: JSON.stringify(existing),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (error.message === "Forbidden: Admin access required") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    console.error("Story delete error:", error)
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 })
  }
}
