import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { eq, like, desc, sql } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") || ""
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = db.select().from(users)
    if (search) query = query.where(like(users.name, `%${search}%`)) as any

    const items = query.orderBy(desc(users.createdAt)).limit(limit).offset(offset).all()
    const count = db.select({ count: sql<number>`count(*)` }).from(users).get()

    const sanitized = items.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, isBlocked: u.isBlocked, createdAt: u.createdAt }))

    return NextResponse.json({ users: sanitized, total: count?.count || 0 })
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (error.message === "Forbidden: Admin access required") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    console.error("Admin users error:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}
