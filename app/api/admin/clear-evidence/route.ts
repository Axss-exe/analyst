import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();

    // Disable foreign key checks so we can delete in any order
    db.run(sql`PRAGMA foreign_keys = OFF`);

    // ALL tables that should be cleared — derived data + core evidence data
    // Order doesn't matter with FKs off, but we group logically for logging
    const tables = [
      // v4 intelligence junction tables
      "evidence_programs",
      "evidence_events",
      "evidence_problems",
      "evidence_outcomes",
      "evidence_actors",
      // v4 story graph tables
      "story_candidate_evidence",
      "evidence_story_assessment",
      "story_graph_edges",
      "context_graph_edges",
      "narrative_checks",
      // v3/v4 junction tables
      "generated_briefs",
      "story_evidence",
      "evidence_entities",
      "task_evidence",
      "task_entities",
      "evidence_connections",
      // Tables with SET NULL FKs (SQLite won't cascade these)
      "timeline_events",
      "facts",
      "relationships",
      // Parent tables that don't cascade from evidence/stories deletion
      "narratives",
      "graph_clusters",
      "story_candidates",
      "programs",
      "events",
      "problems",
      "outcomes",
      "actors",
      "entities",
      // Core tables
      "stories",
      "evidence",
      // Import/job queues
      "evidence_imports",
      "jobs",
      // Notifications related to evidence operations
      "notifications",
    ];

    const results: Record<string, number> = {};

    for (const table of tables) {
      try {
        const result = db.run(sql`DELETE FROM ${sql.raw(table)}`);
        results[table] = result.changes || 0;
        if (result.changes && result.changes > 0) {
          console.log(
            `[admin/clear-evidence] Deleted ${result.changes} rows from ${table}`,
          );
        }
      } catch (err: any) {
        console.error(
          `[admin/clear-evidence] Failed to clear ${table}:`,
          err.message,
        );
        results[table] = -1;
      }
    }

    // Also clear audit logs related to evidence-derived objects
    try {
      const auditResult = db.run(
        sql`DELETE FROM audit_log WHERE target_type IN ('evidence', 'story', 'entity', 'brief', 'task')`,
      );
      results["audit_log_derived"] = auditResult.changes || 0;
    } catch (err: any) {
      console.error(
        "[admin/clear-evidence] Failed to clear audit logs:",
        err.message,
      );
    }

    // Re-enable foreign keys
    db.run(sql`PRAGMA foreign_keys = ON`);

    await logAction({
      userId: user.id,
      action: "CLEAR_ALL_EVIDENCE",
      targetType: "system",
      targetId: 0,
      newValue: JSON.stringify(results),
    });

    const totalDeleted = Object.values(results).filter((n) => n > 0).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      success: true,
      message: `All evidence and derived data cleared. ${totalDeleted} total rows removed.`,
      cleared: results,
      totalDeleted,
    });
  } catch (error: any) {
    // Safety: always try to re-enable foreign keys
    try {
      db.run(sql`PRAGMA foreign_keys = ON`);
    } catch { /* ignore */ }

    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "Forbidden: Admin access required") {
      return NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 },
      );
    }
    console.error("[admin/clear-evidence] ERROR:", error);
    return NextResponse.json(
      { error: "Failed to clear evidence" },
      { status: 500 },
    );
  }
}
