import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { templates } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const items = db
      .select()
      .from(templates)
      .orderBy(desc(templates.createdAt))
      .all();
    return NextResponse.json({ templates: items });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Templates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { name, type, config } = body;

    if (!name || !type || !config) {
      return NextResponse.json(
        { error: "Name, type, and config required" },
        { status: 400 },
      );
    }

    const result = db
      .insert(templates)
      .values({
        name,
        type,
        config: JSON.stringify(config),
        createdBy: user.id,
      })
      .returning()
      .get();

    await logAction({
      userId: user.id,
      action: "CREATE_TEMPLATE",
      targetType: "template",
      targetId: result.id,
      newValue: JSON.stringify({ name, type }),
    });

    return NextResponse.json({ template: result });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Template create error:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 },
    );
  }
}
