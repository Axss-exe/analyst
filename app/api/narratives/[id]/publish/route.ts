import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { narratives, narrativeChecks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);

    const [latestCheck] = db
      .select()
      .from(narrativeChecks)
      .where(eq(narrativeChecks.narrativeId, id))
      .orderBy(desc(narrativeChecks.checkedAt))
      .all();

    if (!latestCheck) {
      return NextResponse.json(
        { error: "Run the story checker before publishing" },
        { status: 400 }
      );
    }
    if (latestCheck.status !== "passed") {
      return NextResponse.json(
        { error: "Latest check failed. Fix issues before publishing.", issues: JSON.parse(latestCheck.issues || "[]") },
        { status: 400 }
      );
    }

    db.update(narratives)
      .set({ status: "published", updatedAt: new Date().toISOString() })
      .where(eq(narratives.id, id))
      .run();

    return NextResponse.json({ success: true, message: "Narrative published" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
