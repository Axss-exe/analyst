import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { stories, storyEvidence, evidence } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { scoreEvidenceAgainstStory } from "@/lib/story-matcher";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid story ID" }, { status: 400 });
    }

    const body = await request.json();
    const evidenceId = parseInt(body.evidenceId, 10);
    if (isNaN(evidenceId)) {
      return NextResponse.json(
        { error: "Invalid evidenceId" },
        { status: 400 },
      );
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

    const [ev] = db
      .select()
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
      .all();
    if (!ev) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 },
      );
    }

    const { score, reasons } = await scoreEvidenceAgainstStory(evidenceId, id);

    // Check if already linked
    const existing = db
      .select()
      .from(storyEvidence)
      .where(
        sql`${storyEvidence.storyId} = ${id} AND ${storyEvidence.evidenceId} = ${evidenceId}`,
      )
      .get();

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyAttached: true,
        relevanceScore: score,
        reasons,
      });
    }

    const relationshipType =
      score >= 0.7 ? "strong_match" : score >= 0.5 ? "match" : "related";

    db.insert(storyEvidence)
      .values({
        storyId: id,
        evidenceId,
        confidence: score,
        relationshipType,
      })
      .run();

    db.update(stories)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(stories.id, id))
      .run();

    return NextResponse.json({
      success: true,
      relevanceScore: score,
      relationshipType,
      reasons,
    });
  } catch (error: any) {
    console.error("[attach-evidence] error:", error);
    return NextResponse.json(
      { error: error.message || "Attachment failed" },
      { status: 500 },
    );
  }
}
