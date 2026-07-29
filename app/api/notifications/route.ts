import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { notifications } from "@/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()

    const items = db.select().from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(100)
      .all()

    const unreadCount = db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .where(eq(notifications.isRead, false))
      .get()

    return NextResponse.json({ notifications: items, unreadCount: unreadCount?.count || 0 })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Notifications error:", error)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  }
}
