import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, entities, evidenceEntities, timelineEvents, stories } from "@/db/schema"
import { eq, like, desc, sql, inArray } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"
import { createJob, startStage, completeStage, failStage, completeJob, failJob } from "@/lib/jobs"
import { generateEvidenceSummary } from "@/lib/ai/summary"
import { extractTopicsFromText } from "@/lib/ai/topics"
import { extractEntitiesFromText, extractTimelineEvents } from "@/lib/ai/entities"
import { evaluateStoryRelevance } from "@/lib/ai/similarity"
import { evaluateSourceConfidence } from "@/lib/ai/confidence"
import { estimateTokens } from "@/lib/ai/token-counter"
import { randomUUID } from "crypto"

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
  const start = Date.now()
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { title, summary, source, sourceType, publicationDate, confidence, tags, content, autoConfidence } = body

    if (!title || !source || !sourceType) {
      return NextResponse.json({ error: "Title, source, and source type are required" }, { status: 400 })
    }

    // ─── PHASE 1: IMMEDIATE SAVE ──────────────────────────────
    // Save evidence immediately with basic metadata. AI processing happens in background.
    const pages = content ? Math.ceil(content.split(/\s+/).length / 500) : 0
    const tokens = content ? estimateTokens(content) : 0
    console.log(`[api/evidence] Saving: ${pages} pages, ${tokens} tokens`)

    const result = db.insert(evidence).values({
      title,
      summary: summary || "[Processing...]",
      source,
      sourceType,
      publicationDate: publicationDate || null,
      confidence: confidence || 0.5,
      tags: JSON.stringify(tags || []),
      aiMetadata: JSON.stringify({
        status: "processing",
        pages,
        tokens,
        submittedAt: new Date().toISOString(),
      }),
      createdBy: user.id,
    }).returning().get()

    await logAction({
      userId: user.id,
      action: "UPLOAD_EVIDENCE",
      targetType: "evidence",
      targetId: result.id,
      newValue: JSON.stringify({ title, source, sourceType, pages, tokens }),
    })

    // ─── PHASE 2: CREATE BACKGROUND JOB ───────────────────────
    const jobId = randomUUID()
    const stageNames = content ? [
      "Confidence Evaluation",
      "Topic Extraction",
      "Entity Extraction",
      "Timeline Extraction",
      "Summarization",
      "Story Matching",
      "Finalization",
    ] : ["Finalization"]

    createJob(jobId, stageNames)

    // ─── PHASE 3: RETURN IMMEDIATELY ──────────────────────────
    // Client gets the evidence + jobId immediately. Background worker starts after response.
    console.log(`[api/evidence] Saved in ${Date.now() - start}ms. Job: ${jobId}`)

    // Start background processing (fire-and-forget)
    if (content) {
      processEvidenceAsync(result.id, content, title, source, sourceType, user.id, jobId, autoConfidence, confidence)
        .catch(err => {
          console.error(`[background] Job ${jobId} failed:`, err)
          failJob(jobId, err.message)
        })
    } else {
      completeJob(jobId, { evidenceId: result.id })
    }

    return NextResponse.json({
      evidence: result,
      jobId,
      message: content ? "Evidence saved. AI processing started in background." : "Evidence saved.",
    })
  } catch (error: any) {
    console.error(`[api/evidence] ERROR after ${Date.now() - start}ms:`, error)
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to create evidence" }, { status: 500 })
  }
}

