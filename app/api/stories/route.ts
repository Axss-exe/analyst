import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { stories, storyEvidence } from "@/db/schema"
import { eq, like, desc, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { logAction } from "@/lib/audit"

function escapeLikePattern(str: string): string {
  return str.replace(/[%_]/g, "\$&")
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status") || ""
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = db.select().from(stories)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(sql`${stories.title} LIKE ${pattern} ESCAPE '\'`) as any
    }
    if (status) query = query.where(eq(stories.status, status)) as any

    const items = query.orderBy(desc(stories.updatedAt)).limit(limit).offset(offset).all()
    const count = db.select({ count: sql`count(*)` }).from(stories).get()

    const enriched = items.map((story) => {
      const evCount = db.select({ count: sql`count(*)` }).from(storyEvidence).where(eq(storyEvidence.storyId, story.id)).get()
      return { ...story, evidenceCount: evCount?.count || 0 }
    })

    return NextResponse.json({ stories: enriched, total: count?.count || 0 })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Stories list error:", error)
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { title, overview } = body

    if (!title || !overview) {
      return NextResponse.json({ error: "Title and overview required" }, { status: 400 })
    }

    const result = db.insert(stories).values({
      title,
      overview,
      status: "active",
      createdBy: user.id,
    }).returning().get()

    await logAction({
      userId: user.id,
      action: "CREATE_STORY",
      targetType: "story",
      targetId: result.id,
      newValue: JSON.stringify({ title, overview }),
    })

    return NextResponse.json({ story: result })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Story create error:", error)
    return NextResponse.json({ error: "Failed to create story" }, { status: 500 })
  }
}
