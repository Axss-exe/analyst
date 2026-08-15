import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  stories,
  evidence,
  storyEvidence,
  generatedBriefs,
  notifications,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { generateBriefContent } from "@/lib/ai/stories";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const storyId = searchParams.get("storyId");

    if (storyId) {
      const briefs = db
        .select()
        .from(generatedBriefs)
        .where(eq(generatedBriefs.storyId, parseInt(storyId)))
        .orderBy(desc(generatedBriefs.createdAt))
        .all();
      return NextResponse.json({ briefs });
    }

    const allBriefs = db
      .select()
      .from(generatedBriefs)
      .orderBy(desc(generatedBriefs.createdAt))
      .limit(50)
      .all();
    return NextResponse.json({ briefs: allBriefs });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Briefs list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch briefs" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { storyId, mode = "full" } = body;

    if (!storyId) {
      return NextResponse.json({ error: "Story ID required" }, { status: 400 });
    }

    const story = db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId))
      .get();
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    const linkedEvidence = db
      .select({ evidenceId: storyEvidence.evidenceId })
      .from(storyEvidence)
      .where(eq(storyEvidence.storyId, storyId))
      .all();

    const evidenceIds = linkedEvidence.map((le) => le.evidenceId);
    const evidenceItems = db
      .select()
      .from(evidence)
      .where(sql`${evidence.id} IN ${evidenceIds}`)
      .all();

    const briefData = await generateBriefContent({
      storyTitle: story.title,
      storyOverview: story.overview,
      evidenceItems: evidenceItems.map((e) => ({
        title: e.title,
        summary: e.content?.substring(0, 800) || e.title,
        source: e.source,
      })),
      mode,
    });

    const brief = db
      .insert(generatedBriefs)
      .values({
        storyId,
        headline: briefData.headline,
        executiveSummary: briefData.executiveSummary,
        detailedNarrative: briefData.detailedNarrative,
        keyFindings: JSON.stringify(briefData.keyFindings),
        references: JSON.stringify(briefData.references),
        mode,
        llmModel: process.env.CEREBRAS_MODEL || "llama3.1-70b",
        createdBy: user.id,
      })
      .returning()
      .get();

    await createNotification({
      userId: user.id,
      type: "brief_generated",
      title: "Brief Generated",
      message: `A new ${mode} brief was generated for "${story.title}"`,
      relatedObjectType: "brief",
      relatedObjectId: brief.id,
    });

    return NextResponse.json({ brief });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Brief generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief" },
      { status: 500 },
    );
  }
}
