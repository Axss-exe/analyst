import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { generatedBriefs } from "@/db/schema"
import { eq, desc } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth()
    const storyId = parseInt(params.id)
    if (isNaN(storyId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 })

    const briefs = db.select().from(generatedBriefs)
      .where(eq(generatedBriefs.storyId, storyId))
      .orderBy(desc(generatedBriefs.createdAt))
      .all()

    return NextResponse.json({ briefs })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Story briefs error:", error)
    return NextResponse.json({ error: "Failed to fetch briefs" }, { status: 500 })
  }
}
