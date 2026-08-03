import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  entities,
  evidenceEntities,
  evidence,
  relationships,
} from "@/db/schema";
import { eq, like, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = db.select().from(entities);
    if (search) query = query.where(like(entities.name, `%${search}%`)) as any;
    if (type) query = query.where(eq(entities.type, type)) as any;

    const items = query
      .orderBy(desc(entities.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(entities)
      .get();

    return NextResponse.json({ entities: items, total: count?.count || 0 });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Entities list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch entities" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { name, type, aliases, metadata } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type required" },
        { status: 400 },
      );
    }

    const existing = db
      .select()
      .from(entities)
      .where(eq(entities.name, name))
      .get();
    if (existing) {
      return NextResponse.json(
        { error: "Entity with this name already exists", entity: existing },
        { status: 409 },
      );
    }

    const result = db
      .insert(entities)
      .values({
        name,
        type,
        aliases: JSON.stringify(aliases || []),
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdBy: user.id,
      })
      .returning()
      .get();

    await logAction({
      userId: user.id,
      action: "CREATE_ENTITY",
      targetType: "entity",
      targetId: result.id,
      newValue: JSON.stringify({ name, type }),
    });

    return NextResponse.json({ entity: result });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Entity create error:", error);
    return NextResponse.json(
      { error: "Failed to create entity" },
      { status: 500 },
    );
  }
}
