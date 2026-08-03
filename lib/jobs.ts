import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobStage {
  name: string;
  status: JobStatus;
  message: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  currentStage: string;
  progress: number;
  stages: JobStage[];
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

function toJob(row: any): Job {
  return {
    id: row.id,
    status: row.status as JobStatus,
    currentStage: row.currentStage,
    progress: row.progress,
    stages: JSON.parse(row.stages || "[]"),
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error || undefined,
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  };
}

export function createJob(id: string, stageNames: string[]): Job {
  const now = new Date().toISOString();
  const stages: JobStage[] = stageNames.map((name) => ({
    name,
    status: "queued",
    message: "Waiting...",
  }));

  db.insert(jobs)
    .values({
      id,
      status: "queued",
      currentStage: "Initializing...",
      progress: 0,
      stages: JSON.stringify(stages),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    status: "queued",
    currentStage: "Initializing...",
    progress: 0,
    stages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function enqueueJob(stageNames: string[]): string {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  createJob(id, stageNames);
  return id;
}

export async function processJob<T>(
  jobId: string,
  processor: () => Promise<T>,
): Promise<T> {
  try {
    const result = await processor();
    completeJob(jobId, result);
    return result;
  } catch (err: any) {
    failJob(jobId, err.message || "Job processor failed");
    throw err;
  }
}

// NEW: updateJob — used by the worker to set stage/progress/status in one call
export function updateJob(
  jobId: string,
  update: {
    stage?: string;
    progress?: number;
    status?: JobStatus;
    error?: string;
  },
) {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return;

  const setData: any = { updatedAt: new Date().toISOString() };

  if (update.status) setData.status = update.status;
  if (update.progress !== undefined) setData.progress = update.progress;
  if (update.stage) setData.currentStage = update.stage;
  if (update.error) setData.error = update.error;

  db.update(jobs).set(setData).where(eq(jobs.id, jobId)).run();
}

export function startStage(jobId: string, stageName: string, message?: string) {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return;

  const stages: JobStage[] = JSON.parse(jobRow.stages || "[]");
  const stage = stages.find((s: JobStage) => s.name === stageName);
  if (stage) {
    stage.status = "running";
    stage.message = message || "Processing...";
    stage.startedAt = Date.now();
  }

  db.update(jobs)
    .set({
      status: "running",
      currentStage: stageName,
      stages: JSON.stringify(stages),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export function completeStage(
  jobId: string,
  stageName: string,
  message?: string,
) {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return;

  const stages: JobStage[] = JSON.parse(jobRow.stages || "[]");
  const stage = stages.find((s: JobStage) => s.name === stageName);
  if (stage) {
    stage.status = "completed";
    stage.message = message || "Done";
    stage.completedAt = Date.now();
  }

  const completed = stages.filter(
    (s: JobStage) => s.status === "completed",
  ).length;
  const progress = Math.round((completed / stages.length) * 100);

  db.update(jobs)
    .set({
      progress,
      stages: JSON.stringify(stages),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export function failStage(jobId: string, stageName: string, error: string) {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return;

  const stages: JobStage[] = JSON.parse(jobRow.stages || "[]");
  const stage = stages.find((s: JobStage) => s.name === stageName);
  if (stage) {
    stage.status = "failed";
    stage.message = error;
    stage.completedAt = Date.now();
  }

  db.update(jobs)
    .set({
      status: "failed",
      error,
      stages: JSON.stringify(stages),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export function completeJob(jobId: string, result?: any) {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return;

  db.update(jobs)
    .set({
      status: "completed",
      progress: 100,
      currentStage: "Complete",
      result: result ? JSON.stringify(result) : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export function failJob(jobId: string, error: string) {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return;

  db.update(jobs)
    .set({
      status: "failed",
      error,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export function cancelJob(jobId: string): boolean {
  const jobRow = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!jobRow) return false;

  db.update(jobs)
    .set({
      status: "cancelled",
      currentStage: "Cancelled",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();

  return true;
}

export function getJob(jobId: string): Job | undefined {
  const row = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!row) return undefined;
  return toJob(row);
}

export function listJobs(): Job[] {
  const rows = db.select().from(jobs).all();
  return rows.map(toJob);
}

// Cleanup old jobs (older than 1 hour) every 10 minutes
setInterval(
  () => {
    const cutoff = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    db.delete(jobs).where(eq(jobs.status, "completed")).run();
    db.delete(jobs).where(eq(jobs.status, "failed")).run();
    db.delete(jobs).where(eq(jobs.status, "cancelled")).run();
  },
  1000 * 60 * 10,
);
