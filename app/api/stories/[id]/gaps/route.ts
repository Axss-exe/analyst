import { NextRequest, NextResponse } from "next/server";
import { analyzeStoryGaps } from "@/lib/story-gaps";
import { db } from "@/db/client";
import { stories } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
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

    return NextResponse.json({
      storyId: id,
      evidenceCount: gaps.evidenceCount,
      gaps: gaps.gaps,
      summary: gaps.summary,
    });
  } catch (error: any) {
    console.error("[gaps] error:", error);
    return NextResponse.json(
      { error: error.message || "Gap analysis failed" },
      { status: 500 },
    );
  }
}
