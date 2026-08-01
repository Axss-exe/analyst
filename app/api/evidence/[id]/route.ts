import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, entities, evidenceEntities, timelineEvents, stories, relationships } from "@/db/schema"
import { eq, or, inArray } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const start = Date.now()
  try {
    const user = await requireAuth()
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
    }

    const item = db.select({
      id: evidence.id,
      title: evidence.title,
      summary: evidence.summary,
      source: evidence.source,
      sourceType: evidence.sourceType,
      publicationDate: evidence.publicationDate,
      confidence: evidence.confidence,
      tags: evidence.tags,
      aiMetadata: evidence.aiMetadata,
      createdAt: evidence.createdAt,
      createdBy: evidence.createdBy,
    }).from(evidence).where(eq(evidence.id, id)).get()

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const linkedStories = db.select({
      id: stories.id,
      title: stories.title,
      overview: stories.overview,
      status: stories.status,
      createdAt: stories.createdAt,
    }).from(storyEvidence)
      .innerJoin(stories, eq(storyEvidence.storyId, stories.id))
      .where(eq(storyEvidence.evidenceId, id))
      .all()

    const linkedEntities = db
      .select({
        id: entities.id,
        name: entities.name,
        type: entities.type,
        aliases: entities.aliases,
      })
      .from(evidenceEntities)
      .innerJoin(entities, eq(evidenceEntities.entityId, entities.id))
      .where(eq(evidenceEntities.evidenceId, id))
      .all()

    const events = db.select({
      id: timelineEvents.id,
      date: timelineEvents.date,
      title: timelineEvents.title,
      description: timelineEvents.description,
    }).from(timelineEvents).where(eq(timelineEvents.evidenceId, id)).all()

    // NEW: Fetch relationships for this evidence's entities
    const entityIds = linkedEntities.map(e => e.id)
    let linkedRelationships: any[] = []
    if (entityIds.length > 0) {
      const rels = db.select({
        id: relationships.id,
        sourceId: relationships.sourceId,
        targetId: relationships.targetId,
        type: relationships.type,
        confidence: relationships.confidence,
        evidenceIds: relationships.evidenceIds,
      }).from(relationships)
        .where(or(
          inArray(relationships.sourceId, entityIds),
          inArray(relationships.targetId, entityIds)
        ))
        .all()

      // Resolve names for the related entities
      const relatedEntityIds = new Set<number>()
      rels.forEach(r => {
        relatedEntityIds.add(r.sourceId)
        relatedEntityIds.add(r.targetId)
      })

      const relatedEntities = db.select({
        id: entities.id,
        name: entities.name,
        type: entities.type,
      }).from(entities)
        .where(inArray(entities.id, [...relatedEntityIds]))
        .all()

      const entityNameMap = new Map(relatedEntities.map(e => [e.id, e]))

      linkedRelationships = rels.map(r => ({
        id: r.id,
        sourceId: r.sourceId,
        targetId: r.targetId,
        sourceName: entityNameMap.get(r.sourceId)?.name || "Unknown",
        targetName: entityNameMap.get(r.targetId)?.name || "Unknown",
        sourceType: entityNameMap.get(r.sourceId)?.type || "unknown",
        targetType: entityNameMap.get(r.targetId)?.type || "unknown",
        type: r.type,
        confidence: r.confidence,
      }))
    }

    console.log(`[api/evidence/${id}] TOTAL: ${Date.now() - start}ms`)

    return NextResponse.json({
      evidence: item,
      linkedStories,
      linkedEntities,
      timelineEvents: events,
      relationships: linkedRelationships,
    })
  } catch (error: any) {
    console.error(`[api/evidence/${params.id}] ERROR:`, error)
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to fetch evidence" }, { status: 500 })
  }
}
