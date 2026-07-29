"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, Search, BookOpen, ArrowRight } from "lucide-react"

interface StoryItem {
  id: number
  title: string
  overview: string
  status: string
  evidenceCount: number
  updatedAt: string
}

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryItem[]>([])
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Stories</h1>
            <p className="text-sm text-muted-foreground">Intelligence narratives built from evidence</p>
          </div>
          <Link href="/stories/new">
            <Button><Plus className="mr-1 h-4 w-4" /> New Story</Button>
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
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
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground opacity-40" />
              <p className="mt-4 text-muted-foreground">No stories yet</p>
              <Link href="/stories/new" className="mt-2">
                <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Create your first story</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stories.map((story) => (
                  <TableRow key={story.id} className="cursor-pointer" onClick={() => router.push(`/stories/${story.id}`)}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{story.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{story.overview}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={story.status === "active" ? "default" : "secondary"} className="capitalize">
                        {story.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{story.evidenceCount} items</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(story.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
