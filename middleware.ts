import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || "atis-default-secret-key-change-me")
const PUBLIC_PATHS = ["/login", "/register", "/api"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // If logged in and trying to access login/register, redirect to dashboard
    if (pathname === "/login" || pathname === "/register") {
      const token = request.cookies.get("atis_session")?.value
      if (token) {
        try {
          await jwtVerify(token, SECRET, { clockTolerance: 60 })
          return NextResponse.redirect(new URL("/dashboard", request.url))
        } catch {
          // invalid token, allow access to login
        }
      }
    }
    return NextResponse.next()
  }

  // Check auth for protected paths
  const token = request.cookies.get("atis_session")?.value
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  try {
    await jwtVerify(token, SECRET, { clockTolerance: 60 })
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL("/login", request.url))
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|.*\.png$|.*\.svg$).*)"],
}
