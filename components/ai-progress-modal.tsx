"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, Loader2, AlertCircle, Clock } from "lucide-react"

interface JobStage {
  name: string
  status: "queued" | "running" | "completed" | "failed"
  message: string
}

interface Job {
  id: string
  status: string
  currentStage: string
  progress: number
  stages: JobStage[]
  error?: string
}

interface AIProgressModalProps {
  jobId: string | null
  open: boolean
  onClose: () => void
  onComplete?: () => void
}

export function AIProgressModal({ jobId, open, onClose, onComplete }: AIProgressModalProps) {
  const [job, setJob] = useState<Job | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!open || !jobId) return

    let interval: NodeJS.Timeout
    let timer: NodeJS.Timeout

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        if (!res.ok) return
        const data = await res.json()
        setJob(data)

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval)
          clearInterval(timer)
          if (data.status === "completed" && onComplete) {
            setTimeout(onComplete, 1500)
          }
        }
      } catch (e) {
        console.warn("Job poll failed:", e)
      }
    }

    poll() // immediate first poll
    interval = setInterval(poll, 2000)
    timer = setInterval(() => setElapsed(e => e + 1), 1000)

    return () => {
      clearInterval(interval)
      clearInterval(timer)
    }
  }, [jobId, open, onComplete])

  useEffect(() => {
    if (!open) {
      setElapsed(0)
      setJob(null)
    }
  }, [open])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const getStageIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4 text-green-500" />
      case "running": return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case "failed": return <AlertCircle className="w-4 h-4 text-red-500" />
      default: return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {job?.status === "running" && <Loader2 className="w-5 h-5 animate-spin" />}
            {job?.status === "completed" && <CheckCircle className="w-5 h-5 text-green-500" />}
            {job?.status === "failed" && <AlertCircle className="w-5 h-5 text-red-500" />}
            {job?.status === "queued" && <Clock className="w-5 h-5 text-gray-400" />}
            {!job && <Loader2 className="w-5 h-5 animate-spin" />}
            Processing Evidence
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{job?.currentStage || "Initializing..."}</span>
              <span className="font-medium">{job?.progress ?? 0}%</span>
            </div>
            <Progress value={job?.progress ?? 0} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Elapsed: {formatTime(elapsed)}</span>
              {job?.status === "running" && <span>Est. time depends on document size</span>}
            </div>
          </div>

          {/* Stage list */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {job?.stages.map((stage, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-2 rounded-md text-sm ${
                  stage.status === "running" ? "bg-blue-50 border border-blue-100" :
                  stage.status === "completed" ? "bg-green-50/50" :
                  stage.status === "failed" ? "bg-red-50/50" :
                  "bg-gray-50/50"
                }`}
              >
                {getStageIcon(stage.status)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{stage.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{stage.message}</div>
                </div>
              </div>
            ))}
            {!job && (
              <div className="flex items-center gap-3 p-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for server response...
              </div>
            )}
          </div>

          {/* Error display */}
          {job?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <strong>Error:</strong> {job.error}
            </div>
          )}

          {/* Completion message */}
          {job?.status === "completed" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
              ✅ Processing complete! Evidence has been analyzed and linked.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
