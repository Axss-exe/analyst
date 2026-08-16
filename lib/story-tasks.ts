/**
 * ATIS Story Continuity — Automatic Research Task Generator
 *
 * Converts gap analysis into concrete, prioritized research tasks
 * linked to a specific story.
 */
import { db } from "@/db";
import { researchTasks, stories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { analyzeStoryGaps, type StoryGap, type GapAnalysis } from "./story-gaps";

export interface GeneratedTask {
  id?: number;
  objective: string;
  priority: "low" | "medium" | "high" | "critical";
  storyId: number;
  reason: string;
  gapType: string;
}

/**
 * Generate research tasks from a story's gaps.
 * Skips duplicates (objective substring match against existing tasks).
 */
export async function generateTasksFromGaps(
  storyId: number,
  existingAnalysis?: GapAnalysis,
): Promise<GeneratedTask[]> {
  const analysis = existingAnalysis || (await analyzeStoryGaps(storyId));
  const generated: GeneratedTask[] = [];

  if (analysis.gaps.length === 0) return generated;

  // Load existing tasks for deduplication
  const existingTasks = db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.storyId, storyId))
    .all();

  for (const gap of analysis.gaps) {
    // Skip if a similar task already exists
    const similarExists = existingTasks.some((t) => {
      const existingObj = t.objective.toLowerCase();
      const newObj = gap.suggestedQuestion.toLowerCase();
      return (
        existingObj.includes(newObj.substring(0, 40)) ||
        newObj.includes(existingObj.substring(0, 40))
      );
    });
    if (similarExists) continue;

    const priority: GeneratedTask["priority"] =
      gap.severity === "critical"
        ? "critical"
        : gap.severity === "high"
          ? "high"
          : gap.severity === "medium"
            ? "medium"
            : "low";

    const result = db
      .insert(researchTasks)
      .values({
        objective: gap.suggestedQuestion,
        priority,
        ownerId: 1, // TODO: derive from story owner or session
        status: "open",
        storyId,
        createdBy: 1,
      })
      .run();

    generated.push({
      id: Number(result.lastInsertRowid),
      objective: gap.suggestedQuestion,
      priority,
      storyId,
      reason: `${gap.type}: ${gap.description}`,
      gapType: gap.type,
    });
  }

  // Bump story updatedAt so the page knows something changed
  if (generated.length > 0) {
    db.update(stories)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(stories.id, storyId))
      .run();
  }

  return generated;
}

/**
 * Fetch all research tasks for a story, ordered by priority.
 */
export async function getTasksForStory(storyId: number) {
  const rows = db
    .select()
    .from(researchTasks)
    .where(eq(researchTasks.storyId, storyId))
    .all();

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return rows.sort(
    (a, b) =>
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4),
  );
}
