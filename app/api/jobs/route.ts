import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    await requireAuth();
    const jobs = listJobs();
    return NextResponse.json({ jobs });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Jobs list error:", error);
    return NextResponse.json({ error: "Failed to list jobs" }, { status: 500 });
  }
}
