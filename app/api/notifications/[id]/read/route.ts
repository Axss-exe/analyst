import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const id = parseInt(params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Mark read error:", error);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 },
    );
  }
}
