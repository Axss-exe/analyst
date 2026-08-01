import { NextRequest, NextResponse } from "next/server"
import { getJob } from "@/lib/jobs"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const job = getJob(params.id)
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }
    return NextResponse.json(job)
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 })
  }
}
