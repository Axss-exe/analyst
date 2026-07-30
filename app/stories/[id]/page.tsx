"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, BookOpen, FileText, Users, GitBranch, Clock, ClipboardList,
  Newspaper, Plus, Trash2, Link2, FileDown, Loader2
} from "lucide-react"

interface StoryDetail {
  story: { id: number; title: string; overview: string; status: string; createdAt: string; updatedAt: string }
  evidence: Array<any>
  timelineEvents: Array<any>
  tasks: Array<any>
  briefs: Array<any>
  entities: Array<any>
  relationships: Array<any>
}

export default function StoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [data, setData] = useState<StoryDetail | null>(null)
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [genMode, setGenMode] = useState("full")
  const [genLoading, setGenLoading] = useState(false)
  const [allEvidence, setAllEvidence] = useState<any[]>([])
  const [selectedEvidence, setSelectedEvidence] = useState<number[]>([])
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  useEffect(() => {
    fetchStory()
    fetchAllEvidence()
  }, [id])

  const fetchStory = async () => {
    try {
      setError("")
      const res = await fetch(`/api/stories/${id}`)
      const d = await res.json()

      if (!res.ok || d.error) {
        setError(d.error || "Failed to load story")
        setData(null)
        setLoading(false)
        return
      }

      // Validate response shape
      if (!d.story || typeof d.story !== "object") {
        setError("Invalid story data received")
        setData(null)
        setLoading(false)
        return
      }

      setData({
        story: d.story,
        evidence: d.evidence || [],
        timelineEvents: d.timelineEvents || [],
        tasks: d.tasks || [],
        briefs: d.briefs || [],
        entities: d.entities || [],
        relationships: d.relationships || [],
      })
      setLoading(false)
    } catch (e) {
      setError("Network error loading story")
      setData(null)
      setLoading(false)
    }
  }

  const fetchAllEvidence = async () => {
    try {
      const res = await fetch("/api/evidence?limit=500")
      const d = await res.json()
      if (res.ok && d.evidence) {
        setAllEvidence(d.evidence)
      }
    } catch {
      // silent
    }
  }

  const handleGenerateBrief = async () => {
    setGenLoading(true)
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: parseInt(id),
          generationMode: genMode,
          selectedEvidenceIds: genMode === "partial" ? selectedEvidence : undefined,
        }),
      })
      if (res.ok) {
        fetchStory()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || "Failed to generate brief")
      }
    } catch {
      alert("Network error generating brief")
    }
    setGenLoading(false)
  }

  const handleLinkEvidence = async (evidenceId: number) => {
    try {
      const res = await fetch(`/api/stories/${id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId, confidence: 0.8, relationshipType: "manual" }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || "Failed to link evidence")
      }
    } catch {
      alert("Network error linking evidence")
    }
    setLinkDialogOpen(false)
    fetchStory()
  }

  const handleUnlinkEvidence = async (evidenceId: number) => {
    if (!confirm("Remove this evidence from the story?")) return
    try {
      await fetch(`/api/stories/${id}/evidence?evidenceId=${evidenceId}`, { method: "DELETE" })
      fetchStory()
    } catch {
      alert("Failed to unlink evidence")
    }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this story? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/stories/${id}`, { method: "DELETE" })
      if (res.ok) router.push("/stories")
      else alert("Failed to delete story")
    } catch {
      alert("Network error deleting story")
    }
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

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex h-96 flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{error || "Story not found"}</p>
          <Link href="/stories"><Button variant="outline"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Stories</Button></Link>
        </div>
      </AppShell>
    )
  }

  const story = data.story
  const linkedEvidenceIds = new Set(data.evidence.map((e: any) => e.id))
  const availableEvidence = allEvidence.filter((e) => !linkedEvidenceIds.has(e.id))

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/stories">
              <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
            </Link>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><FileDown className="mr-1 h-4 w-4" /> Generate Brief</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Generate Intelligence Brief</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Generation Mode</label>
                    <Select value={genMode} onValueChange={setGenMode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Story Snapshot</SelectItem>
                        <SelectItem value="partial">Partial (Select Evidence)</SelectItem>
                        <SelectItem value="since_last">Evidence Since Last Brief</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {genMode === "partial" && (
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
                      {data.evidence.map((ev: any) => (
                        <label key={ev.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedEvidence.includes(ev.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedEvidence((prev) => [...prev, ev.id])
                              else setSelectedEvidence((prev) => prev.filter((id) => id !== ev.id))
                            }}
                            className="rounded border"
                          />
                          <span className="truncate">{ev.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <Button onClick={handleGenerateBrief} disabled={genLoading} className="w-full">
                    {genLoading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Generating...</> : "Generate Brief"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{story.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={story.status === "active" ? "default" : "secondary"} className="capitalize">{story.status}</Badge>
            <span className="text-xs text-muted-foreground">Updated {new Date(story.updatedAt).toLocaleDateString()}</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{story.overview}</p>
        </div>

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="evidence"><FileText className="mr-1 h-3 w-3" /> Evidence ({data.evidence.length})</TabsTrigger>
            <TabsTrigger value="timeline"><Clock className="mr-1 h-3 w-3" /> Timeline ({data.timelineEvents.length})</TabsTrigger>
            <TabsTrigger value="entities"><Users className="mr-1 h-3 w-3" /> Entities ({data.entities.length})</TabsTrigger>
            <TabsTrigger value="graph"><GitBranch className="mr-1 h-3 w-3" /> Graph</TabsTrigger>
            <TabsTrigger value="tasks"><ClipboardList className="mr-1 h-3 w-3" /> Tasks ({data.tasks.length})</TabsTrigger>
            <TabsTrigger value="briefs"><Newspaper className="mr-1 h-3 w-3" /> Briefs ({data.briefs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="evidence" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Link2 className="mr-1 h-4 w-4" /> Link Evidence</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Link Evidence to Story</DialogTitle></DialogHeader>
                  <div className="max-h-80 overflow-y-auto space-y-1">
                    {availableEvidence.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">All evidence is already linked</p>
                    ) : (
                      availableEvidence.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => handleLinkEvidence(ev.id)}
                          className="w-full text-left rounded-md p-2 text-sm hover:bg-accent transition-colors"
                        >
                          <p className="font-medium">{ev.title}</p>
                          <p className="text-xs text-muted-foreground">{ev.source}</p>
                        </button>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {data.evidence.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No evidence linked yet</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {data.evidence.map((ev: any) => (
                  <Card key={ev.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <Link href={`/evidence/${ev.id}`} className="text-sm font-medium hover:text-primary">
                          {ev.title}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">{ev.source} | Confidence: {(ev.junction?.confidence * 100)?.toFixed(0) || "N/A"}%</p>
                      </div>
                      <div className="flex gap-1">
                        <Link href={`/evidence/${ev.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleUnlinkEvidence(ev.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            {data.timelineEvents.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No timeline events</CardContent></Card>
            ) : (
              <div className="relative border-l border-border ml-4 space-y-4">
                {data.timelineEvents.map((evt: any) => (
                  <div key={evt.id} className="relative pl-6">
                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <Card>
                      <CardContent className="py-3">
                        <span className="text-xs text-muted-foreground">{new Date(evt.date).toLocaleDateString()}</span>
                        <p className="text-sm font-medium mt-0.5">{evt.title}</p>
                        <p className="text-xs text-muted-foreground">{evt.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="entities" className="mt-4">
            {data.entities.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No entities linked</CardContent></Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {data.entities.map((ent: any) => (
                  <Link key={ent.id} href={`/entities/${ent.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="py-3">
                        <p className="text-sm font-medium">{ent.name}</p>
                        <Badge variant="outline" className="text-[10px] capitalize mt-1">{ent.type}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="graph" className="mt-4">
            <Card>
              <CardContent className="py-8 text-center">
                <GitBranch className="h-12 w-12 text-muted-foreground opacity-40 mx-auto" />
                <p className="mt-2 text-muted-foreground">Relationship graph for this story</p>
                <Link href={`/graph?storyId=${id}`}>
                  <Button className="mt-4" variant="outline">Open in Graph View</Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            {data.tasks.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No research tasks</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {data.tasks.map((task: any) => (
                  <Link key={task.id} href={`/tasks/${task.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium">{task.objective}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] capitalize">{task.status}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{task.priority}</Badge>
                          </div>
                        </div>
                        <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="briefs" className="mt-4">
            {data.briefs.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No briefs generated yet</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {data.briefs.map((brief: any) => (
                  <Link key={brief.id} href={`/briefs/${brief.id}`}>
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium">{brief.headline}</p>
                          <p className="text-xs text-muted-foreground">v{brief.version} | {brief.generationMode} | {new Date(brief.createdAt).toLocaleDateString()}</p>
                        </div>
                        <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
