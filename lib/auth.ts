import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "atis-default-secret-key-change-me",
);

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "analyst";
}

export async function createSession(userId: number): Promise<string> {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
  return token;
}

export async function verifySession(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { clockTolerance: 60 });
    const userId = Number(payload.sub);
    if (!userId) return null;

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || user.isBlocked) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "admin" | "analyst",
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get("atis_session")?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
  return user;
}

export function setSessionCookie(token: string, remember: boolean = false) {
  const cookieStore = cookies();
  cookieStore.set("atis_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set("atis_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
