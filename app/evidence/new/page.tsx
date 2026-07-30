"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Loader2, Info } from "lucide-react"

export default function NewEvidencePage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [source, setSource] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [content, setContent] = useState("")
  const [publicationDate, setPublicationDate] = useState("")
  const [confidence, setConfidence] = useState("0.5")
  const [tags, setTags] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [autoConfidence, setAutoConfidence] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          source,
          sourceType,
          content,
          publicationDate: publicationDate || undefined,
          confidence: autoConfidence ? undefined : parseFloat(confidence),
          autoConfidence,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to create evidence")
        setLoading(false)
        return
      }

      router.push(`/evidence/${data.evidence.id}`)
    } catch {
      setError("Network error")
      setLoading(false)
    }
  }

  const confidenceLevels = [
    { value: "0.2", label: "Low (20%)", desc: "Unverified source, anonymous claims, or high bias indicators" },
    { value: "0.5", label: "Medium (50%)", desc: "Some corroboration possible, secondary source, mixed signals" },
    { value: "0.7", label: "High (70%)", desc: "Reputable source, specific data, internally consistent" },
    { value: "0.9", label: "Very High (90%)", desc: "Official document, primary source, auditable data" },
  ]

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/evidence">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source">Source *</Label>
                  <Input id="source" value={source} onChange={(e) => setSource(e.target.value)} required placeholder="URL, document name, etc." />
                </div>
                <div className="space-y-2">
                  <Label>Source Type *</Label>
                  <Select value={sourceType} onValueChange={setSourceType} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="word">Word Document</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="news">News Article</SelectItem>
                      <SelectItem value="image">Image / OCR</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="government">Government Document</SelectItem>
                      <SelectItem value="analyst_note">Analyst Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content / Full Text</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder="Paste the full text content here. AI will automatically extract summary, entities, and timeline events. For large documents (500+ pages), the system will chunk and summarize automatically."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pubDate">Publication Date</Label>
                  <Input id="pubDate" type="date" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="confidence">Confidence</Label>
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        id="autoConfidence"
                        checked={autoConfidence}
                        onChange={(e) => setAutoConfidence(e.target.checked)}
                        className="rounded border"
                      />
                      <label htmlFor="autoConfidence" className="text-xs text-muted-foreground">Auto</label>
                    </div>
                  </div>
                  <Select value={confidence} onValueChange={setConfidence} disabled={autoConfidence}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {confidenceLevels.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex flex-col">
                            <span>{c.label}</span>
                            <span className="text-[10px] text-muted-foreground">{c.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
                </div>
              </div>

              {!autoConfidence && (
                <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Confidence Level Guide</p>
                      <ul className="mt-1 space-y-0.5">
                        <li><strong>Low (20%):</strong> Unverified source, anonymous claims, high bias</li>
                        <li><strong>Medium (50%):</strong> Some corroboration, secondary source, mixed</li>
                        <li><strong>High (70%):</strong> Reputable source, specific data, consistent</li>
                        <li><strong>Very High (90%):</strong> Official document, primary source, auditable</li>
                      </ul>
                      <p className="mt-1">When Auto is enabled, the AI analyzes the source text and assigns a confidence score based on source authority, data specificity, internal consistency, and corroboration potential.</p>
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Link href="/evidence">
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" disabled={loading}>
                  {loading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing...</> : "Add Evidence"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
