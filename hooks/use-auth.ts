"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "analyst";
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useAuth() {
  const router = useRouter();
  const { data, error, mutate } = useSWR("/api/auth/session", fetcher, {
    refreshInterval: 300000,
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    shouldRetryOnError: false,
  });

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout fetch failed:", e);
    }
    mutate(null, false);
    router.push("/login");
  };

  return {
    user: data?.user || null,
    loading: !error && !data,
    error: error ? (error as Error).message : null,
    logout,
    isAdmin: data?.user?.role === "admin",
  };
}
