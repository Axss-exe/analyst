import { NextResponse } from "next/server"
import { clearSessionCookie, getCurrentUser } from "@/lib/auth"
import { logAction } from "@/lib/audit"

export async function POST() {
  try {
    const user = await getCurrentUser()
    if (user) {
      await logAction({
        userId: user.id,
        action: "LOGOUT",
        targetType: "user",
        targetId: user.id,
      })
    }
    clearSessionCookie()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Logout failed" }, { status: 500 })
  }
}
