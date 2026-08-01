import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/client"
import { sql } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()

    // Enable foreign keys so cascade deletes fire properly
    db.run(sql`PRAGMA foreign_keys = ON`)

    // Delete in dependency order (children first where no cascade, then parents)
    const tables = [
      "generated_briefs",
      "story_evidence",
      "evidence_entities",
      "task_evidence",
      "task_entities",
      "relationships",
      "timeline_events",
      "entities",
      "stories",
      "evidence",
    ]

    const results: Record<string, number> = {}

    for (const table of tables) {
      try {
        const result = db.run(sql`DELETE FROM ${sql.raw(table)}`)
        results[table] = result.changes || 0
        console.log(`[admin/clear-evidence] Deleted ${result.changes || 0} rows from ${table}`)
      } catch (err: any) {
        console.error(`[admin/clear-evidence] Failed to clear ${table}:`, err.message)
        results[table] = -1
      }
    }

    // Also clear audit logs related to evidence
    try {
      const auditResult = db.run(sql`DELETE FROM audit_log WHERE target_type = 'evidence'`)
      results["audit_log_evidence"] = auditResult.changes || 0
    } catch (err: any) {
      console.error("[admin/clear-evidence] Failed to clear audit logs:", err.message)
    }

    await logAction({
      userId: user.id,
      action: "CLEAR_ALL_EVIDENCE",
      targetType: "system",
      targetId: 0,
      newValue: JSON.stringify(results),
    })

    return NextResponse.json({
      success: true,
      message: "All evidence and derived data cleared.",
      cleared: results,
    })
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error.message === "Forbidden: Admin access required") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
    }
    console.error("[admin/clear-evidence] ERROR:", error)
    return NextResponse.json({ error: "Failed to clear evidence" }, { status: 500 })
  }
}
