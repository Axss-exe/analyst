import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { notifications } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"

export async function POST() {
  try {
    const user = await requireAuth()

    db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, user.id))
      .run()

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("Mark all read error:", error)
    return NextResponse.json({ error: "Failed to mark all as read" }, { status: 500 })
  }
}
