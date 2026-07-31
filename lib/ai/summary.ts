import { generateWithAI } from "./client"

const MAX_CHUNK_SIZE = 12000
const CHUNK_OVERLAP = 500

function splitIntoChunks(text: string, maxSize: number, overlap: number): string[] {
  if (text.length <= maxSize) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxSize, text.length)
    let breakPoint = end
    if (end < text.length) {
      const searchWindow = text.slice(Math.max(start, end - 200), end)
      const lastSentence = Math.max(
        searchWindow.lastIndexOf('. '),
        searchWindow.lastIndexOf('! '),
        searchWindow.lastIndexOf('? ')
      )
      if (lastSentence > 0) {
        breakPoint = Math.max(start, end - 200) + lastSentence + 1
      }
    }
    chunks.push(text.slice(start, breakPoint).trim())
    start = breakPoint - overlap
    if (start >= breakPoint) start = breakPoint
  }
  return chunks.filter(c => c.length > 0)
}

export async function generateEvidenceSummary(evidenceText: string): Promise<string> {
  const chunks = splitIntoChunks(evidenceText, MAX_CHUNK_SIZE, CHUNK_OVERLAP)

  if (chunks.length === 1) {
    const prompt = `Analyze the following evidence and provide a structured factual summary.

CRITICAL RULES:
- Base the summary ONLY on facts explicitly stated in the text
- NEVER copy sentences verbatim from the source
- Synthesize information into your own analytical language
- Include: key facts, named entities, specific dates/figures, stated relationships
- Exclude: speculation, opinions, or claims not supported by the text
- If the text is a government plan or policy document, capture: objectives, timelines, responsible parties, budget figures, and stated outcomes

Evidence:
${chunks[0]}

Provide a concise analytical summary in 2-3 paragraphs.`

    return generateWithAI(prompt, {
      systemPrompt: "You are a senior intelligence analyst. Summarize evidence analytically. NEVER copy text verbatim. Synthesize facts into original prose.",
      temperature: 0.2,
      maxTokens: 1024,
    })
  }

  const chunkSummaries: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const prompt = `You are processing chunk ${i + 1} of ${chunks.length} from a large intelligence document.

CRITICAL RULES:
- Extract ONLY facts explicitly stated in this chunk
- NEVER copy sentences verbatim
- Use analytical, synthesized language
- Capture: key facts, named entities, dates, figures, relationships, stated objectives

Chunk ${i + 1}/${chunks.length}:
${chunks[i]}

Provide a concise factual summary of this chunk (max 200 words).`

    const summary = await generateWithAI(prompt, {
      systemPrompt: "You are a document analysis system. Extract and synthesize facts. Never copy verbatim.",
      temperature: 0.2,
      maxTokens: 512,
    })
    chunkSummaries.push(summary)
  }

  const combinedSummaries = chunkSummaries.join("\n\n---\n\n")

  const finalPrompt = `You are synthesizing ${chunks.length} chunk summaries into a single coherent intelligence summary.

CRITICAL RULES:
- Produce an original analytical summary — NEVER copy from the chunk summaries verbatim
- Integrate facts across all chunks into a unified narrative
- Maintain factual accuracy — only include claims supported by the source text
- Structure: overview, key facts/figures, entities involved, stated objectives/outcomes, timeline
- If this is a national development plan, capture: strategic pillars, budget allocations, responsible ministries, target dates, and stated deliverables

Chunk Summaries:
${combinedSummaries}

Provide the final synthesized summary (max 400 words).`

  return generateWithAI(finalPrompt, {
    systemPrompt: "You are a senior intelligence analyst synthesizing multi-chunk document analysis. Produce original prose. Never copy verbatim.",
    temperature: 0.2,
    maxTokens: 1024,
  })
}
