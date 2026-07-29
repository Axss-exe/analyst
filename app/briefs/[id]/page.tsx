"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Newspaper, FileDown } from "lucide-react"

export default function BriefDetailPage() {
  const { id } = useParams() as { id: string }
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/briefs/${id}`).then((r) => r.json()).then((d) => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <AppShell><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div></AppShell>
  if (!data) return <AppShell><div className="flex h-96 items-center justify-center text-muted-foreground">Brief not found</div></AppShell>

  const brief = data.brief
  const content = brief.content
  const story = data.story

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/briefs"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button></Link>
          <div className="flex gap-2">
            <Link href={`/stories/${brief.storyId}`}>
              <Button variant="outline" size="sm"><Newspaper className="mr-1 h-4 w-4" /> View Story</Button>
            </Link>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{content.headline || brief.headline}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">v{brief.version}</Badge>
            <Badge variant="secondary" className="capitalize">{brief.generationMode.replace("_", " ")}</Badge>
            <span>Generated {new Date(brief.createdAt).toLocaleDateString()}</span>
            {story && <span>| Story: <Link href={`/stories/${story.id}`} className="text-primary hover:underline">{story.title}</Link></span>}
          </div>
        </div>

        {content.executiveSummary && (
          <Card>
            <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Executive Summary</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-relaxed whitespace-pre-wrap">{content.executiveSummary}</p></CardContent>
          </Card>
        )}

        {content.detailedNarrative && (
          <Card>
            <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Detailed Narrative</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-relaxed whitespace-pre-wrap">{content.detailedNarrative}</p></CardContent>
          </Card>
        )}

        {content.keyFindings && content.keyFindings.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Key Findings</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {content.keyFindings.map((finding: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {finding}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {content.references && content.references.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">References</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {content.references.map((ref: string, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground">{ref}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="bg-muted/50">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">
              Model: {brief.llmModel} | Prompt Version: {brief.promptVersion} | Template: {data.template?.name || "Default"}
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
