/**
 * Backfill script — run with: npx tsx scripts/backfill-summaries.ts
 * 
 * Uses relative imports so tsx can resolve them without Next.js webpack.
 */
import Database from "better-sqlite3";
import path from "path";
import { generateEvidenceSummary, serializeSummary } from "../lib/ai/summaries";

const DB_PATH = path.join(__dirname, "..", "atis.db");
const db = new Database(DB_PATH);

async function backfillSummaries() {
  console.log("[backfill] Starting summary backfill...");

  const allEvidence = db.prepare("SELECT id, title, summary, content FROM evidence ORDER BY id").all() as any[];
  console.log(`[backfill] Found ${allEvidence.length} evidence items`);

  let processed = 0, skipped = 0, failed = 0;

  for (const ev of allEvidence) {
    const summaryStr = ev.summary || "";

    if (summaryStr.includes('"overview"') && summaryStr.includes('"keyFindings"')) {
      console.log(`[backfill] E${ev.id}: already structured, skipping`);
      skipped++;
      continue;
    }

    const text = ev.content || ev.summary || ev.title || "";
    if (text.length < 50) {
      console.log(`[backfill] E${ev.id}: text too short (${text.length}), skipping`);
      skipped++;
      continue;
    }

    try {
      const generated = await generateEvidenceSummary(text, ev.title, ev.id);
      if (generated) {
        db.prepare("UPDATE evidence SET summary = ? WHERE id = ?").run(serializeSummary(generated), ev.id);
        console.log(`[backfill] E${ev.id}: ✓ stored`);
        processed++;
      } else {
        console.log(`[backfill] E${ev.id}: ✗ null`);
        failed++;
      }
    } catch (err: any) {
      console.error(`[backfill] E${ev.id}: ✗ error —`, err.message);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n[backfill] DONE. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}`);
  db.close();
}

backfillSummaries().catch((err) => {
  console.error("[backfill] Fatal:", err);
  db.close();
  process.exit(1);
});
