import { NextRequest, NextResponse } from "next/server";
import { analyzeStoryGaps } from "@/lib/story-gaps";
import { reconcileResearchTasks } from "@/lib/story-tasks";
import { regenerateExistingStory } from "@/lib/story-regeneration";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid story ID" }, { status: 400 });
    }

    let regeneratedStory;
    try {
      regeneratedStory = await regenerateExistingStory(id);
    } catch (error: any) {
      const status = error.message === "Story not found" ? 404 : 500;
      return NextResponse.json(
        { success: false, regeneration: { success: false }, error: error.message || "Story regeneration failed" },
        { status },
      );
    }

    try {
      const gaps = await analyzeStoryGaps(id);
      const reconciled = await reconcileResearchTasks(id, gaps);
      const tasks = reconciled.tasks;

      return NextResponse.json({
        success: true,
        storyId: id,
        story: regeneratedStory,
        regeneration: { success: true },
        evidenceCount: reconciled.analysis.evidenceCount,
        gaps: reconciled.analysis.gaps,
        gapSummary: reconciled.analysis.summary,
        tasksGenerated: tasks.length,
        tasks,
      });
    } catch (error: any) {
      console.error("[reevaluate] gap/task processing error:", error);
      return NextResponse.json(
        {
          success: false,
          storyId: id,
          story: regeneratedStory,
          regeneration: { success: true },
          analysis: { success: false, error: error.message || "Gap analysis failed" },
          error: "Story regenerated, but gap and task processing failed",
        },
        { status: 207 },
      );
    }
  } catch (error: any) {
    console.error("[reevaluate] error:", error);
    return NextResponse.json(
      { error: error.message || "Re-evaluation failed" },
      { status: 500 },
    );
  }
}
