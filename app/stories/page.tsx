"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Plus, Sparkles, BookOpen } from "lucide-react"

export default function StoriesPage() {
  const [stories, setStories] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchStories()
  }, [])

  const fetchStories = async (q = "") => {
    setLoading(true)
    const res = await fetch(`/api/stories?search=${encodeURIComponent(q)}&limit=100`)
    const data = await res.json()
    setStories(data.stories || [])
    setLoading(false)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchStories(search)
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Stories</h1>
            <p className="text-sm text-muted-foreground">Intelligence narratives built from connected evidence</p>
          </div>
          <div className="flex gap-2">
            <Link href="/discover">
              <Button variant="outline" size="sm">
                <Sparkles className="mr-1 h-4 w-4 text-amber-400" /> Discover Stories
              </Button>
            </Link>
            <Link href="/stories/new">
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New Story</Button>
            </Link>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </form>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : stories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
              <p className="mt-3 text-muted-foreground">No stories yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Stories emerge from connected evidence. Upload evidence and run Story Discovery to automatically find narratives.
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Link href="/discover">
                  <Button variant="outline" size="sm"><Sparkles className="mr-1 h-4 w-4" /> Discover Stories</Button>
                </Link>
                <Link href="/evidence/new">
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add Evidence</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {stories.map((story: any) => (
              <Card
                key={story.id}
                className="cursor-pointer transition-colors hover:bg-accent"
                onClick={() => router.push(`/stories/${story.id}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{story.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{story.overview}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={story.status === "active" ? "default" : "secondary"} className="text-[10px] capitalize">
                        {story.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{story.evidenceCount} evidence</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(story.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
