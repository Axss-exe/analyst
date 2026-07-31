import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, entities, evidenceEntities, timelineEvents, stories, notifications as notifTable } from "@/db/schema"
import { eq, like, desc, sql, inArray } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"

// Import from split AI modules instead of the monolithic lib/ai.ts
import { generateEvidenceSummary } from "@/lib/ai/summary"
import { extractTopicsFromText } from "@/lib/ai/topics"
import { extractEntitiesFromText, extractTimelineEvents } from "@/lib/ai/entities"
import { evaluateStoryRelevance } from "@/lib/ai/similarity"
import { evaluateSourceConfidence } from "@/lib/ai/confidence"

function escapeLikePattern(str: string): string {
  return str.replace(/[%_]/g, "\\$&")
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const tag = searchParams.get("tag") || ""
    const sourceType = searchParams.get("sourceType") || ""
    const linked = searchParams.get("linked") || ""
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = db.select().from(evidence)

    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(sql`${evidence.title} LIKE ${pattern} ESCAPE '\\'`) as any
    }
    if (tag) {
      const pattern = `%${escapeLikePattern(tag)}%`
      query = query.where(sql`${evidence.tags} LIKE ${pattern} ESCAPE '\\'`) as any
    }
    if (sourceType) {
      query = query.where(eq(evidence.sourceType, sourceType)) as any
    }

    if (linked === "false") {
      const allLinked = db.select({ evidenceId: storyEvidence.evidenceId }).from(storyEvidence).all()
      const linkedIds = new Set(allLinked.map(l => l.evidenceId))
      const allEvidence = query.orderBy(desc(evidence.createdAt)).all()
      const unlinked = allEvidence.filter(e => !linkedIds.has(e.id))
      return NextResponse.json({
        evidence: unlinked.slice(offset, offset + limit),
        total: unlinked.length,
      })
    }

    const items = query.orderBy(desc(evidence.createdAt)).limit(limit).offset(offset).all()
    const count = db.select({ count: sql`count(*)` }).from(evidence).get()

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
    const { title, summary, source, sourceType, publicationDate, confidence, tags, content, autoConfidence } = body

    if (!title || !source || !sourceType) {
      return NextResponse.json({ error: "Title, source, and source type are required" }, { status: 400 })
    }

    let finalSummary = summary || ""
    let aiMetadata: any = {}
    let finalConfidence = confidence || 0.5
    let extractedTopics: any = null

    if (autoConfidence || confidence === undefined || confidence === null) {
      if (content) {
        try {
          const confidenceResult = await evaluateSourceConfidence(content, sourceType, source)
          finalConfidence = confidenceResult.score
          aiMetadata.confidenceEvaluation = {
            score: confidenceResult.score,
            reasoning: confidenceResult.reasoning,
            factors: confidenceResult.factors,
          }
        } catch (e) {
          console.error("Confidence evaluation failed:", e)
        }
      }
    }

    if (content) {
      try {
        extractedTopics = await extractTopicsFromText(content)
        aiMetadata.topics = extractedTopics
      } catch (e) {
        console.error("Topic extraction failed:", e)
      }
    }

    if (content && !summary) {
      try {
        finalSummary = await generateEvidenceSummary(content)
        aiMetadata.summaryGenerated = true
        aiMetadata.summaryMethod = "ai_chunked"
      } catch (e) {
        console.error("Summary generation failed:", e)
        const wordCount = content.split(/\s+/).length
        const charCount = content.length
        finalSummary = `[Document too large for automatic summary — ${wordCount.toLocaleString()} words, ${charCount.toLocaleString()} chars. Please add a manual summary or retry with a smaller excerpt.]`
        aiMetadata.summaryGenerated = false
        aiMetadata.summaryMethod = "fallback_too_large"
      }
    }

    const result = db.insert(evidence).values({
      title,
      summary: finalSummary,
      source,
      sourceType,
      publicationDate: publicationDate || null,
      confidence: finalConfidence,
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

    const extractedEntityNames: string[] = []
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
          extractedEntityNames.push(ent.name)
        }
        aiMetadata.extractedEntities = extractedEntities.length
      } catch {
        // silent fail
      }

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

      if (extractedTopics) {
        extractedTopics.keyEntities = extractedEntityNames
        aiMetadata.topics = extractedTopics
      }
      db.update(evidence).set({ aiMetadata: JSON.stringify(aiMetadata) }).where(eq(evidence.id, result.id)).run()
    }

    // SMART STORY LINKING
    const allStories = db.select().from(stories).where(eq(stories.status, "active")).all()
    const matches: Array<{ storyId: number; score: number; reasoning: string }> = []

    for (const story of allStories) {
      try {
        const relevance = await evaluateStoryRelevance(finalSummary, story.title, story.overview)

        const storyEvidenceLinks = db.select({ evidenceId: storyEvidence.evidenceId })
          .from(storyEvidence)
          .where(eq(storyEvidence.storyId, story.id))
          .all()
        const storyEvidenceIds = storyEvidenceLinks.map(se => se.evidenceId)

        let entityOverlapScore = 0
        if (storyEvidenceIds.length > 0 && extractedEntityNames.length > 0) {
          const storyEntitiesList = db.select({ entityId: evidenceEntities.entityId })
            .from(evidenceEntities)
            .where(inArray(evidenceEntities.evidenceId, storyEvidenceIds))
            .all()
          const storyEntityIds = new Set(storyEntitiesList.map(se => se.entityId))
          const evidenceEntityIds = db.select({ entityId: evidenceEntities.entityId })
            .from(evidenceEntities)
            .where(eq(evidenceEntities.evidenceId, result.id))
            .all()
          const shared = evidenceEntityIds.filter(e => storyEntityIds.has(e.entityId))
          const totalUnique = new Set([...storyEntityIds, ...evidenceEntityIds.map(e => e.entityId)]).size
          entityOverlapScore = totalUnique > 0 ? shared.length / totalUnique : 0
        }

        const combinedScore = (relevance.score * 0.6) + (entityOverlapScore * 0.4)

        if (combinedScore >= 0.35) {
          matches.push({ storyId: story.id, score: combinedScore, reasoning: relevance.reasoning })
        }
      } catch {
        // skip
      }
    }

    matches.sort((a, b) => b.score - a.score)

    const autoLinks = matches.filter(m => m.score >= 0.5)
    const suggestions = matches.filter(m => m.score >= 0.35 && m.score < 0.5)

    for (const match of autoLinks) {
      db.insert(storyEvidence).values({
        storyId: match.storyId,
        evidenceId: result.id,
        confidence: match.score,
        relationshipType: "auto_linked",
      }).run()

      await createNotification({
        userId: user.id,
        type: "story_match",
        title: "Evidence Auto-Linked to Story",
        message: `"${title}" was automatically linked to story (relevance: ${(match.score * 100).toFixed(0)}%)`,
        relatedObjectType: "story",
        relatedObjectId: match.storyId,
      })
    }

    for (const match of suggestions) {
      await createNotification({
        userId: user.id,
        type: "story_suggestion",
        title: "Story Link Suggested",
        message: `"${title}" may be relevant to a story (relevance: ${(match.score * 100).toFixed(0)}%). Review and confirm.`,
        relatedObjectType: "story",
        relatedObjectId: match.storyId,
      })
    }

    if (matches.length === 0) {
      await createNotification({
        userId: user.id,
        type: "story_discovery",
        title: "New Story Candidate",
        message: `"${title}" doesn't match any existing story. Consider running Story Discovery to find related evidence.`,
        relatedObjectType: "evidence",
        relatedObjectId: result.id,
      })
    }

    return NextResponse.json({
      evidence: result,
      matches: matches.length,
      autoLinked: autoLinks.length,
      suggested: suggestions.length,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Evidence create error:", error)
    return NextResponse.json({ error: "Failed to create evidence" }, { status: 500 })
  }
}
