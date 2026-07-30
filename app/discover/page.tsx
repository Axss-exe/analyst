"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Sparkles, GitBranch, Users, FileText, CheckCircle, XCircle, ArrowRight } from "lucide-react"

interface StoryProposal {
  title: string
  overview: string
  confidence: number
  evidenceIds: number[]
  sharedTopics: string[]
  sharedEntities: string[]
  sharedThemes: string[]
  reasoning: string
  evidenceCount: number
  evidenceItems: Array<{ id: number; title: string; summary: string }>
  connectionSignals: {
    sharedTopics: string[]
    sharedEntities: string[]
    sharedThemes: string[]
  }
}

export default function DiscoverPage() {
  const [clusters, setClusters] = useState<StoryProposal[]>([])
  const [unlinkedCount, setUnlinkedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<number | null>(null)
  const [created, setCreated] = useState<number[]>([])

  const runDiscovery = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/discover")
      const data = await res.json()
      if (res.ok) {
        setClusters(data.clusters || [])
        setUnlinkedCount(data.unlinkedCount || 0)
      }
    } catch {
      alert("Discovery failed")
    }
    setLoading(false)
  }

  const createStory = async (proposal: StoryProposal, index: number) => {
    setCreating(index)
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: proposal.title,
          overview: proposal.overview,
          evidenceIds: proposal.evidenceIds,
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

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-amber-400" />
              Story Discovery
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically find connections between unlinked evidence and propose new intelligence stories
            </p>
          </div>
          <Button onClick={runDiscovery} disabled={loading}>
            {loading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Analyzing...</> : <><Sparkles className="mr-1 h-4 w-4" /> Run Discovery</>}
          </Button>
        </div>

        {clusters.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <GitBranch className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
              <p className="mt-3 text-muted-foreground">No story clusters found yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Upload evidence with full text content. The AI will extract topics, entities, and themes, then group related evidence into story proposals.
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <Link href="/evidence/new">
                  <Button size="sm"><FileText className="mr-1 h-4 w-4" /> Add Evidence</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {clusters.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{unlinkedCount} unlinked</Badge>
              <Badge variant="outline">{clusters.length} clusters found</Badge>
            </div>

            <div className="grid gap-4">
              {clusters.map((proposal, idx) => (
                <Card key={idx} className={created.includes(idx) ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{proposal.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{proposal.reasoning}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{proposal.evidenceCount} evidence</Badge>
                        {created.includes(idx) ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle className="h-3 w-3 mr-1" /> Created</Badge>
                        ) : (
                          <Button size="sm" onClick={() => createStory(proposal, idx)} disabled={creating === idx}>
                            {creating === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Story"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">{proposal.overview}</p>

                    <div className="flex flex-wrap gap-1.5">
                      {proposal.connectionSignals.sharedThemes.map((t, i) => (
                        <Badge key={i} className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">{t}</Badge>
                      ))}
                      {proposal.connectionSignals.sharedTopics.map((t, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                      {proposal.connectionSignals.sharedEntities.map((e, i) => (
                        <Badge key={i} className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]"><Users className="h-2.5 w-2.5 mr-0.5" />{e}</Badge>
                      ))}
                    </div>

                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs font-medium mb-2">Evidence in this cluster:</p>
                      <div className="space-y-1.5">
                        {proposal.evidenceItems.map((item) => (
                          <Link key={item.id} href={`/evidence/${item.id}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
