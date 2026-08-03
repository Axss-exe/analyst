import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { generatedBriefs, stories, templates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const brief = db
      .select()
      .from(generatedBriefs)
      .where(eq(generatedBriefs.id, id))
      .get();
    if (!brief)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const story = db
      .select()
      .from(stories)
      .where(eq(stories.id, brief.storyId))
      .get();
    const template = brief.templateId
      ? db
          .select()
          .from(templates)
          .where(eq(templates.id, brief.templateId))
          .get()
      : null;

    let content = brief.content;
    try {
      content = JSON.parse(brief.content);
    } catch {
      // keep as string
    }

    return NextResponse.json({
      brief: { ...brief, content },
      story,
      template,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Brief detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch brief" },
      { status: 500 },
    );
  }
}
