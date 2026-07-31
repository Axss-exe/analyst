"use client"

import useSWR from "swr"

export interface NotificationItem {
  id: number
  type: string
  title: string
  message: string
  relatedObjectType: string | null
  relatedObjectId: number | null
  isRead: boolean
  createdAt: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useNotifications() {
  const { data, mutate } = useSWR("/api/notifications", fetcher, {
    refreshInterval: 60000,   // 1 minute (was 30s)
    revalidateOnFocus: true,
    dedupingInterval: 30000,
  })

  const notifications = data?.notifications || []
  const unreadCount = data?.unreadCount || 0

  const markRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" })
    mutate()
  }

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" })
    mutate()
  }

  return { notifications, unreadCount, loading: !data, markRead, markAllRead, refresh: () => mutate() }
}
