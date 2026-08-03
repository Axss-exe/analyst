import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  relatedObjectType?: string;
  relatedObjectId?: number;
}) {
  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    relatedObjectType: params.relatedObjectType,
    relatedObjectId: params.relatedObjectId,
  });
}

export async function notifyStoryUpdate(
  storyId: number,
  storyTitle: string,
  updaterId: number,
) {
  const allUsers = db
    .select({ id: notifications.userId })
    .from(notifications)
    .all();
  const uniqueUsers = [...new Set(allUsers.map((u) => u.id))].filter(
    (id) => id !== updaterId,
  );

  for (const userId of uniqueUsers) {
    await createNotification({
      userId,
      type: "story_update",
      title: "Story Updated",
      message: `Story "${storyTitle}" has been updated.`,
      relatedObjectType: "story",
      relatedObjectId: storyId,
    });
  }
}

export async function notifyEvidenceLinked(
  evidenceId: number,
  evidenceTitle: string,
  storyId: number,
  storyTitle: string,
  actorId: number,
) {
  const allUsers = db
    .select({ id: notifications.userId })
    .from(notifications)
    .all();
  const uniqueUsers = [...new Set(allUsers.map((u) => u.id))].filter(
    (id) => id !== actorId,
  );

  for (const userId of uniqueUsers) {
    await createNotification({
      userId,
      type: "evidence_linked",
      title: "Evidence Linked",
      message: `"${evidenceTitle}" was linked to "${storyTitle}".`,
      relatedObjectType: "story",
      relatedObjectId: storyId,
    });
  }
}

export async function notifyBriefGenerated(
  briefId: number,
  headline: string,
  storyId: number,
  storyTitle: string,
  actorId: number,
) {
  const allUsers = db
    .select({ id: notifications.userId })
    .from(notifications)
    .all();
  const uniqueUsers = [...new Set(allUsers.map((u) => u.id))].filter(
    (id) => id !== actorId,
  );

  for (const userId of uniqueUsers) {
    await createNotification({
      userId,
      type: "brief_generated",
      title: "Brief Generated",
      message: `New brief "${headline}" generated for "${storyTitle}".`,
      relatedObjectType: "brief",
      relatedObjectId: briefId,
    });
  }
}

export async function notifyTaskAssigned(
  taskId: number,
  objective: string,
  ownerId: number,
  assignerId: number,
) {
  await createNotification({
    userId: ownerId,
    type: "task_assigned",
    title: "Task Assigned",
    message: `You have been assigned: "${objective}"`,
    relatedObjectType: "task",
    relatedObjectId: taskId,
  });
}

export async function notifyTaskCompleted(
  taskId: number,
  objective: string,
  ownerId: number,
  completerId: number,
) {
  const allUsers = db
    .select({ id: notifications.userId })
    .from(notifications)
    .all();
  const uniqueUsers = [...new Set(allUsers.map((u) => u.id))].filter(
    (id) => id !== completerId,
  );

  for (const userId of uniqueUsers) {
    await createNotification({
      userId,
      type: "task_completed",
      title: "Task Completed",
      message: `"${objective}" has been completed.`,
      relatedObjectType: "task",
      relatedObjectId: taskId,
    });
  }
}
