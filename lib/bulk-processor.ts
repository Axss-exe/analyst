import { db } from "@/db/client";
import { evidenceImports, evidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enqueueEvidenceJob } from "@/lib/worker";

const activeTimers = new Map<number, NodeJS.Timeout>();

function getImportRecord(id: number) {
  const [row] = db.select().from(evidenceImports).where(eq(evidenceImports.id, id)).all();
  return row || null;
}

function updateImport(id: number, patch: Partial<typeof evidenceImports.$inferInsert>) {
  db.update(evidenceImports)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(evidenceImports.id, id))
    .run();
}

async function processOne(importId: number) {
  const imp = getImportRecord(importId);
  if (!imp || imp.status !== "processing") return;

  let records: any[] = [];
  try {
    records = JSON.parse(imp.records);
  } catch {
    updateImport(importId, { status: "error" });
    return;
  }

  if (imp.currentIndex >= records.length) {
    updateImport(importId, {
      status: "completed",
      processedCount: imp.processedCount,
    });
    activeTimers.delete(importId);
    return;
  }

  const row = records[imp.currentIndex];
  let evidenceId: number | null = null;

  try {
    const result = db.insert(evidence).values({
      title: row.title || "Untitled",
      source: row.source || "",
      sourceType: row.sourceType || "document",
      content: row.content || "",
      url: row.url || null,
      date: row.date || new Date().toISOString().split("T")[0],
      summary: "",
      confidence: 0.5,
      aiMetadata: JSON.stringify({ bulkImportId: importId, index: imp.currentIndex }),
      createdBy: imp.createdBy,
      createdAt: new Date().toISOString(),
    }).run();

    evidenceId = Number(result.lastInsertRowid);
    if (!evidenceId) throw new Error("Insert returned no rowid");

    const text = row.content || row.summary || "";
    enqueueEvidenceJob(evidenceId, text, imp.createdBy || 0);

    updateImport(importId, {
      currentIndex: imp.currentIndex + 1,
      processedCount: imp.processedCount + 1,
    });
  } catch (err: any) {
    let errors: any[] = [];
    try { errors = JSON.parse(imp.errorLog || "[]"); } catch {}
    errors.push({
      index: imp.currentIndex,
      error: err?.message || String(err),
      time: new Date().toISOString(),
    });

    updateImport(importId, {
      currentIndex: imp.currentIndex + 1,
      failedCount: imp.failedCount + 1,
      errorLog: JSON.stringify(errors.slice(-50)),
    });
  }

  const nextImp = getImportRecord(importId);
  if (nextImp && nextImp.status === "processing" && nextImp.currentIndex < records.length) {
    const ms = (nextImp.cooldownSeconds || 300) * 1000;
    const timer = setTimeout(() => processOne(importId), ms);
    activeTimers.set(importId, timer);
    console.log(`[bulk] Import ${importId}: next item in ${nextImp.cooldownSeconds}s`);
  } else if (nextImp && nextImp.currentIndex >= records.length) {
    updateImport(importId, { status: "completed" });
    activeTimers.delete(importId);
  }
}

export function startBulkImport(importId: number) {
  const imp = getImportRecord(importId);
  if (!imp) return { success: false, error: "Import not found" };
  if (imp.status === "processing") return { success: false, error: "Already running" };
  if (imp.currentIndex >= imp.totalRecords) return { success: false, error: "Already completed" };

  updateImport(importId, { status: "processing" });
  processOne(importId);
  return { success: true };
}

export function pauseBulkImport(importId: number) {
  const timer = activeTimers.get(importId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(importId);
  }
  const imp = getImportRecord(importId);
  if (imp && imp.status === "processing") {
    updateImport(importId, { status: "paused" });
  }
  return { success: true };
}

export function cancelBulkImport(importId: number) {
  pauseBulkImport(importId);
  const imp = getImportRecord(importId);
  if (imp && imp.status !== "completed") {
    updateImport(importId, { status: "cancelled" });
  }
  return { success: true };
}

export function getBulkImportStatus(importId: number) {
  return getImportRecord(importId);
}
