import { NextRequest, NextResponse } from "next/server";
import { inArray, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    let body: { ids?: unknown; all?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (body?.all === true && body.ids !== undefined) {
      return NextResponse.json(
        { error: "Use either all or ids, not both" },
        { status: 400 },
      );
    }

    let records;
    if (body?.all === true) {
      records = db
        .select()
        .from(entities)
        .orderBy(desc(entities.createdAt))
        .all();
    } else {
      const ids = body?.ids;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.some((id) => !Number.isInteger(id) || id <= 0)
      ) {
        return NextResponse.json(
          { error: "A non-empty array of entity IDs is required" },
          { status: 400 },
        );
      }

      const uniqueIds = Array.from(new Set(ids));
      const selectedRecords = db
        .select()
        .from(entities)
        .where(inArray(entities.id, uniqueIds))
        .all();

      if (selectedRecords.length !== uniqueIds.length) {
        return NextResponse.json(
          { error: "One or more entities were not found" },
          { status: 404 },
        );
      }

      const recordsById = new Map(
        selectedRecords.map((record) => [record.id, record]),
      );
      records = uniqueIds.map((id) => recordsById.get(id));
    }

    return NextResponse.json({
      exportType: "rita-entities",
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      records,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Entity export error:", error);
    return NextResponse.json(
      { error: "Failed to export entities" },
      { status: 500 },
    );
  }
}