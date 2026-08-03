"use client";

import useSWR from "swr";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  relatedObjectType: string | null;
  relatedObjectId: number | null;
  isRead: boolean;
  createdAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useNotifications() {
  const { data, mutate, error } = useSWR("/api/notifications", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
    dedupingInterval: 30000,
    shouldRetryOnError: false,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  const markRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      mutate();
    } catch (e) {
      console.warn("markRead failed:", e);
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
      });
      if (!res.ok) {
        console.warn("markAllRead returned", res.status);
        return;
      }
      mutate();
    } catch (e) {
      console.warn("markAllRead failed:", e);
    }
  };

  return {
    notifications,
    unreadCount,
    loading: !data && !error,
    error,
    markRead,
    markAllRead,
    refresh: () => mutate(),
  };
}
