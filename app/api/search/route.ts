import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { evidence, stories, entities, researchTasks, generatedBriefs, timelineEvents } from "@/db/schema"
import { like, or, desc, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q") || ""
    const type = searchParams.get("type") || "all"
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    const results: Array<{ type: string; id: number; title: string; snippet: string; date: string }> = []

    if (type === "all" || type === "evidence") {
      const items = db.select().from(evidence)
        .where(or(like(evidence.title, `%${q}%`), like(evidence.summary, `%${q}%`), like(evidence.tags, `%${q}%`)))
        .limit(limit)
        .all()
      items.forEach((item) => results.push({ type: "evidence", id: item.id, title: item.title, snippet: item.summary.slice(0, 200), date: item.createdAt }))
    }

    if (type === "all" || type === "stories") {
      const items = db.select().from(stories)
        .where(or(like(stories.title, `%${q}%`), like(stories.overview, `%${q}%`)))
        .limit(limit)
        .all()
      items.forEach((item) => results.push({ type: "story", id: item.id, title: item.title, snippet: item.overview.slice(0, 200), date: item.updatedAt }))
    }

    if (type === "all" || type === "entities") {
      const items = db.select().from(entities)
        .where(or(like(entities.name, `%${q}%`), like(entities.aliases, `%${q}%`)))
        .limit(limit)
        .all()
      items.forEach((item) => results.push({ type: "entity", id: item.id, title: item.name, snippet: `${item.type} — ${item.aliases.slice(0, 100)}`, date: item.createdAt }))
    }

    if (type === "all" || type === "tasks") {
      const items = db.select().from(researchTasks)
        .where(like(researchTasks.objective, `%${q}%`))
        .limit(limit)
        .all()
      items.forEach((item) => results.push({ type: "task", id: item.id, title: item.objective.slice(0, 80), snippet: `Priority: ${item.priority} | Status: ${item.status}`, date: item.createdAt }))
    }

    if (type === "all" || type === "briefs") {
      const items = db.select().from(generatedBriefs)
        .where(like(generatedBriefs.headline, `%${q}%`))
        .limit(limit)
        .all()
      items.forEach((item) => results.push({ type: "brief", id: item.id, title: item.headline, snippet: `Version ${item.version} | ${item.generationMode}`, date: item.createdAt }))
    }

    if (type === "all" || type === "timeline") {
      const items = db.select().from(timelineEvents)
        .where(or(like(timelineEvents.title, `%${q}%`), like(timelineEvents.description, `%${q}%`)))
        .limit(limit)
        .all()
      items.forEach((item) => results.push({ type: "timeline", id: item.id, title: item.title, snippet: item.description.slice(0, 200), date: item.date }))
    }

    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ results: results.slice(0, limit) })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
