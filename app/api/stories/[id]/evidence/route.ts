import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { storyEvidence, evidence, stories } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"
import { notifyEvidenceLinked } from "@/lib/notifications"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const storyId = parseInt(params.id)
    if (isNaN(storyId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const body = await request.json()
    const { evidenceId, confidence, relationshipType } = body
    if (!evidenceId) return NextResponse.json({ error: "Evidence ID required" }, { status: 400 })

    const story = db.select().from(stories).where(eq(stories.id, storyId)).get()
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 })

    const ev = db.select().from(evidence).where(eq(evidence.id, evidenceId)).get()
    if (!ev) return NextResponse.json({ error: "Evidence not found" }, { status: 404 })

    const existing = db.select().from(storyEvidence)
      .where(and(eq(storyEvidence.storyId, storyId), eq(storyEvidence.evidenceId, evidenceId)))
      .get()
    if (existing) return NextResponse.json({ error: "Already linked" }, { status: 409 })

    db.insert(storyEvidence).values({
      storyId,
      evidenceId,
      confidence: confidence || 0.5,
      relationshipType: relationshipType || "related",
    }).run()

    await logAction({
      userId: user.id,
      action: "LINK_EVIDENCE",
      targetType: "story",
      targetId: storyId,
      newValue: JSON.stringify({ evidenceId, relationshipType }),
    })

    await notifyEvidenceLinked(evidenceId, ev.title, storyId, story.title, user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Link evidence error:", error)
    return NextResponse.json({ error: "Failed to link evidence" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const storyId = parseInt(params.id)
    if (isNaN(storyId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const evidenceId = parseInt(searchParams.get("evidenceId") || "")
    if (isNaN(evidenceId)) return NextResponse.json({ error: "Evidence ID required" }, { status: 400 })

    db.delete(storyEvidence)
      .where(and(eq(storyEvidence.storyId, storyId), eq(storyEvidence.evidenceId, evidenceId)))
      .run()

    await logAction({
      userId: user.id,
      action: "UNLINK_EVIDENCE",
      targetType: "story",
      targetId: storyId,
      previousValue: JSON.stringify({ evidenceId }),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Unlink evidence error:", error)
    return NextResponse.json({ error: "Failed to unlink evidence" }, { status: 500 })
  }
}
