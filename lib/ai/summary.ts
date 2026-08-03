import { generateWithAI } from "./client";
import { estimateTokens, splitByTokenBudget } from "./token-counter";
import { startStage, completeStage, failStage } from "@/lib/jobs";

/**
 * Generates a factual summary from evidence text.
 * For large documents, uses a map-reduce chunking strategy with rate limiting.
 * Designed to handle 600+ pages without freezing.
 */
export async function generateEvidenceSummary(
  evidenceText: string,
  jobId?: string,
): Promise<string> {
  const pages = Math.ceil(estimateTokens(evidenceText) / 750);
  console.log(
    `[summary] Document: ${pages} pages, ${estimateTokens(evidenceText)} tokens`,
  );

  // Small doc: single call
  if (pages <= 40) {
    if (jobId) startStage(jobId, "Summarization", "Analyzing document...");
    const result = await summarizeSingle(evidenceText);
    if (jobId) completeStage(jobId, "Summarization", "Summary complete");
    return result;
  }

  // Large doc: map-reduce with progress tracking
  if (jobId)
    startStage(jobId, "Summarization", `Chunking ${pages}-page document...`);
  const chunks = splitByTokenBudget(evidenceText, 50000, 200);
  console.log(`[summary] Split into ${chunks.length} chunks`);
  if (jobId)
    completeStage(jobId, "Summarization", `${chunks.length} chunks created`);

  // Map: summarize each chunk
  if (jobId)
    startStage(
      jobId,
      "Chunk Analysis",
      `Processing ${chunks.length} chunks...`,
    );
  const chunkSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (jobId)
      startStage(jobId, "Chunk Analysis", `Chunk ${i + 1}/${chunks.length}...`);
    try {
      const summary = await summarizeChunk(chunks[i], i + 1, chunks.length);
      chunkSummaries.push(summary);
      if (jobId)
        completeStage(
          jobId,
          "Chunk Analysis",
          `Chunk ${i + 1}/${chunks.length} done`,
        );
    } catch (e: any) {
      console.error(`[summary] Chunk ${i + 1} failed:`, e.message);
      chunkSummaries.push(`[Chunk ${i + 1} failed to process]`);
      if (jobId)
        failStage(
          jobId,
          "Chunk Analysis",
          `Chunk ${i + 1} failed: ${e.message}`,
        );
    }
  }

  // Reduce: synthesize final summary
  if (jobId) startStage(jobId, "Synthesis", "Combining chunk summaries...");
  const combined = chunkSummaries.join("\n\n---\n\n");
  const finalSummary = await synthesizeSummaries(combined, chunks.length);
  if (jobId) completeStage(jobId, "Synthesis", "Final summary ready");

  return finalSummary;
}

async function summarizeSingle(text: string): Promise<string> {
  const prompt = `Analyze the following evidence and provide a structured factual summary.

CRITICAL RULES:
- Base the summary ONLY on facts explicitly stated in the text
- NEVER copy sentences verbatim from the source
- Synthesize information into your own analytical language
- Include: key facts, named entities, specific dates/figures, stated relationships
- Exclude: speculation, opinions, or claims not supported by the text
- If this is a government plan or policy document, capture: objectives, timelines, responsible parties, budget figures, and stated outcomes

Evidence:
${text}

Provide a concise analytical summary in 2-3 paragraphs.`;

  return generateWithAI(prompt, {
    systemPrompt:
      "You are a senior intelligence analyst. Summarize evidence analytically. NEVER copy text verbatim. Synthesize facts into original prose.",
    temperature: 0.2,
    maxTokens: 2048,
  });
}

async function summarizeChunk(
  text: string,
  index: number,
  total: number,
): Promise<string> {
  const prompt = `You are processing chunk ${index} of ${total} from a large intelligence document.

CRITICAL RULES:
- Extract ONLY facts explicitly stated in this chunk
- NEVER copy sentences verbatim
- Use analytical, synthesized language
- Capture: key facts, named entities, dates, figures, relationships, stated objectives

Chunk ${index}/${total}:
${text}

Provide a concise factual summary of this chunk (max 300 words).`;

  return generateWithAI(prompt, {
    systemPrompt:
      "You are a document analysis system. Extract and synthesize facts. Never copy verbatim.",
    temperature: 0.2,
    maxTokens: 512,
  });
}

async function synthesizeSummaries(
  combinedSummaries: string,
  chunkCount: number,
): Promise<string> {
  const prompt = `You are synthesizing ${chunkCount} chunk summaries into a single coherent intelligence summary.

CRITICAL RULES:
- Produce an original analytical summary — NEVER copy from the chunk summaries verbatim
- Integrate facts across all chunks into a unified narrative
- Maintain factual accuracy — only include claims supported by the source text
- Structure: overview, key facts/figures, entities involved, stated objectives/outcomes, timeline
- If this is a national development plan, capture: strategic pillars, budget allocations, responsible ministries, target dates, and stated deliverables

Chunk Summaries:
${combinedSummaries}

Provide the final synthesized summary (max 600 words).`;

  return generateWithAI(prompt, {
    systemPrompt:
      "You are a senior intelligence analyst synthesizing multi-chunk document analysis. Produce original prose. Never copy verbatim.",
    temperature: 0.2,
    maxTokens: 2048,
  });
}
