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
import { ArrowLeft, Loader2 } from "lucide-react"

export default function NewEntityPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [aliases, setAliases] = useState("")
  const [metadata, setMetadata] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true)
    try {
      const res = await fetch("/api/entities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), metadata: metadata ? JSON.parse(metadata) : {} }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed"); setLoading(false); return }
      router.push(`/entities/${data.entity.id}`)
    } catch { setError("Network error"); setLoading(false) }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/entities"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button></Link>
        <Card>
          <CardHeader><CardTitle>Create New Entity</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {["person","organization","company","government","project","location","mineral","legislation","bank","investor","mine","infrastructure"].map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Aliases (comma separated)</Label><Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Alias 1, Alias 2" /></div>
              <div className="space-y-2"><Label>Metadata (JSON)</Label><Textarea value={metadata} onChange={(e) => setMetadata(e.target.value)} rows={4} placeholder='{"country": "DRC", "sector": "Mining"}' /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Link href="/entities"><Button type="button" variant="outline">Cancel</Button></Link>
                <Button type="submit" disabled={loading}>{loading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving...</> : "Create Entity"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
