import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || "atis-default-secret-key-change-me")

const STATIC_PATHS = ["/_next", "/favicon.ico", "/uploads"]
const PUBLIC_PATHS = ["/login", "/register"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (STATIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get("atis_session")?.value

  if (PUBLIC_PATHS.includes(pathname)) {
    if (token) {
      try {
        await jwtVerify(token, SECRET, { clockTolerance: 60 })
        return NextResponse.redirect(new URL("/dashboard", request.url))
      } catch { /* invalid token, allow access */ }
    }
    return NextResponse.next()
  }

  if (!token) return NextResponse.redirect(new URL("/login", request.url))

  try {
    await jwtVerify(token, SECRET, { clockTolerance: 60 })
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL("/login", request.url))
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\..*$).*)"],
}
