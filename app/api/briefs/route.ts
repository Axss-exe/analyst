import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  stories,
  evidence,
  storyEvidence,
  generatedBriefs,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

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
    const { storyId, mode = "full", templateId } = body;

    if (!storyId) {
      return NextResponse.json(
        { error: "Story ID required" },
        { status: 400 },
      );
    }

    const story = db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId))
      .get();
    if (!story) {
      return NextResponse.json(
        { error: "Story not found" },
        { status: 404 },
      );
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

    // Try to use existing AI brief generator
    let briefData: any;
    try {
      const { generateBriefContent } = await import("@/lib/ai/stories");
      briefData = await generateBriefContent({
        storyTitle: story.title,
        storyOverview: story.overview,
        evidenceItems: evidenceItems.map((e) => ({
          title: e.title,
          summary: (e.content || e.summary || "").substring(0, 800) || e.title,
          source: e.source,
        })),
        mode,
      });
    } catch (aiErr) {
      console.warn("AI brief generation failed, using fallback:", aiErr);
      const summaries = evidenceItems
        .map((e) => `- ${e.title}: ${(e.content || e.summary || "").substring(0, 300)}...`)
        .join("\n\n");
      briefData = {
        headline: `Brief: ${story.title}`,
        executiveSummary: story.overview || "No overview available.",
        detailedNarrative: `This brief is based on ${evidenceItems.length} evidence items.\n\n${summaries}`,
        keyFindings: evidenceItems.map((e) => e.title),
        references: evidenceItems.map((e) => ({ title: e.title, source: e.source })),
      };
    }

    const contentPayload = {
      executiveSummary: briefData.executiveSummary || "",
      detailedNarrative: briefData.detailedNarrative || "",
      keyFindings: briefData.keyFindings || [],
      references: briefData.references || [],
    };

    const result = db
      .insert(generatedBriefs)
      .values({
        storyId,
        headline: briefData.headline || `Brief: ${story.title}`,
        content: JSON.stringify(contentPayload),
        generationMode: mode,
        evidenceIds: JSON.stringify(evidenceIds),
        templateId: templateId || null,
        llmModel: process.env.CEREBRAS_MODEL || "llama3.1-70b",
        createdBy: user.id,
      })
      .run();

    const briefId = Number(result.lastInsertRowid);

    // Create notification (best effort)
    try {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        userId: user.id,
        type: "brief_generated",
        title: "Brief Generated",
        message: `A new ${mode} brief was generated for "${story.title}"`,
        relatedObjectType: "brief",
        relatedObjectId: briefId,
      });
    } catch (notifErr) {
      console.warn("Notification creation failed:", notifErr);
    }

    return NextResponse.json({
      success: true,
      brief: {
        id: briefId,
        storyId,
        headline: briefData.headline,
        ...contentPayload,
        mode,
        createdAt: new Date().toISOString(),
      },
    });
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
