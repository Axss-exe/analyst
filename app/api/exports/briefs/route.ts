import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { generatedBriefs } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    let body: { ids?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const ids = body?.ids;

    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return NextResponse.json(
        { error: "A non-empty array of brief IDs is required" },
        { status: 400 },
      );
    }

    const uniqueIds = Array.from(new Set(ids));
    const records = db
      .select({
        id: generatedBriefs.id,
        storyId: generatedBriefs.storyId,
        headline: generatedBriefs.headline,
        content: generatedBriefs.content,
        version: generatedBriefs.version,
        generationMode: generatedBriefs.generationMode,
        evidenceIds: generatedBriefs.evidenceIds,
        templateId: generatedBriefs.templateId,
        promptVersion: generatedBriefs.promptVersion,
        llmModel: generatedBriefs.llmModel,
        createdBy: generatedBriefs.createdBy,
        createdAt: generatedBriefs.createdAt,
      })
      .from(generatedBriefs)
      .where(inArray(generatedBriefs.id, uniqueIds))
      .all();

    if (records.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more briefs were not found" },
        { status: 404 },
      );
    }

    const recordsById = new Map(records.map((record) => [record.id, record]));
    return NextResponse.json({
      exportType: "rita-briefs",
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      records: uniqueIds.map((id) => recordsById.get(id)),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Brief export error:", error);
    return NextResponse.json(
      { error: "Failed to export briefs" },
      { status: 500 },
    );
  }
}