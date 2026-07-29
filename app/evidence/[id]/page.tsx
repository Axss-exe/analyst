"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, FileText, Calendar, Link2, Trash2, ExternalLink } from "lucide-react"

interface EvidenceDetail {
  evidence: {
    id: number
    title: string
    summary: string
    source: string
    sourceType: string
    publicationDate: string | null
    collectionDate: string
    confidence: number
    tags: string
    aiMetadata: string | null
    createdAt: string
  }
  linkedStories: Array<{ storyId: number; evidenceId: number; confidence: number; relationshipType: string }>
  linkedEntities: Array<{ id: number; name: string; type: string }>
  timelineEvents: Array<{ id: number; date: string; title: string; description: string }>
}

export default function EvidenceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [data, setData] = useState<EvidenceDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/evidence/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const getTags = (tagsStr: string) => {
    try { return JSON.parse(tagsStr) } catch { return [] }
  }

  const getMetadata = (metaStr: string | null) => {
    try { return metaStr ? JSON.parse(metaStr) : {} } catch { return {} }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this evidence? This action cannot be undone.")) return
    const res = await fetch(`/api/evidence/${id}`, { method: "DELETE" })
    if (res.ok) router.push("/evidence")
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    )
  }

  if (!data) {
    return (
      <AppShell>
        <div className="flex h-96 flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Evidence not found</p>
          <Link href="/evidence"><Button variant="outline"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Evidence</Button></Link>
        </div>
      </AppShell>
    )
  }

  const ev = data.evidence
  const meta = getMetadata(ev.aiMetadata)

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/evidence">
              <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
            </Link>
          </div>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ev.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">{ev.sourceType}</Badge>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> {ev.source}
            </span>
            {ev.publicationDate && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {new Date(ev.publicationDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <div className="h-2 w-24 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${ev.confidence * 100}%` }} />
            </div>
            <span className="text-sm font-medium">{(ev.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {getTags(ev.tags).map((tag: string) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        </div>

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="stories">Linked Stories ({data.linkedStories.length})</TabsTrigger>
            <TabsTrigger value="entities">Entities ({data.linkedEntities.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline ({data.timelineEvents.length})</TabsTrigger>
            <TabsTrigger value="metadata">AI Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{ev.summary}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stories" className="mt-4">
            {data.linkedStories.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Not linked to any stories</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {data.linkedStories.map((link) => (
                  <Card key={link.storyId}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <Link href={`/stories/${link.storyId}`} className="text-sm font-medium hover:text-primary">
                          Story #{link.storyId}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Confidence: {(link.confidence * 100).toFixed(0)}% | {link.relationshipType}
                        </p>
                      </div>
                      <Link href={`/stories/${link.storyId}`}>
                        <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 rotate-180" /></Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="entities" className="mt-4">
            {data.linkedEntities.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No entities extracted</CardContent></Card>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {data.linkedEntities.map((ent) => (
                  <Link key={ent.id} href={`/entities/${ent.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="flex items-center gap-3 py-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{ent.name}</p>
                          <Badge variant="outline" className="text-[10px] capitalize">{ent.type}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            {data.timelineEvents.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No timeline events</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {data.timelineEvents.map((evt) => (
                  <Card key={evt.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{new Date(evt.date).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{evt.title}</p>
                      <p className="text-xs text-muted-foreground">{evt.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="metadata" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <pre className="text-xs text-muted-foreground overflow-auto">{JSON.stringify(meta, null, 2)}</pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

import { Users } from "lucide-react"
