"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Search, X } from "lucide-react"
import { Logo } from "@/components/logo"
import { useNotifications } from "@/hooks/use-notifications"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

export function Navbar() {
  const { unreadCount, notifications, markRead, markAllRead } = useNotifications()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  if (!user) return null

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
      setSearchOpen(false)
      setSearchQuery("")
    }
  }

  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-16 items-center justify-between border-b subtle-border bg-black/80 backdrop-blur-xl px-6">
      {/* Left: Breadcrumb / Search trigger */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3.5 py-2 text-sm text-[#86868b] transition-colors hover:bg-white/[0.06] hover:text-white w-72"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span>Search intelligence...</span>
          <kbd className="ml-auto hidden rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono text-[#86868b] lg:inline-block">
            /
          </kbd>
        </button>
      </div>

      {/* Right: Notifications */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#86868b] transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff453a] px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border subtle-border bg-[#0a0a0a] shadow-2xl shadow-black/50 overflow-hidden">
                <div className="flex items-center justify-between border-b subtle-border px-4 py-3">
                  <span className="text-sm font-medium text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-[#2997ff] hover:text-[#5ac8fa] transition-colors">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[#86868b]">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          markRead(n.id)
                          if (n.relatedObjectType && n.relatedObjectId) {
                            router.push(`/${n.relatedObjectType}s/${n.relatedObjectId}`)
                          }
                          setOpen(false)
                        }}
                        className={cn(
                          "flex w-full flex-col gap-0.5 border-b border-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]",
                          !n.isRead && "bg-[#2997ff]/[0.04]"
                        )}
                      >
                        <span className="text-sm font-medium text-white">{n.title}</span>
                        <span className="text-xs text-[#86868b] line-clamp-2">{n.message}</span>
                        <span className="text-[10px] text-[#86868b]/60 mt-0.5">{new Date(n.createdAt).toLocaleString()}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border subtle-border bg-[#0a0a0a] shadow-2xl overflow-hidden">
            <form onSubmit={handleSearch} className="flex items-center gap-3 px-4 py-3 border-b subtle-border">
              <Search className="h-5 w-5 text-[#86868b]" strokeWidth={1.8} />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search evidence, stories, entities..."
                className="flex-1 bg-transparent text-white text-base placeholder:text-[#86868b] outline-none"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="text-[#86868b] hover:text-white transition-colors">
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </form>
            <div className="px-4 py-3 text-xs text-[#86868b]">
              Press <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px]">Enter</kbd> to search
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
