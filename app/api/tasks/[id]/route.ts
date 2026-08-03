import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  researchTasks,
  taskEvidence,
  taskEntities,
  evidence,
  entities,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { notifyTaskCompleted } from "@/lib/notifications";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const task = db
      .select()
      .from(researchTasks)
      .where(eq(researchTasks.id, id))
      .get();
    if (!task)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const linkedEvidence = db
      .select({ evidence: evidence })
      .from(taskEvidence)
      .innerJoin(evidence, eq(taskEvidence.evidenceId, evidence.id))
      .where(eq(taskEvidence.taskId, id))
      .all();

    const linkedEntities = db
      .select({ entity: entities })
      .from(taskEntities)
      .innerJoin(entities, eq(taskEntities.entityId, entities.id))
      .where(eq(taskEntities.taskId, id))
      .all();

    return NextResponse.json({
      task,
      evidence: linkedEvidence.map((le) => le.evidence),
      entities: linkedEntities.map((le) => le.entity),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Task detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = db
      .select()
      .from(researchTasks)
      .where(eq(researchTasks.id, id))
      .get();
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { objective, priority, ownerId, deadline, status, completionNotes } =
      body;

    const previousValue = JSON.stringify(existing);
    const updates: any = {};
    if (objective !== undefined) updates.objective = objective;
    if (priority !== undefined) updates.priority = priority;
    if (ownerId !== undefined) updates.ownerId = ownerId;
    if (deadline !== undefined) updates.deadline = deadline;
    if (status !== undefined) updates.status = status;
    if (completionNotes !== undefined)
      updates.completionNotes = completionNotes;

    db.update(researchTasks).set(updates).where(eq(researchTasks.id, id)).run();

    await logAction({
      userId: user.id,
      action: "UPDATE_TASK",
      targetType: "task",
      targetId: id,
      previousValue,
      newValue: JSON.stringify(updates),
    });

    if (status === "completed" && existing.status !== "completed") {
      await notifyTaskCompleted(
        id,
        existing.objective,
        existing.ownerId,
        user.id,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Task update error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = db
      .select()
      .from(researchTasks)
      .where(eq(researchTasks.id, id))
      .get();
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    db.delete(researchTasks).where(eq(researchTasks.id, id)).run();

    await logAction({
      userId: user.id,
      action: "DELETE_TASK",
      targetType: "task",
      targetId: id,
      previousValue: JSON.stringify(existing),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Task delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
