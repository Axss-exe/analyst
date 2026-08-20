import { db } from "@/db";
import { storyEvidence, stories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildSimpleStoryGraph } from "./worker"; // Re-use the graph building logic from the worker

/**
 * Reprocesses a story by re-running the graph building and story generation logic
 * for all evidence currently associated with it.
 *
 * @param storyId The ID of the story to reprocess.
 */
export async function reprocessStory(storyId: number): Promise<{ success: boolean; evidenceCount: number; message: string }> {
  console.log(`[reprocessStory] Starting reprocessing for story ${storyId}`);

  // 1. Get all evidence IDs for the story
  const evidenceLinks = db
    .select({ evidenceId: storyEvidence.evidenceId })
    .from(storyEvidence)
    .where(eq(storyEvidence.storyId, storyId))
    .all();

  const evidenceIds = evidenceLinks.map((l) => l.evidenceId);

  if (evidenceIds.length === 0) {
    console.log(`[reprocessStory] Story ${storyId} has no evidence. Aborting.`);
    return { success: false, evidenceCount: 0, message: "Story has no evidence to process." };
  }

  console.log(`[reprocessStory] Found ${evidenceIds.length} evidence items for story ${storyId}.`);

  try {
    // 2. Re-run the simple graph building process for this subset of evidence
    // This function is idempotent and will update existing stories/candidates
    await buildSimpleStoryGraph(evidenceIds);

    // 3. Update the story's updatedAt timestamp
    db.update(stories)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(stories.id, storyId))
      .run();

    console.log(`[reprocessStory] Successfully reprocessed story ${storyId}.`);
    return { success: true, evidenceCount: evidenceIds.length, message: "Story reprocessed successfully." };

  } catch (error: any) {
    console.error(`[reprocessStory] Error during reprocessing of story ${storyId}:`, error);
    return { success: false, evidenceCount: evidenceIds.length, message: error.message || "An unknown error occurred during reprocessing." };
  }
}
