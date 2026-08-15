/**
 * ATIS v4 — Evidence Summary Generation
 * 
 * Dedicated LLM stage that produces a condensed, factual summary
 * of an evidence document. Runs AFTER extraction so it can leverage
 * the already-extracted intelligence for context.
 * 
 * Output: structured summary with key findings and implications
 * as factual statements. No fluff, no marketing language.
 */

import { generateWithAI } from "./index";

export interface EvidenceSummary {
  /** 2–4 sentence condensed overview */
  overview: string;
  /** 3–7 bullet-point key findings (factual statements) */
  keyFindings: string[];
  /** 2–5 bullet-point implications (so what?) */
  implications: string[];
  /** 1-sentence relevance to development finance / AfDB mandate */
  relevance: string;
  /** Confidence in summary accuracy (0.0–1.0) */
  confidence: number;
}

// ═════════════════════════════════════════════════════════════════
// PROMPT
// ═════════════════════════════════════════════════════════════════

function buildSummaryPrompt(text: string, title: string): string {
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
    "Factual statement 2 with specific metric or detail from the text.",
    "Factual statement 3..."
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

// ═════════════════════════════════════════════════════════════════
// PARSING
// ═════════════════════════════════════════════════════════════════

function safeParseJSON<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^\s*```json\s*/i, "")
      .replace(/^\s*```\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]) as T;
    } catch {
      // nothing
    }
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═════════════════════════════════════════════════════════════════

/**
 * Generate a structured factual summary for an evidence document.
 * 
 * @param text — Full document text
 * @param title — Document title
 * @param evidenceId — For logging
 * @returns Structured summary or null if generation fails
 */
export async function generateEvidenceSummary(
  text: string,
  title: string,
  evidenceId: number
): Promise<EvidenceSummary | null> {
  if (!text || text.trim().length < 50) {
    console.warn(`[summaries] E${evidenceId}: text too short for summary`);
    return null;
  }

  const prompt = buildSummaryPrompt(text, title);

  let rawResponse: string;
  try {
    rawResponse = await generateWithAI(prompt, {
      maxTokens: 4000,
      temperature: 0.2, // lower = more factual, less creative
    });
  } catch (err: any) {
    console.error(`[summaries] E${evidenceId}: LLM call failed —`, err.message);
    return null;
  }

  const parsed = safeParseJSON<Record<string, unknown>>(rawResponse);

  if (!parsed) {
    console.error(`[summaries] E${evidenceId}: JSON parse failed. Raw (first 600 chars):`);
    console.error(rawResponse.slice(0, 600));
    return null;
  }

  const summary: EvidenceSummary = {
    overview: String(parsed.overview || "").trim(),
    keyFindings: Array.isArray(parsed.keyFindings)
      ? parsed.keyFindings.filter((f): f is string => typeof f === "string" && f.length > 0)
      : [],
    implications: Array.isArray(parsed.implications)
      ? parsed.implications.filter((i): i is string => typeof i === "string" && i.length > 0)
      : [],
    relevance: String(parsed.relevance || "").trim(),
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };

  // Validate minimum quality
  if (summary.overview.length < 20 && summary.keyFindings.length === 0) {
    console.warn(`[summaries] E${evidenceId}: summary too thin — rejecting`);
    return null;
  }

  console.log(
    `[summaries] E${evidenceId}: generated summary — ${summary.keyFindings.length} findings, ${summary.implications.length} implications, confidence ${summary.confidence}`
  );

  return summary;
}

/**
 * Serialize a summary for storage in the evidence.summary column.
 * Stores as JSON string so the frontend can parse it back into structured fields.
 */
export function serializeSummary(summary: EvidenceSummary): string {
  return JSON.stringify(summary);
}

/**
 * Parse a stored summary JSON string back into an EvidenceSummary object.
 */
export function parseSummary(stored: string | null): EvidenceSummary | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return {
      overview: String(parsed.overview || ""),
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      implications: Array.isArray(parsed.implications) ? parsed.implications : [],
      relevance: String(parsed.relevance || ""),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}
