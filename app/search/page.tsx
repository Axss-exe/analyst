"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Search, FileText, BookOpen, Users, ClipboardList, Newspaper, Clock, ArrowRight } from "lucide-react"

interface SearchResult {
  type: string
  id: number
  title: string
  snippet: string
  date: string
}

const typeIcons: Record<string, any> = {
  evidence: FileText, story: BookOpen, entity: Users, task: ClipboardList, brief: Newspaper, timeline: Clock,
}

const typeColors: Record<string, string> = {
  evidence: "bg-blue-500/20 text-blue-400", story: "bg-amber-500/20 text-amber-400", entity: "bg-emerald-500/20 text-emerald-400",
  task: "bg-purple-500/20 text-purple-400", brief: "bg-rose-500/20 text-rose-400", timeline: "bg-cyan-500/20 text-cyan-400",
}

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [type, setType] = useState("all")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const router = useRouter()

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setSearched(true)
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${type}&limit=50`)
    const data = await res.json()
    setResults(data.results || [])
    setLoading(false)
  }

  const getUrl = (result: SearchResult) => {
    if (result.type === "timeline") return `/timeline?eventId=${result.id}`
    return `/${result.type}s/${result.id}`
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Universal Search</h1>
          <p className="text-sm text-muted-foreground">Search across all intelligence data</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input placeholder="Search evidence, stories, entities, tasks, briefs, timeline..." value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1" autoFocus />
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All</option>
            <option value="evidence">Evidence</option>
            <option value="stories">Stories</option>
            <option value="entities">Entities</option>
            <option value="tasks">Tasks</option>
            <option value="briefs">Briefs</option>
            <option value="timeline">Timeline</option>
          </select>
          <Button type="submit" disabled={loading}>{loading ? "Searching..." : <><Search className="mr-1 h-4 w-4" /> Search</>}</Button>
        </form>

        {searched && results.length === 0 && !loading && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No results found for "{query}"</CardContent></Card>
        )}

        <div className="space-y-2">
          {results.map((result) => {
            const Icon = typeIcons[result.type] || Search
            return (
              <Card key={`${result.type}-${result.id}`} className="cursor-pointer transition-colors hover:bg-accent" onClick={() => router.push(getUrl(result))}>
                <CardContent className="flex items-start gap-3 py-3">
                  <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <Badge className={`text-[10px] capitalize ${typeColors[result.type] || "bg-muted"}`}>{result.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{result.snippet}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
