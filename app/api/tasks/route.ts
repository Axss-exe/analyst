import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  researchTasks,
  users,
  taskEvidence,
  taskEntities,
  evidence,
  entities,
} from "@/db/schema";
import { eq, like, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { notifyTaskAssigned, notifyTaskCompleted } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const priority = searchParams.get("priority") || "";
    const ownerId = searchParams.get("ownerId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db.select().from(researchTasks);
    if (status) query = query.where(eq(researchTasks.status, status)) as any;
    if (priority)
      query = query.where(eq(researchTasks.priority, priority)) as any;
    if (ownerId)
      query = query.where(eq(researchTasks.ownerId, parseInt(ownerId))) as any;

    const items = query
      .orderBy(desc(researchTasks.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(researchTasks)
      .get();

    const enriched = items.map((task) => {
      const owner = db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, task.ownerId))
        .get();
      return { ...task, ownerName: owner?.name || "Unknown" };
    });

    return NextResponse.json({ tasks: enriched, total: count?.count || 0 });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Tasks list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { objective, priority, ownerId, deadline, evidenceIds, entityIds } =
      body;

    if (!objective || !ownerId) {
      return NextResponse.json(
        { error: "Objective and owner required" },
        { status: 400 },
      );
    }

    const result = db
      .insert(researchTasks)
      .values({
        objective,
        priority: priority || "medium",
        ownerId,
        deadline: deadline || null,
        status: "open",
        createdBy: user.id,
      })
      .returning()
      .get();

    if (evidenceIds && evidenceIds.length > 0) {
      for (const eid of evidenceIds) {
        db.insert(taskEvidence)
          .values({ taskId: result.id, evidenceId: eid })
          .run();
      }
    }
    if (entityIds && entityIds.length > 0) {
      for (const eid of entityIds) {
        db.insert(taskEntities)
          .values({ taskId: result.id, entityId: eid })
          .run();
      }
    }

    await logAction({
      userId: user.id,
      action: "CREATE_TASK",
      targetType: "task",
      targetId: result.id,
      newValue: JSON.stringify({ objective, priority, ownerId }),
    });

    if (ownerId !== user.id) {
      await notifyTaskAssigned(result.id, objective, ownerId, user.id);
    }

    return NextResponse.json({ task: result });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Task create error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}
