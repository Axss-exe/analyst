import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { users, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession, setSessionCookie } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, password, inviteCode } = body;

    if (!email || !name || !password || !inviteCode) {
      return NextResponse.json(
        { error: "All fields required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const inviteSetting = db
      .select()
      .from(settings)
      .where(eq(settings.key, "invite_code"))
      .get();
    const validCode =
      inviteSetting?.value || process.env.REGISTRATION_INVITE_CODE;

    if (inviteCode !== validCode) {
      return NextResponse.json(
        { error: "Invalid invitation code" },
        { status: 403 },
      );
    }

    const existing = db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        role: "analyst",
      })
      .returning()
      .get();

    const token = await createSession(result.id);
    setSessionCookie(token);

    await logAction({
      userId: result.id,
      action: "REGISTER",
      targetType: "user",
      targetId: result.id,
    });

    return NextResponse.json({
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
