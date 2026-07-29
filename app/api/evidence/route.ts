import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, entities, evidenceEntities, timelineEvents, stories, notifications as notifTable } from "@/db/schema"
import { eq, like, desc, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"
import { generateEvidenceSummary, extractEntitiesFromText, extractTimelineEvents, evaluateStoryRelevance } from "@/lib/ai"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const tag = searchParams.get("tag") || ""
    const sourceType = searchParams.get("sourceType") || ""
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = db.select().from(evidence)

    if (search) {
      query = query.where(like(evidence.title, `%${search}%`)) as any
    }
    if (tag) {
      query = query.where(like(evidence.tags, `%${tag}%`)) as any
    }
    if (sourceType) {
      query = query.where(eq(evidence.sourceType, sourceType)) as any
    }

    const items = query.orderBy(desc(evidence.createdAt)).limit(limit).offset(offset).all()
    const count = db.select({ count: sql<number>`count(*)` }).from(evidence).get()

    return NextResponse.json({ evidence: items, total: count?.count || 0 })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Evidence list error:", error)
    return NextResponse.json({ error: "Failed to fetch evidence" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { title, summary, source, sourceType, publicationDate, confidence, tags, content } = body

    if (!title || !source || !sourceType) {
      return NextResponse.json({ error: "Title, source, and source type are required" }, { status: 400 })
    }

    let finalSummary = summary || ""
    let aiMetadata: any = {}

    if (content && !summary) {
      try {
        finalSummary = await generateEvidenceSummary(content)
        aiMetadata.summaryGenerated = true
      } catch {
        finalSummary = content.slice(0, 500)
      }
    }

    const result = db.insert(evidence).values({
      title,
      summary: finalSummary,
      source,
      sourceType,
      publicationDate: publicationDate || null,
      confidence: confidence || 0.5,
      tags: JSON.stringify(tags || []),
      aiMetadata: JSON.stringify(aiMetadata),
      createdBy: user.id,
    }).returning().get()

    await logAction({
      userId: user.id,
      action: "UPLOAD_EVIDENCE",
      targetType: "evidence",
      targetId: result.id,
      newValue: JSON.stringify({ title, source, sourceType }),
    })

    // Extract entities if content provided
    if (content) {
      try {
        const extractedEntities = await extractEntitiesFromText(content)
        for (const ent of extractedEntities) {
          const existing = db.select().from(entities).where(eq(entities.name, ent.name)).get()
          let entityId: number
          if (!existing) {
            const newEnt = db.insert(entities).values({
              name: ent.name,
              type: ent.type,
              aliases: JSON.stringify(ent.aliases || []),
              createdBy: user.id,
            }).returning().get()
            entityId = newEnt.id
          } else {
            entityId = existing.id
          }
          db.insert(evidenceEntities).values({
            evidenceId: result.id,
            entityId,
          }).run()
        }
        aiMetadata.extractedEntities = extractedEntities.length
      } catch {
        // silent fail on entity extraction
      }

      // Extract timeline events
      try {
        const extractedEvents = await extractTimelineEvents(content)
        for (const evt of extractedEvents) {
          db.insert(timelineEvents).values({
            date: evt.date,
            title: evt.title,
            description: evt.description,
            evidenceId: result.id,
            entityIds: "[]",
            createdBy: user.id,
          }).run()
        }
        aiMetadata.extractedEvents = extractedEvents.length
      } catch {
        // silent fail
      }

      // Update AI metadata
      db.update(evidence).set({ aiMetadata: JSON.stringify(aiMetadata) }).where(eq(evidence.id, result.id)).run()
    }

    // Story matching
    const allStories = db.select().from(stories).where(eq(stories.status, "active")).all()
    const matches: Array<{ storyId: number; score: number; reasoning: string }> = []

    for (const story of allStories) {
      try {
        const relevance = await evaluateStoryRelevance(finalSummary, story.title, story.overview)
        if (relevance.score >= 0.4) {
          matches.push({ storyId: story.id, score: relevance.score, reasoning: relevance.reasoning })
        }
      } catch {
        // skip
      }
    }

    for (const match of matches) {
      db.insert(storyEvidence).values({
        storyId: match.storyId,
        evidenceId: result.id,
        confidence: match.score,
        relationshipType: "auto_suggested",
      }).run()

      await createNotification({
        userId: user.id,
        type: "story_match",
        title: "Story Match Suggestion",
        message: `Evidence "${title}" may be relevant to story (score: ${(match.score * 100).toFixed(0)}%)`,
        relatedObjectType: "story",
        relatedObjectId: match.storyId,
      })
    }

    return NextResponse.json({ evidence: result, matches: matches.length })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Evidence create error:", error)
    return NextResponse.json({ error: "Failed to create evidence" }, { status: 500 })
  }
}