// ─── BACKGROUND WORKER ─────────────────────────────────────────
async function processEvidenceAsync(
  evidenceId: number,
  content: string,
  title: string,
  source: string,
  sourceType: string,
  userId: number,
  jobId: string,
  autoConfidence: boolean,
  manualConfidence?: number | null
) {
  console.log(`[background] Starting job ${jobId} for evidence ${evidenceId}`)
  const startTime = Date.now()

  let finalSummary = ""
  let aiMetadata: any = { status: "processing", stages: {} }
  let finalConfidence = manualConfidence || 0.5
  let extractedTopics: any = null
  let extractedEntityNames: string[] = []

  try {
    // Stage 1: Confidence Evaluation
    startStage(jobId, "Confidence Evaluation", "Analyzing source reliability...")
    if (autoConfidence || manualConfidence === undefined || manualConfidence === null) {
      try {
        const confidenceResult = await evaluateSourceConfidence(content, sourceType, source)
        finalConfidence = confidenceResult.score
        aiMetadata.confidenceEvaluation = {
          score: confidenceResult.score,
          reasoning: confidenceResult.reasoning,
          factors: confidenceResult.factors,
        }
        completeStage(jobId, "Confidence Evaluation", `Score: ${(confidenceResult.score * 100).toFixed(0)}%`)
      } catch (e: any) {
        console.error("[background] Confidence eval failed:", e.message)
        failStage(jobId, "Confidence Evaluation", e.message)
      }
    } else {
      completeStage(jobId, "Confidence Evaluation", "Using manual confidence")
    }

    // Stage 2: Topic Extraction
    startStage(jobId, "Topic Extraction", "Identifying themes and topics...")
    try {
      extractedTopics = await extractTopicsFromText(content)
      aiMetadata.topics = extractedTopics
      completeStage(jobId, "Topic Extraction", `${extractedTopics.topics.length} topics found`)
    } catch (e: any) {
      console.error("[background] Topic extraction failed:", e.message)
      failStage(jobId, "Topic Extraction", e.message)
    }

    // Stage 3: Entity Extraction
    startStage(jobId, "Entity Extraction", "Extracting named entities...")
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
            createdBy: userId,
          }).returning().get()
          entityId = newEnt.id
        } else {
          entityId = existing.id
        }
        db.insert(evidenceEntities).values({
          evidenceId,
          entityId,
        }).run()
        extractedEntityNames.push(ent.name)
      }
      aiMetadata.extractedEntities = extractedEntities.length
      completeStage(jobId, "Entity Extraction", `${extractedEntities.length} entities found`)
    } catch (e: any) {
      console.error("[background] Entity extraction failed:", e.message)
      failStage(jobId, "Entity Extraction", e.message)
    }

    // Stage 4: Timeline Extraction
    startStage(jobId, "Timeline Extraction", "Finding dated events...")
    try {
      const extractedEvents = await extractTimelineEvents(content)
      for (const evt of extractedEvents) {
        db.insert(timelineEvents).values({
          date: evt.date,
          title: evt.title,
          description: evt.description,
          evidenceId,
          entityIds: "[]",
          createdBy: userId,
        }).run()
      }
      aiMetadata.extractedEvents = extractedEvents.length
      completeStage(jobId, "Timeline Extraction", `${extractedEvents.length} events found`)
    } catch (e: any) {
      console.error("[background] Timeline extraction failed:", e.message)
      failStage(jobId, "Timeline Extraction", e.message)
    }

    // Stage 5: Summarization
    startStage(jobId, "Summarization", "Generating document summary...")
    try {
      finalSummary = await generateEvidenceSummary(content, jobId)
      aiMetadata.summaryGenerated = true
      aiMetadata.summaryMethod = "ai_chunked"
      completeStage(jobId, "Summarization", "Summary complete")
    } catch (e: any) {
      console.error("[background] Summary generation failed:", e.message)
      const wordCount = content.split(/\s+/).length
      const charCount = content.length
      finalSummary = `[Document too large for automatic summary — ${wordCount.toLocaleString()} words, ${charCount.toLocaleString()} chars. Please add a manual summary or retry with a smaller excerpt.]`
      aiMetadata.summaryGenerated = false
      aiMetadata.summaryMethod = "fallback_too_large"
      failStage(jobId, "Summarization", e.message)
    }

    // Update evidence with AI results
    if (extractedTopics) {
      extractedTopics.keyEntities = extractedEntityNames
      aiMetadata.topics = extractedTopics
    }

    db.update(evidence).set({
      summary: finalSummary,
      confidence: finalConfidence,
      aiMetadata: JSON.stringify(aiMetadata),
    }).where(eq(evidence.id, evidenceId)).run()

    // Stage 6: Story Matching
    startStage(jobId, "Story Matching", "Checking for story links...")
    try {
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
              .where(eq(evidenceEntities.evidenceId, evidenceId))
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
          // skip individual story failures
        }
      }

      matches.sort((a, b) => b.score - a.score)
      const autoLinks = matches.filter(m => m.score >= 0.5)
      const suggestions = matches.filter(m => m.score >= 0.35 && m.score < 0.5)

      for (const match of autoLinks) {
        db.insert(storyEvidence).values({
          storyId: match.storyId,
          evidenceId,
          confidence: match.score,
          relationshipType: "auto_linked",
        }).run()
        await createNotification({
          userId,
          type: "story_match",
          title: "Evidence Auto-Linked to Story",
          message: `"${title}" was automatically linked to story (relevance: ${(match.score * 100).toFixed(0)}%)`,
          relatedObjectType: "story",
          relatedObjectId: match.storyId,
        })
      }

      for (const match of suggestions) {
        await createNotification({
          userId,
          type: "story_suggestion",
          title: "Story Link Suggested",
          message: `"${title}" may be relevant to a story (relevance: ${(match.score * 100).toFixed(0)}%). Review and confirm.`,
          relatedObjectType: "story",
          relatedObjectId: match.storyId,
        })
      }

      if (matches.length === 0) {
        await createNotification({
          userId,
          type: "story_discovery",
          title: "New Story Candidate",
          message: `"${title}" doesn't match any existing story. Consider running Story Discovery to find related evidence.`,
          relatedObjectType: "evidence",
          relatedObjectId: evidenceId,
        })
      }

      completeStage(jobId, "Story Matching", `${autoLinks.length} auto-linked, ${suggestions.length} suggested`)
    } catch (e: any) {
      console.error("[background] Story matching failed:", e.message)
      failStage(jobId, "Story Matching", e.message)
    }

    // Finalization
    startStage(jobId, "Finalization", "Saving results...")
    aiMetadata.status = "completed"
    aiMetadata.processedAt = new Date().toISOString()
    aiMetadata.processingTimeMs = Date.now() - startTime
    db.update(evidence).set({
      aiMetadata: JSON.stringify(aiMetadata),
    }).where(eq(evidence.id, evidenceId)).run()
    completeStage(jobId, "Finalization", `Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    completeJob(jobId, { evidenceId, summary: finalSummary, confidence: finalConfidence })
    console.log(`[background] Job ${jobId} completed in ${Date.now() - startTime}ms`)

  } catch (err: any) {
    console.error(`[background] Fatal error in job ${jobId}:`, err)
    failJob(jobId, err.message)
    // Mark evidence as failed
    db.update(evidence).set({
      aiMetadata: JSON.stringify({ status: "failed", error: err.message }),
    }).where(eq(evidence.id, evidenceId)).run()
  }
}
