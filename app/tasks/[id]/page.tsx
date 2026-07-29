"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, FileText, Users, CheckCircle, Trash2, Loader2 } from "lucide-react"

export default function TaskDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [status, setStatus] = useState("")
  const [completionNotes, setCompletionNotes] = useState("")

  useEffect(() => { fetchTask() }, [id])

  const fetchTask = async () => {
    const res = await fetch(`/api/tasks/${id}`)
    const d = await res.json()
    setData(d)
    setStatus(d?.task?.status || "")
    setCompletionNotes(d?.task?.completionNotes || "")
    setLoading(false)
  }

  const handleUpdate = async () => {
    setUpdating(true)
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, completionNotes }),
    })
    setUpdating(false)
    fetchTask()
  }

  const handleDelete = async () => {
    if (!confirm("Delete this task?")) return
    await fetch(`/api/tasks/${id}`, { method: "DELETE" })
    router.push("/tasks")
  }

  if (loading) return <AppShell><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div></AppShell>
  if (!data) return <AppShell><div className="flex h-96 items-center justify-center text-muted-foreground">Task not found</div></AppShell>

  const task = data.task

  const priorityColor = (p: string) => {
    if (p === "critical") return "bg-destructive/20 text-destructive"
    if (p === "high") return "bg-amber-500/20 text-amber-400"
    if (p === "medium") return "bg-blue-500/20 text-blue-400"
    return "bg-muted text-muted-foreground"
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/tasks"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button></Link>
          <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{task.objective}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge className={`capitalize ${priorityColor(task.priority)}`}>{task.priority}</Badge>
            <Badge variant="outline" className="capitalize">{task.status.replace("_", " ")}</Badge>
            {task.deadline && <span className="text-xs text-muted-foreground">Due {new Date(task.deadline).toLocaleDateString()}</span>}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["open","in_progress","completed","cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Completion Notes</label>
              <Textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} rows={4} placeholder="Notes on findings, conclusions, next steps..." />
            </div>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving...</> : <><CheckCircle className="mr-1 h-4 w-4" /> Update Task</>}
            </Button>
          </CardContent>
        </Card>

        {data.evidence.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Linked Evidence</h3>
            <div className="space-y-2">
              {data.evidence.map((ev: any) => (
                <Link key={ev.id} href={`/evidence/${ev.id}`}>
                  <Card className="transition-colors hover:bg-accent"><CardContent className="py-3">
                    <p className="text-sm font-medium">{ev.title}</p>
                  </CardContent></Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {data.entities.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><Users className="h-4 w-4" /> Linked Entities</h3>
            <div className="grid grid-cols-3 gap-2">
              {data.entities.map((ent: any) => (
                <Link key={ent.id} href={`/entities/${ent.id}`}>
                  <Card className="transition-colors hover:bg-accent"><CardContent className="py-3">
                    <p className="text-sm font-medium">{ent.name}</p>
                    <Badge variant="outline" className="text-[10px] capitalize mt-1">{ent.type}</Badge>
                  </CardContent></Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
