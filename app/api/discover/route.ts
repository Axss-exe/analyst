import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, storyEvidence, entities, evidenceEntities, stories } from "@/db/schema"
import { eq, desc, sql, inArray } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { proposeStoryFromEvidence } from "@/lib/ai/stories"

interface EvidenceWithMeta {
  id: number
  title: string
  summary: string
  sourceType: string
  createdAt: string
  topics: any
  entities: string[]
  aiMetadata: any
}

function getEvidenceTopics(ev: any): string[] {
  try {
    const meta = ev.aiMetadata ? JSON.parse(ev.aiMetadata) : {}
    return meta.topics?.topics || []
  } catch { return [] }
}

function getEvidenceEntities(ev: any): string[] {
  try {
    const meta = ev.aiMetadata ? JSON.parse(ev.aiMetadata) : {}
    return meta.topics?.keyEntities || []
  } catch { return [] }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const minClusterSize = parseInt(searchParams.get("minClusterSize") || "2")
    const maxClusters = parseInt(searchParams.get("maxClusters") || "10")

    const allEvidence = db.select().from(evidence).orderBy(desc(evidence.createdAt)).all()
    const linkedIds = db.select({ evidenceId: storyEvidence.evidenceId }).from(storyEvidence).all()
    const linkedSet = new Set(linkedIds.map(l => l.evidenceId))
    const unlinked = allEvidence.filter(e => !linkedSet.has(e.id))

    if (unlinked.length < minClusterSize) {
      return NextResponse.json({ clusters: [], unlinkedCount: unlinked.length })
    }

    const clusters: EvidenceWithMeta[][] = []
    const assigned = new Set<number>()

    for (const ev of unlinked) {
      if (assigned.has(ev.id)) continue
      const evEntities = getEvidenceEntities(ev)
      const evTopics = getEvidenceTopics(ev)
      if (evEntities.length === 0 && evTopics.length === 0) continue

      const cluster: EvidenceWithMeta[] = [{
        id: ev.id,
        title: ev.title,
        summary: ev.summary,
        sourceType: ev.sourceType,
        createdAt: ev.createdAt,
        topics: getEvidenceTopics(ev),
        entities: evEntities,
        aiMetadata: ev.aiMetadata,
      }]
      assigned.add(ev.id)

      for (const other of unlinked) {
        if (other.id === ev.id || assigned.has(other.id)) continue
        const otherEntities = getEvidenceEntities(other)
        const otherTopics = getEvidenceTopics(other)
        const sharedEntities = evEntities.filter(e => otherEntities.includes(e))
        const sharedTopics = evTopics.filter(t => otherTopics.includes(t))

        if (sharedEntities.length >= 2 || (sharedEntities.length >= 1 && sharedTopics.length >= 2)) {
          cluster.push({
            id: other.id,
            title: other.title,
            summary: other.summary,
            sourceType: other.sourceType,
            createdAt: other.createdAt,
            topics: otherTopics,
            entities: otherEntities,
            aiMetadata: other.aiMetadata,
          })
          assigned.add(other.id)
        }
      }

      if (cluster.length >= minClusterSize) {
        clusters.push(cluster)
      } else {
        cluster.forEach(c => assigned.delete(c.id))
      }
    }

    const remaining = unlinked.filter(e => !assigned.has(e.id))
    const topicGroups: Map<string, EvidenceWithMeta[]> = new Map()
    for (const ev of remaining) {
      const topics = getEvidenceTopics(ev)
      const entities = getEvidenceEntities(ev)
      for (const topic of topics.slice(0, 2)) {
        const key = topic.toLowerCase()
        if (!topicGroups.has(key)) topicGroups.set(key, [])
        topicGroups.get(key)!.push({
          id: ev.id, title: ev.title, summary: ev.summary,
          sourceType: ev.sourceType, createdAt: ev.createdAt,
          topics, entities, aiMetadata: ev.aiMetadata,
        })
      }
    }

    for (const [topic, group] of topicGroups) {
      if (group.length >= minClusterSize) {
        const seen = new Set<number>()
        const deduped = group.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true })
        if (deduped.length >= minClusterSize) {
          clusters.push(deduped)
          deduped.forEach(d => assigned.add(d.id))
        }
      }
    }

    const finalClusters = clusters.slice(0, maxClusters)
    const proposals = []
    for (const cluster of finalClusters) {
      try {
        const proposal = await proposeStoryFromEvidence(cluster)
        proposals.push({
          ...proposal,
          evidenceCount: cluster.length,
          evidenceItems: cluster.map(c => ({ id: c.id, title: c.title, summary: c.summary })),
          connectionSignals: {
            sharedTopics: proposal.sharedTopics,
            sharedEntities: proposal.sharedEntities,
            sharedThemes: proposal.sharedThemes,
          },
        })
      } catch (e) {
        console.error("Story proposal failed:", e)
        const allTopics = new Set<string>()
        const allEntities = new Set<string>()
        cluster.forEach(c => { c.topics.forEach((t: string) => allTopics.add(t)); c.entities.forEach((e: string) => allEntities.add(e)) })
        proposals.push({
          title: `Story: ${cluster[0].title.slice(0, 40)}...`,
          overview: `A collection of ${cluster.length} related evidence items.`,
          confidence: 0.5,
          evidenceIds: cluster.map(c => c.id),
          sharedTopics: [...allTopics],
          sharedEntities: [...allEntities],
          sharedThemes: [],
          reasoning: "Grouped by shared topics and entities.",
          evidenceCount: cluster.length,
          evidenceItems: cluster.map(c => ({ id: c.id, title: c.title, summary: c.summary })),
          connectionSignals: { sharedTopics: [...allTopics], sharedEntities: [...allEntities], sharedThemes: [] },
        })
      }
    }

    return NextResponse.json({
      clusters: proposals,
      unlinkedCount: unlinked.length,
      clusteredCount: assigned.size,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Discovery error:", error)
    return NextResponse.json({ error: "Failed to discover stories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { title, overview, evidenceIds } = body

    if (!title || !overview || !evidenceIds || evidenceIds.length === 0) {
      return NextResponse.json({ error: "Title, overview, and evidence IDs required" }, { status: 400 })
    }

    const story = db.insert(stories).values({
      title,
      overview,
      status: "active",
      createdBy: user.id,
    }).returning().get()

    for (const evidenceId of evidenceIds) {
      db.insert(storyEvidence).values({
        storyId: story.id,
        evidenceId,
        confidence: 0.7,
        relationshipType: "discovered",
      }).run()
    }

    return NextResponse.json({ story, linkedEvidence: evidenceIds.length })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Discovery create error:", error)
    return NextResponse.json({ error: "Failed to create discovered story" }, { status: 500 })
  }
}
