import { NextRequest, NextResponse } from "next/server";
import { analyzeStoryGaps } from "@/lib/story-gaps";
import { generateTasksFromGaps } from "@/lib/story-tasks";
import { db } from "@/db/client";
import { stories } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid story ID" }, { status: 400 });
    }

    const [story] = db
      .select()
      .from(stories)
      .where(eq(stories.id, id))
      .all();

    if (!story) {
      return NextResponse.json(
        { error: "Story not found" },
        { status: 404 },
      );
    }

    const gaps = await analyzeStoryGaps(id);
    const tasks = await generateTasksFromGaps(id, gaps);

    return NextResponse.json({
      success: true,
      storyId: id,
      evidenceCount: gaps.evidenceCount,
      gaps: gaps.gaps,
      gapSummary: gaps.summary,
      tasksGenerated: tasks.length,
      tasks,
    });
  } catch (error: any) {
    console.error("[reevaluate] error:", error);
    return NextResponse.json(
      { error: error.message || "Re-evaluation failed" },
      { status: 500 },
    );
  }
}
