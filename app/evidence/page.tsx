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
import { Plus, Search, FileText, ArrowRight } from "lucide-react"

interface EvidenceItem {
  id: number
  title: string
  summary: string
  source: string
  sourceType: string
  confidence: number
  tags: string
  createdAt: string
}

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchEvidence()
  }, [])

  const fetchEvidence = async (q = "") => {
    setLoading(true)
    const res = await fetch(`/api/evidence?search=${encodeURIComponent(q)}&limit=100`)
    const data = await res.json()
    setEvidence(data.evidence || [])
    setLoading(false)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEvidence(search)
  }

  const getTags = (tagsStr: string) => {
    try { return JSON.parse(tagsStr) } catch { return [] }
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Evidence</h1>
            <p className="text-sm text-muted-foreground">All collected intelligence evidence</p>
          </div>
          <Link href="/evidence/new">
            <Button><Plus className="mr-1 h-4 w-4" /> Add Evidence</Button>
          </Link>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search evidence..."
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
        ) : evidence.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground opacity-40" />
              <p className="mt-4 text-muted-foreground">No evidence found</p>
              <Link href="/evidence/new" className="mt-2">
                <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add your first evidence</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => router.push(`/evidence/${item.id}`)}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="text-muted-foreground">{item.source}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{item.sourceType}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${item.confidence * 100}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{(item.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getTags(item.tags).slice(0, 3).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
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
