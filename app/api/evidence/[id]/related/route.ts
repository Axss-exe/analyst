import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, evidenceEntities, entities, timelineEvents } from "@/db/schema"
import { eq, inArray, desc, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const targetEvidence = db.select().from(evidence).where(eq(evidence.id, id)).get()
    if (!targetEvidence) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Get this evidence's entities
    const myEntityLinks = db.select({ entityId: evidenceEntities.entityId })
      .from(evidenceEntities)
      .where(eq(evidenceEntities.evidenceId, id))
      .all()
    const myEntityIds = myEntityLinks.map(e => e.entityId)

    // Get this evidence's topics from AI metadata
    let myTopics: string[] = []
    let myThemes: string[] = []
    try {
      const meta = targetEvidence.aiMetadata ? JSON.parse(targetEvidence.aiMetadata) : {}
      myTopics = meta.topics?.topics || []
      myThemes = meta.topics?.themes || []
    } catch { /* ignore */ }

    // Get this evidence's stories
    const myStoryLinks = db.select({ storyId: storyEvidence.storyId })
      .from(storyEvidence)
      .where(eq(storyEvidence.evidenceId, id))
      .all()
    const myStoryIds = myStoryLinks.map(s => s.storyId)

    // Find other evidence sharing entities
    let entityRelated: any[] = []
    if (myEntityIds.length > 0) {
      const otherLinks = db.select({ evidenceId: evidenceEntities.evidenceId, entityId: evidenceEntities.entityId })
        .from(evidenceEntities)
        .where(inArray(evidenceEntities.entityId, myEntityIds))
        .all()

      const evidenceIdToSharedEntities: Map<number, number[]> = new Map()
      for (const link of otherLinks) {
        if (link.evidenceId === id) continue
        if (!evidenceIdToSharedEntities.has(link.evidenceId)) {
          evidenceIdToSharedEntities.set(link.evidenceId, [])
        }
        evidenceIdToSharedEntities.get(link.evidenceId)!.push(link.entityId)
      }

      const relatedIds = Array.from(evidenceIdToSharedEntities.keys())
      if (relatedIds.length > 0) {
        const relatedEvidence = db.select().from(evidence).where(inArray(evidence.id, relatedIds)).all()
        entityRelated = relatedEvidence.map(ev => ({
          ...ev,
          relationType: "shared_entities",
          relationScore: (evidenceIdToSharedEntities.get(ev.id)?.length || 0) / myEntityIds.length,
          sharedEntityCount: evidenceIdToSharedEntities.get(ev.id)?.length || 0,
        }))
      }
    }

    // Find evidence sharing stories
    let storyRelated: any[] = []
    if (myStoryIds.length > 0) {
      const otherStoryLinks = db.select({ evidenceId: storyEvidence.evidenceId, storyId: storyEvidence.storyId })
        .from(storyEvidence)
        .where(inArray(storyEvidence.storyId, myStoryIds))
        .all()

      const storyEvidenceIds = otherStoryLinks
        .filter(s => s.evidenceId !== id)
        .map(s => s.evidenceId)

      if (storyEvidenceIds.length > 0) {
        const storyEvidenceItems = db.select().from(evidence).where(inArray(evidence.id, storyEvidenceIds)).all()
        storyRelated = storyEvidenceItems.map(ev => ({
          ...ev,
          relationType: "same_story",
          relationScore: 0.8,
          sharedStoryCount: myStoryIds.filter(sid => 
            otherStoryLinks.some(osl => osl.storyId === sid && osl.evidenceId === ev.id)
          ).length,
        }))
      }
    }

    // Find evidence with topic overlap (from AI metadata)
    let topicRelated: any[] = []
    if (myTopics.length > 0) {
      const allEvidence = db.select().from(evidence).where(sql`${evidence.id} != ${id}`).orderBy(desc(evidence.createdAt)).limit(200).all()
      for (const ev of allEvidence) {
        try {
          const meta = ev.aiMetadata ? JSON.parse(ev.aiMetadata) : {}
          const evTopics: string[] = meta.topics?.topics || []
          const shared = myTopics.filter(t => evTopics.some((et: string) => et.toLowerCase() === t.toLowerCase()))
          if (shared.length >= 2) {
            topicRelated.push({
              ...ev,
              relationType: "topic_overlap",
              relationScore: shared.length / Math.max(myTopics.length, evTopics.length),
              sharedTopics: shared,
            })
          }
        } catch { /* skip */ }
      }
    }

    // Combine and deduplicate
    const allRelated = new Map<number, any>()

    for (const rel of [...entityRelated, ...storyRelated, ...topicRelated]) {
      if (allRelated.has(rel.id)) {
        const existing = allRelated.get(rel.id)
        // Keep highest score, merge relation types
        existing.relationScore = Math.max(existing.relationScore, rel.relationScore)
        if (!existing.relationTypes.includes(rel.relationType)) {
          existing.relationTypes.push(rel.relationType)
        }
        if (rel.sharedTopics) existing.sharedTopics = [...new Set([...(existing.sharedTopics || []), ...rel.sharedTopics])]
        if (rel.sharedEntityCount) existing.sharedEntityCount = Math.max(existing.sharedEntityCount || 0, rel.sharedEntityCount)
      } else {
        allRelated.set(rel.id, {
          ...rel,
          relationTypes: [rel.relationType],
        })
      }
    }

    const results = Array.from(allRelated.values())
      .sort((a, b) => b.relationScore - a.relationScore)
      .slice(0, 20)

    return NextResponse.json({
      evidence: targetEvidence,
      related: results,
      stats: {
        entityRelated: entityRelated.length,
        storyRelated: storyRelated.length,
        topicRelated: topicRelated.length,
        totalRelated: results.length,
      },
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Related evidence error:", error)
    return NextResponse.json({ error: "Failed to fetch related evidence" }, { status: 500 })
  }
}
