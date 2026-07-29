import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { generatedBriefs, stories, evidence, storyEvidence, templates } from "@/db/schema"
import { eq, like, desc, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"
import { notifyBriefGenerated } from "@/lib/notifications"
import { generateBriefContent } from "@/lib/ai"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const storyId = searchParams.get("storyId")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = db.select().from(generatedBriefs)
    if (search) query = query.where(like(generatedBriefs.headline, `%${search}%`)) as any
    if (storyId) query = query.where(eq(generatedBriefs.storyId, parseInt(storyId))) as any

    const items = query.orderBy(desc(generatedBriefs.createdAt)).limit(limit).offset(offset).all()
    const count = db.select({ count: sql<number>`count(*)` }).from(generatedBriefs).get()

    const enriched = items.map((brief) => {
      const story = db.select({ title: stories.title }).from(stories).where(eq(stories.id, brief.storyId)).get()
      return { ...brief, storyTitle: story?.title || "Unknown" }
    })

    return NextResponse.json({ briefs: enriched, total: count?.count || 0 })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Briefs list error:", error)
    return NextResponse.json({ error: "Failed to fetch briefs" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { storyId, generationMode, selectedEvidenceIds, templateId } = body

    if (!storyId || !generationMode) {
      return NextResponse.json({ error: "Story ID and generation mode required" }, { status: 400 })
    }

    const story = db.select().from(stories).where(eq(stories.id, storyId)).get()
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 })

    let evidenceItems: typeof evidence.$inferSelect[] = []

    if (generationMode === "full") {
      evidenceItems = db
        .select({ evidence: evidence })
        .from(storyEvidence)
        .innerJoin(evidence, eq(storyEvidence.evidenceId, evidence.id))
        .where(eq(storyEvidence.storyId, storyId))
        .all()
        .map((le) => le.evidence)
    } else if (generationMode === "partial" && selectedEvidenceIds) {
      evidenceItems = db.select().from(evidence)
        .where(sql`${evidence.id} IN (${selectedEvidenceIds.join(",")})`)
        .all()
    } else if (generationMode === "since_last") {
      const lastBrief = db.select().from(generatedBriefs)
        .where(eq(generatedBriefs.storyId, storyId))
        .orderBy(desc(generatedBriefs.createdAt))
        .limit(1)
        .get()

      const lastDate = lastBrief?.createdAt || "1970-01-01"
      evidenceItems = db
        .select({ evidence: evidence })
        .from(storyEvidence)
        .innerJoin(evidence, eq(storyEvidence.evidenceId, evidence.id))
        .where(eq(storyEvidence.storyId, storyId))
        .all()
        .map((le) => le.evidence)
        .filter((e) => e.createdAt > lastDate)
    }

    if (evidenceItems.length === 0) {
      return NextResponse.json({ error: "No evidence found for generation" }, { status: 400 })
    }

    const briefData = await generateBriefContent({
      storyTitle: story.title,
      storyOverview: story.overview,
      evidenceItems: evidenceItems.map((e) => ({ title: e.title, summary: e.summary, source: e.source })),
      mode: generationMode,
    })

    const version = (db.select({ count: sql<number>`count(*)` }).from(generatedBriefs).where(eq(generatedBriefs.storyId, storyId)).get()?.count || 0) + 1

    const result = db.insert(generatedBriefs).values({
      storyId,
      headline: briefData.headline,
      content: JSON.stringify(briefData),
      version,
      generationMode,
      evidenceIds: JSON.stringify(evidenceItems.map((e) => e.id)),
      templateId: templateId || null,
      promptVersion: "1.0",
      llmModel: process.env.CEREBRAS_MODEL || "llama3.1-70b",
      createdBy: user.id,
    }).returning().get()

    await logAction({
      userId: user.id,
      action: "GENERATE_BRIEF",
      targetType: "brief",
      targetId: result.id,
      newValue: JSON.stringify({ headline: briefData.headline, mode: generationMode, evidenceCount: evidenceItems.length }),
    })

    await notifyBriefGenerated(result.id, briefData.headline, storyId, story.title, user.id)

    return NextResponse.json({ brief: result, content: briefData })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Brief generate error:", error)
    return NextResponse.json({ error: "Failed to generate brief" }, { status: 500 })
  }
}
