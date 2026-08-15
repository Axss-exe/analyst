"use client"

import { useState } from "react"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2,
  Sparkles,
  GitBranch,
  Users,
  FileText,
  CheckCircle,
  Network,
  BookOpen,
  Plus,
  AlertCircle,
} from "lucide-react"

interface ClusterView {
  id: number
  name: string
  description: string
  density: number
  status: "new" | "strengthened" | "merged" | "stable" | "candidate"
  evidenceCount: number
  entityCount: number
  evidenceIds: number[]
  entityIds: number[]
  narrative?: { title: string; overview: string; confidence: number } | null
}

export default function DiscoverPage() {
  const [clusters, setClusters] = useState<ClusterView[]>([])
  const [unlinkedCount, setUnlinkedCount] = useState(0)
  const [clusteredCount, setClusteredCount] = useState(0)
  const [totalNarratives, setTotalNarratives] = useState(0)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<number | null>(null)
  const [created, setCreated] = useState<number[]>([])
  const [filter, setFilter] = useState<"all" | "new" | "strengthened" | "stable" | "candidate">("all")

  const runDiscovery = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/discover")
      const data = await res.json()
      if (res.ok) {
        setClusters(data.clusters || [])
        setUnlinkedCount(data.unlinkedCount || 0)
        setClusteredCount(data.clusteredCount || 0)
        setTotalNarratives(data.totalNarratives || 0)
      }
    } catch {
      alert("Discovery failed")
    }
    setLoading(false)
  }

  const createStory = async (cluster: ClusterView, index: number) => {
    setCreating(index)
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cluster.narrative?.title || cluster.name,
          overview: cluster.narrative?.overview || cluster.description,
          evidenceIds: cluster.evidenceIds,
        }),
      })
      if (res.ok) {
        setCreated((prev) => [...prev, index])
      } else {
        alert("Failed to create story")
      }
    } catch {
      alert("Network error")
    }
    setCreating(null)
  }

  const filtered = clusters.filter((c) => {
    if (filter === "all") return true
    return c.status === filter
  })

  const statusVariant = (status: string) => {
    switch (status) {
      case "new": return "default"
      case "strengthened": return "secondary"
      case "merged": return "destructive"
      case "stable": return "outline"
      default: return "outline"
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header — matches Stories page exactly */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Network className="h-6 w-6 text-indigo-400" />
              Story Discovery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Graph-driven discovery: clusters, hidden paths, and emerging narratives
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={runDiscovery} disabled={loading} size="sm">
              {loading ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Analyzing...</>
              ) : (
                <><Sparkles className="mr-1 h-4 w-4" /> Run Discovery</>
              )}
            </Button>
            <Link href="/stories/new">
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" /> New Story
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats bar — matches Stories metadata pattern */}
        {clusters.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{unlinkedCount} unlinked</Badge>
            <Badge variant="outline">{clusteredCount} clustered</Badge>
            <Badge variant="outline">{clusters.length} clusters</Badge>
            <Badge variant="outline">{totalNarratives} narratives</Badge>
          </div>
        )}

        {/* Filter tabs — matches Stories page All/Manual/Auto pattern */}
        {clusters.length > 0 && (
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="strengthened">Strengthened</TabsTrigger>
              <TabsTrigger value="stable">Stable</TabsTrigger>
              <TabsTrigger value="candidate">Candidates</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Empty state — matches Stories page exactly */}
        {clusters.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <GitBranch className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
              <p className="mt-3 text-muted-foreground">No story clusters found yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Upload evidence with full text content. The graph reasoning system will extract atomic facts, compute connection signals, and discover emerging clusters.
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Link href="/evidence/new">
                  <Button size="sm">
                    <FileText className="mr-1 h-4 w-4" /> Add Evidence
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={runDiscovery}>
                  <Sparkles className="mr-1 h-4 w-4" /> Run Discovery
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cluster list — matches Stories card pattern */}
        {filtered.length > 0 && (
          <div className="grid gap-3">
            {filtered.map((cluster, idx) => (
              <Card
                key={cluster.id}
                className={`transition-colors hover:bg-accent ${
                  cluster.status === "candidate"
                    ? "border-l-4 border-l-amber-500/40"
                    : "border-l-4 border-l-indigo-500/40"
                } ${created.includes(idx) ? "opacity-60" : ""}`}
              >
                <CardContent className="flex items-start justify-between py-4 gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-medium">{cluster.name}</h3>
                      <Badge variant={statusVariant(cluster.status)} className="text-[10px] capitalize">
                        {cluster.status}
                      </Badge>
                      {cluster.narrative && (
                        <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px]">
                          <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Narrative
                        </Badge>
                      )}
                      {cluster.evidenceCount >= 2 && (
                        <Badge variant="outline" className="text-[10px]">
                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Multi-evidence
                        </Badge>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {cluster.description}
                    </p>

                    {/* Metadata row — matches Stories page pattern */}
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground flex-wrap">
                      <span>{cluster.evidenceCount} evidence</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />
                        {cluster.entityCount} entities
                      </span>
                      <span>·</span>
                      <span>density {(cluster.density || 0).toFixed(2)}</span>
                      {cluster.narrative && (
                        <>
                          <span>·</span>
                          <span className="text-indigo-400">
                            {(cluster.narrative.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </>
                      )}
                    </div>

                    {/* Evidence links */}
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                      <span>Evidence:</span>
                      {cluster.evidenceIds.slice(0, 6).map((id) => (
                        <Link
                          key={id}
                          href={`/evidence/${id}`}
                          className="hover:text-primary transition-colors underline underline-offset-2"
                        >
                          #{id}
                        </Link>
                      ))}
                      {cluster.evidenceIds.length > 6 && (
                        <span>+{cluster.evidenceIds.length - 6} more</span>
                      )}
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="shrink-0">
                    {created.includes(idx) ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400">
                        <CheckCircle className="h-3 w-3 mr-1" /> Created
                      </Badge>
                    ) : cluster.evidenceCount >= 2 ? (
                      <Button
                        size="sm"
                        onClick={() => createStory(cluster, idx)}
                        disabled={creating === idx}
                      >
                        {creating === idx ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><Plus className="mr-1 h-3.5 w-3.5" /> Create Story</>
                        )}
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Needs more evidence
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No results after filter */}
        {clusters.length > 0 && filtered.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
              <p className="mt-3 text-muted-foreground">No clusters match the selected filter</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilter("all")}>
                Show all clusters
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
