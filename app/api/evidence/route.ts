import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { evidence } from "@/db/schema";
import { like, desc, sql, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { enqueueEvidenceJob } from "@/lib/worker";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const tag = searchParams.get("tag") || "";
    const sourceType = searchParams.get("sourceType") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db.select().from(evidence);

    if (search) {
      query = query.where(like(evidence.title, `%${search}%`)) as any;
    }
    if (tag) {
      query = query.where(like(evidence.tags, `%${tag}%`)) as any;
    }
    if (sourceType) {
      query = query.where(eq(evidence.sourceType, sourceType)) as any;
    }

    const items = query
      .orderBy(desc(evidence.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const count = db
      .select({ count: sql`count(*)` })
      .from(evidence)
      .get();

    return NextResponse.json({ evidence: items, total: count?.count || 0 });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Evidence list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch evidence" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const {
      title,
      summary,
      source,
      sourceType,
      publicationDate,
      confidence,
      tags,
      content,
    } = body;

    if (!title || !source || !sourceType) {
      return NextResponse.json(
        { error: "Title, source, and source type are required" },
        { status: 400 },
      );
    }

    const result = db
      .insert(evidence)
      .values({
        title,
        summary: summary || "",
        source,
        sourceType,
        publicationDate: publicationDate || null,
        confidence: confidence || 0.5,
        tags: JSON.stringify(tags || []),
        aiMetadata: JSON.stringify({}),
        createdBy: user.id,
      })
      .returning()
      .get();

    await logAction({
      userId: user.id,
      action: "UPLOAD_EVIDENCE",
      targetType: "evidence",
      targetId: result.id,
      newValue: JSON.stringify({ title, source, sourceType }),
    });

    let jobId: string | undefined;
    if (content && content.trim().length >= 10) {
      jobId = enqueueEvidenceJob(result.id, content, user.id);
    }

    return NextResponse.json({ evidence: result, jobId });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Evidence create error:", error);
    return NextResponse.json(
      { error: "Failed to create evidence" },
      { status: 500 },
    );
  }
}
