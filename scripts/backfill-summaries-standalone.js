/**
 * STANDALONE backfill script — works with plain `node`
 * 
 * Run: node scripts/backfill-summaries-standalone.js
 * 
 * Requires: CEREBRAS_API_KEY and CEREBRAS_MODEL env vars
 */
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "atis.db");
const API_KEY = process.env.CEREBRAS_API_KEY;
const MODEL = process.env.CEREBRAS_MODEL || "gpt-oss-120b";

if (!API_KEY) {
  console.error("ERROR: CEREBRAS_API_KEY environment variable is required");
  console.error("Set it with: set CEREBRAS_API_KEY=your_key (Windows) or export CEREBRAS_API_KEY=your_key (Mac/Linux)");
  process.exit(1);
}

const db = new Database(DB_PATH);

// ─── Inline summary generation (copied from lib/ai/summaries.ts) ───

function buildSummaryPrompt(text, title) {
  return `You are a senior intelligence analyst writing a concise, factual summary of a source document for a development finance knowledge base.

## Task
Read the document below and produce a structured summary consisting ONLY of factual statements. No promotional language. No hedging ("may", "might", "could" unless explicitly stated in the source). No opinions.

## Document

Title: ${title}

${text.slice(0, 15000)}

## Output Format

Return ONLY a JSON object with this exact structure:

{
  "overview": "2–4 sentence condensed summary of what the document is about and what it concludes.",
  "keyFindings": [
    "Factual statement 1 with specific metric or detail from the text.",
    "Factual statement 2 with specific metric or detail from the text."
  ],
  "implications": [
    "Implication 1: what this means for policy, investment, or operations.",
    "Implication 2: downstream effect or risk identified in the text."
  ],
  "relevance": "One sentence on why this matters to development finance institutions like the African Development Bank.",
  "confidence": 0.95
}

## Rules
1. Every finding must cite a specific fact, number, or named entity from the text.
2. If the document is a procurement notice, summarize the scope, value (if stated), and purpose.
3. If the document is a policy report, summarize the diagnosis, recommendations, and expected outcomes.
4. If the document is a press release, summarize the announcement, actors, and stated impacts.
5. "implications" must be derivable from the text — do not invent consequences not mentioned.
6. "confidence" reflects how explicit and detailed the source text is (0.3 = vague, 0.95 = highly specific).
7. Return ONLY the JSON. No markdown fences, no preamble.`;
}

function safeParseJSON(text) {
  const cleaned = text
    .replace(/^\s*\`\`\`json\s*/i, "")
    .replace(/^\s*\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateEvidenceSummary(text, title, evidenceId) {
  if (!text || text.trim().length < 50) {
    console.warn(`[summaries] E${evidenceId}: text too short for summary`);
    return null;
  }

  const prompt = buildSummaryPrompt(text, title);

  try {
    console.log(`[summaries] E${evidenceId}: calling LLM...`);
    const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[summaries] E${evidenceId}: HTTP ${response.status} — ${err}`);
      return null;
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const parsed = safeParseJSON(raw);

    if (!parsed) {
      console.error(`[summaries] E${evidenceId}: JSON parse failed`);
      console.error("Raw (first 300 chars):", raw.slice(0, 300));
      return null;
    }

    const summary = {
      overview: String(parsed.overview || "").trim(),
      keyFindings: Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings.filter((f) => typeof f === "string" && f.length > 0)
        : [],
      implications: Array.isArray(parsed.implications)
        ? parsed.implications.filter((i) => typeof i === "string" && i.length > 0)
        : [],
      relevance: String(parsed.relevance || "").trim(),
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    };

    if (summary.overview.length < 20 && summary.keyFindings.length === 0) {
      console.warn(`[summaries] E${evidenceId}: summary too thin — rejecting`);
      return null;
    }

    console.log(`[summaries] E${evidenceId}: ✓ generated (${summary.keyFindings.length} findings)`);
    return summary;
  } catch (err) {
    console.error(`[summaries] E${evidenceId}: LLM call failed —`, err.message);
    return null;
  }
}

function serializeSummary(summary) {
  return JSON.stringify(summary);
}

// ─── Main backfill logic ───

async function backfillSummaries() {
  console.log("[backfill] Starting summary backfill...");
  console.log("[backfill] DB:", DB_PATH);

  const allEvidence = db.prepare("SELECT id, title, summary, content FROM evidence ORDER BY id").all();
  console.log(`[backfill] Found ${allEvidence.length} evidence items`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const ev of allEvidence) {
    const summaryStr = ev.summary || "";

    // Skip if already has structured JSON summary
    if (summaryStr.includes('"overview"') && summaryStr.includes('"keyFindings"')) {
      console.log(`[backfill] E${ev.id}: already structured, skipping`);
      skipped++;
      continue;
    }

    // Use content first, then summary (scraped text), then title
    const text = ev.content || ev.summary || ev.title || "";
    if (text.length < 50) {
      console.log(`[backfill] E${ev.id}: text too short (${text.length} chars), skipping`);
      skipped++;
      continue;
    }

    const generated = await generateEvidenceSummary(text, ev.title, ev.id);

    if (generated) {
      const json = serializeSummary(generated);
      db.prepare("UPDATE evidence SET summary = ? WHERE id = ?").run(json, ev.id);
      console.log(`[backfill] E${ev.id}: ✓ stored`);
      processed++;
    } else {
      console.log(`[backfill] E${ev.id}: ✗ generation failed`);
      failed++;
    }

    // Rate limit delay
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n[backfill] DONE. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}`);
  db.close();
}

backfillSummaries().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  db.close();
  process.exit(1);
});
