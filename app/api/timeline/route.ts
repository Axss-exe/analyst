import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { timelineEvents, evidence, stories } from "@/db/schema"
import { eq, desc, sql, gte, lte } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const storyId = searchParams.get("storyId")
    const evidenceId = searchParams.get("evidenceId")
    const fromDate = searchParams.get("from")
    const toDate = searchParams.get("to")
    const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 1000)

    let query = db.select().from(timelineEvents)
    if (storyId) query = query.where(eq(timelineEvents.storyId, parseInt(storyId))) as any
    if (evidenceId) query = query.where(eq(timelineEvents.evidenceId, parseInt(evidenceId))) as any
    if (fromDate) query = query.where(gte(timelineEvents.date, fromDate)) as any
    if (toDate) query = query.where(lte(timelineEvents.date, toDate)) as any

    const items = query.orderBy(timelineEvents.date).limit(limit).all()

    return NextResponse.json({ events: items })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Timeline error:", error)
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { date, title, description, evidenceId, storyId, entityIds } = body

    if (!date || !title || !description) {
      return NextResponse.json({ error: "Date, title, and description required" }, { status: 400 })
    }

    const result = db.insert(timelineEvents).values({
      date,
      title,
      description,
      evidenceId: evidenceId || null,
      storyId: storyId || null,
      entityIds: JSON.stringify(entityIds || []),
      createdBy: user.id,
    }).returning().get()

    await logAction({
      userId: user.id,
      action: "CREATE_TIMELINE_EVENT",
      targetType: "timeline_event",
      targetId: result.id,
      newValue: JSON.stringify({ date, title }),
    })

    return NextResponse.json({ event: result })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Timeline create error:", error)
    return NextResponse.json({ error: "Failed to create timeline event" }, { status: 500 })
  }
}
