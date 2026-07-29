"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

export interface AuthUser {
  id: number
  email: string
  name: string
  role: "admin" | "analyst"
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.user) setUser(data.user)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
    router.push("/login")
    router.refresh()
  }

  return { user, loading, logout, isAdmin: user?.role === "admin" }
}
