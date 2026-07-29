import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { users, evidence, stories, entities, researchTasks, generatedBriefs, auditLog } from "@/db/schema"
import { sql } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth"

export async function GET() {
  try {
    const user = await requireAdmin()

    const stats = {
      totalUsers: db.select({ count: sql<number>`count(*)` }).from(users).get()?.count || 0,
      totalEvidence: db.select({ count: sql<number>`count(*)` }).from(evidence).get()?.count || 0,
      totalStories: db.select({ count: sql<number>`count(*)` }).from(stories).get()?.count || 0,
      totalEntities: db.select({ count: sql<number>`count(*)` }).from(entities).get()?.count || 0,
      totalTasks: db.select({ count: sql<number>`count(*)` }).from(researchTasks).get()?.count || 0,
      totalBriefs: db.select({ count: sql<number>`count(*)` }).from(generatedBriefs).get()?.count || 0,
      recentActivity: db.select().from(auditLog).orderBy(sql`created_at DESC`).limit(10).all(),
    }

    return NextResponse.json(stats)
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (error.message === "Forbidden: Admin access required") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    console.error("Admin stats error:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
