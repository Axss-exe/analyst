import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, evidenceEntities } from "@/db/schema"
import { eq, inArray, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const evidenceId = parseInt(params.id)
    if (isNaN(evidenceId)) {
      return NextResponse.json({ error: "Invalid evidence ID" }, { status: 400 })
    }

    const target = db.select({ id: evidence.id, title: evidence.title, aiMetadata: evidence.aiMetadata })
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
      .get()
    if (!target) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 })
    }

    const targetStoryLinks = db.select({ storyId: storyEvidence.storyId })
      .from(storyEvidence)
      .where(eq(storyEvidence.evidenceId, evidenceId))
      .all()
    const targetStoryIds = targetStoryLinks.map(s => s.storyId)

    const targetEntityLinks = db.select({ entityId: evidenceEntities.entityId })
      .from(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, evidenceId))
      .all()
    const targetEntityIds = targetEntityLinks.map(e => e.entityId)

    let storyRelated: any[] = []
    if (targetStoryIds.length > 0) {
      const storyEvidenceLinks = db.select({ evidenceId: storyEvidence.evidenceId })
        .from(storyEvidence)
        .where(inArray(storyEvidence.storyId, targetStoryIds))
        .all()
      const relatedIds = [...new Set(storyEvidenceLinks.map(se => se.evidenceId))].filter(id => id !== evidenceId)
      if (relatedIds.length > 0) {
        storyRelated = db.select({
          id: evidence.id,
          title: evidence.title,
          sourceType: evidence.sourceType,
          createdAt: evidence.createdAt,
        }).from(evidence).where(inArray(evidence.id, relatedIds)).limit(10).all()
      }
    }

    let entityRelated: any[] = []
    if (targetEntityIds.length > 0) {
      const entityEvidenceLinks = db.select({ evidenceId: evidenceEntities.evidenceId })
        .from(evidenceEntities)
        .where(inArray(evidenceEntities.entityId, targetEntityIds))
        .all()
      const relatedIds = [...new Set(entityEvidenceLinks.map(ee => ee.evidenceId))].filter(id => id !== evidenceId)
      if (relatedIds.length > 0) {
        entityRelated = db.select({
          id: evidence.id,
          title: evidence.title,
          sourceType: evidence.sourceType,
          createdAt: evidence.createdAt,
        }).from(evidence).where(inArray(evidence.id, relatedIds)).limit(10).all()
      }
    }

    let topicRelated: any[] = []
    try {
      const meta = target.aiMetadata ? JSON.parse(target.aiMetadata) : {}
      const topics = meta.topics?.topics || []
      if (topics.length > 0) {
        const candidates = db.select({
          id: evidence.id,
          title: evidence.title,
          sourceType: evidence.sourceType,
          createdAt: evidence.createdAt,
          aiMetadata: evidence.aiMetadata,
        }).from(evidence)
          .where(sql`${evidence.id} != ${evidenceId}`)
          .limit(100)
          .all()

        topicRelated = candidates.filter((ev: any) => {
          try {
            const evMeta = ev.aiMetadata ? JSON.parse(ev.aiMetadata) : {}
            const evTopics = evMeta.topics?.topics || []
            return topics.some((t: string) => evTopics.includes(t))
          } catch { return false }
        }).slice(0, 10).map((ev: any) => ({
          id: ev.id,
          title: ev.title,
          sourceType: ev.sourceType,
          createdAt: ev.createdAt,
        }))
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      target: { id: target.id, title: target.title },
      byStory: storyRelated,
      byEntity: entityRelated,
      byTopic: topicRelated,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Related evidence error:", error)
    return NextResponse.json({ error: "Failed to fetch related evidence" }, { status: 500 })
  }
}
