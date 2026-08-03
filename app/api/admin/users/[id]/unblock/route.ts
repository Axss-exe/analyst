import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const admin = await requireAdmin();
    const id = parseInt(params.id);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = db.select().from(users).where(eq(users.id, id)).get();
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    db.update(users).set({ isBlocked: false }).where(eq(users.id, id)).run();

    await logAction({
      userId: admin.id,
      action: "UNBLOCK_USER",
      targetType: "user",
      targetId: id,
      previousValue: JSON.stringify({ isBlocked: existing.isBlocked }),
      newValue: JSON.stringify({ isBlocked: false }),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden: Admin access required")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Unblock user error:", error);
    return NextResponse.json(
      { error: "Failed to unblock user" },
      { status: 500 },
    );
  }
}
