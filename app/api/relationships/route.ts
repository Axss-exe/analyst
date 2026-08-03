import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { relationships, entities } from "@/db/schema";
import { eq, or, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId");
    const type = searchParams.get("type") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 1000);

    let query = db.select().from(relationships);
    if (entityId) {
      const eid = parseInt(entityId);
      query = query.where(
        or(eq(relationships.sourceId, eid), eq(relationships.targetId, eid)),
      ) as any;
    }
    if (type) query = query.where(eq(relationships.type, type)) as any;

    const items = query
      .orderBy(desc(relationships.createdAt))
      .limit(limit)
      .all();
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(relationships)
      .get();

    return NextResponse.json({
      relationships: items,
      total: count?.count || 0,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Relationships list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch relationships" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { sourceId, targetId, type, confidence, evidenceIds } = body;

    if (!sourceId || !targetId || !type) {
      return NextResponse.json(
        { error: "Source, target, and type required" },
        { status: 400 },
      );
    }

    const source = db
      .select()
      .from(entities)
      .where(eq(entities.id, sourceId))
      .get();
    const target = db
      .select()
      .from(entities)
      .where(eq(entities.id, targetId))
      .get();
    if (!source || !target) {
      return NextResponse.json(
        { error: "Source or target entity not found" },
        { status: 404 },
      );
    }

    const result = db
      .insert(relationships)
      .values({
        sourceId,
        targetId,
        type,
        confidence: confidence || 0.5,
        evidenceIds: JSON.stringify(evidenceIds || []),
        createdBy: user.id,
      })
      .returning()
      .get();

    await logAction({
      userId: user.id,
      action: "CREATE_RELATIONSHIP",
      targetType: "relationship",
      targetId: result.id,
      newValue: JSON.stringify({ sourceId, targetId, type }),
    });

    return NextResponse.json({ relationship: result });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Relationship create error:", error);
    return NextResponse.json(
      { error: "Failed to create relationship" },
      { status: 500 },
    );
  }
}
