"use client"

import useSWR from "swr"
import { useRouter } from "next/navigation"

export interface AuthUser {
  id: number
  email: string
  name: string
  role: "admin" | "analyst"
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useAuth() {
  const router = useRouter()
  const { data, error, mutate } = useSWR("/api/auth/session", fetcher, {
    refreshInterval: 300000,      // 5 minutes
    revalidateOnFocus: false,     // don't refetch on tab focus
    dedupingInterval: 60000,      // dedupe requests within 1 min
  })

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    mutate(null, false)
    router.push("/login")
  }

  return {
    user: data?.user || null,
    loading: !error && !data,
    logout,
    isAdmin: data?.user?.role === "admin",
  }
}
