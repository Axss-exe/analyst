import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "";
    const targetType = searchParams.get("targetType") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db.select().from(auditLog);
    if (action) query = query.where(eq(auditLog.action, action)) as any;
    if (targetType)
      query = query.where(eq(auditLog.targetType, targetType)) as any;

    const items = query
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .get();

    const enriched = items.map((log) => {
      const actor = db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, log.userId))
        .get();
      return { ...log, actorName: actor?.name || "Unknown" };
    });

    return NextResponse.json({ logs: enriched, total: count?.count || 0 });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden: Admin access required")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Audit log error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 },
    );
  }
}
