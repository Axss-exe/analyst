import { z } from "zod"

const AIResponseSchema = z.object({
  content: z.string(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
})

export interface AIGenerationOptions {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

// Maximum characters per chunk (~3000 tokens, leaving room for prompt)
const MAX_CHUNK_SIZE = 12000
// Overlap between chunks to maintain context
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

export async function generateWithAI(
  prompt: string,
  options: AIGenerationOptions = {}
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY
  const model = process.env.CEREBRAS_MODEL || "gemma-4-31b"
  const temperature = options.temperature ?? parseFloat(process.env.AI_TEMPERATURE || "0.3")
  const maxTokens = options.maxTokens ?? parseInt(process.env.AI_MAX_TOKENS || "4096")

  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY not configured")
  }

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Cerebras API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ""
}

/**
 * Generates a factual summary from evidence text.
 * For large documents, uses a map-reduce chunking strategy.
 */
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

  // Large document: Map-reduce approach
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

// ==================== TOPIC & STORY DISCOVERY ====================

export interface ExtractedTopics {
  topics: string[]
  themes: string[]
  geographicFocus: string[]
  temporalRange: { start?: string; end?: string }
  keyEntities: string[]
  sector: string[]
}

/**
 * Extracts topics, themes, and thematic metadata from evidence text.
 * Used for clustering evidence into potential stories.
 */
export async function extractTopicsFromText(text: string): Promise<ExtractedTopics> {
  const prompt = `Analyze the following intelligence evidence and extract its thematic structure.

Text (first 4000 chars):
${text.slice(0, 4000)}

Respond in this exact JSON format:
{
  "topics": ["topic1", "topic2", "topic3"],
  "themes": ["theme1", "theme2"],
  "geographicFocus": ["country/region1", "country/region2"],
  "temporalRange": { "start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null" },
  "keyEntities": ["entity1", "entity2", "entity3"],
  "sector": ["sector1", "sector2"]
}

Guidelines:
- topics: 3-5 specific subject areas (e.g., "infrastructure investment", "mining regulation", "bilateral trade")
- themes: 1-3 overarching themes (e.g., "economic development", "geopolitical influence")
- geographicFocus: countries, regions, or cities mentioned
- temporalRange: earliest and latest dates mentioned (null if none)
- keyEntities: important named organizations, people, or projects
- sector: industry sectors (e.g., "mining", "agriculture", "energy", "finance")

Only output valid JSON.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a thematic analysis engine. Extract structured topics and themes from intelligence text.",
    temperature: 0.1,
    maxTokens: 1024,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        themes: Array.isArray(parsed.themes) ? parsed.themes : [],
        geographicFocus: Array.isArray(parsed.geographicFocus) ? parsed.geographicFocus : [],
        temporalRange: parsed.temporalRange || { start: null, end: null },
        keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
        sector: Array.isArray(parsed.sector) ? parsed.sector : [],
      }
    }
  } catch {
    // fall through
  }

  return { topics: [], themes: [], geographicFocus: [], temporalRange: { start: null, end: null }, keyEntities: [], sector: [] }
}

export interface EvidenceSimilarityResult {
  score: number
  sharedTopics: string[]
  sharedEntities: string[]
  sharedThemes: string[]
  temporalProximity: number // 0-1, higher = closer in time
  reasoning: string
}

/**
 * Compares two pieces of evidence and returns a similarity score + reasoning.
 */
export async function evaluateEvidenceSimilarity(
  evidenceA: { title: string; summary: string; topics: ExtractedTopics; entities: string[]; publicationDate?: string | null },
  evidenceB: { title: string; summary: string; topics: ExtractedTopics; entities: string[]; publicationDate?: string | null }
): Promise<EvidenceSimilarityResult> {
  const prompt = `Compare two pieces of intelligence evidence and assess their similarity.

Evidence A: "${evidenceA.title}"
Summary: ${evidenceA.summary.slice(0, 500)}
Topics: ${evidenceA.topics.topics.join(", ")}
Entities: ${evidenceA.entities.join(", ")}

Evidence B: "${evidenceB.title}"
Summary: ${evidenceB.summary.slice(0, 500)}
Topics: ${evidenceB.topics.topics.join(", ")}
Entities: ${evidenceB.entities.join(", ")}

Respond in this exact JSON format:
{
  "score": 0.75,
  "sharedTopics": ["topic1"],
  "sharedEntities": ["entity1"],
  "sharedThemes": ["theme1"],
  "temporalProximity": 0.8,
  "reasoning": "Brief explanation of why they are similar or different"
}

Score from 0.0 to 1.0:
- 0.0-0.2: Unrelated
- 0.2-0.4: Tangentially related (same broad region or sector)
- 0.4-0.6: Moderately related (shared topics or some entities)
- 0.6-0.8: Strongly related (multiple shared topics/entities/themes)
- 0.8-1.0: Very strongly related (same story, different sources)

Only output valid JSON.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are an intelligence comparison engine. Be conservative. High scores require strong thematic and entity overlap.",
    temperature: 0.1,
    maxTokens: 512,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0)),
        sharedTopics: Array.isArray(parsed.sharedTopics) ? parsed.sharedTopics : [],
        sharedEntities: Array.isArray(parsed.sharedEntities) ? parsed.sharedEntities : [],
        sharedThemes: Array.isArray(parsed.sharedThemes) ? parsed.sharedThemes : [],
        temporalProximity: Math.max(0, Math.min(1, parsed.temporalProximity || 0)),
        reasoning: parsed.reasoning || "",
      }
    }
  } catch {
    // fall through
  }

  // Fallback: compute simple overlap
  const aTopics = new Set(evidenceA.topics.topics.map(t => t.toLowerCase()))
  const bTopics = new Set(evidenceB.topics.topics.map(t => t.toLowerCase()))
  const sharedT = [...aTopics].filter(t => bTopics.has(t))

  const aEnts = new Set(evidenceA.entities.map(e => e.toLowerCase()))
  const bEnts = new Set(evidenceB.entities.map(e => e.toLowerCase()))
  const sharedE = [...aEnts].filter(e => bEnts.has(e))

  const topicScore = Math.min(1, sharedT.length / 3)
  const entityScore = Math.min(1, sharedE.length / 2)
  const fallbackScore = (topicScore * 0.5) + (entityScore * 0.5)

  return {
    score: fallbackScore,
    sharedTopics: sharedT,
    sharedEntities: sharedE,
    sharedThemes: [],
    temporalProximity: 0.5,
    reasoning: `Fallback similarity: ${sharedT.length} shared topics, ${sharedE.length} shared entities`,
  }
}

export interface StoryProposal {
  title: string
  overview: string
  confidence: number
  evidenceIds: number[]
  sharedTopics: string[]
  sharedEntities: string[]
  sharedThemes: string[]
  reasoning: string
}

/**
 * Given a cluster of related evidence, proposes a story title and overview.
 */
export async function proposeStoryFromEvidence(
  evidenceCluster: Array<{ id: number; title: string; summary: string; topics: ExtractedTopics; entities: string[] }>
): Promise<StoryProposal> {
  const evidenceText = evidenceCluster
    .map((e, i) => `[${i + 1}] ${e.title}\n${e.summary.slice(0, 300)}\nTopics: ${e.topics.topics.join(", ")}\nEntities: ${e.entities.join(", ")}`)
    .join("\n\n---\n\n")

  const prompt = `You are an intelligence analyst reviewing ${evidenceCluster.length} related pieces of evidence.
Your task: propose an intelligence story that connects these evidence items.

Evidence Items:
${evidenceText}

Respond in this exact JSON format:
{
  "title": "Compelling story title (5-10 words)",
  "overview": "2-3 paragraph analytical overview connecting the evidence thematically. Explain the narrative arc, key actors, and significance.",
  "sharedTopics": ["topic1", "topic2"],
  "sharedEntities": ["entity1", "entity2"],
  "sharedThemes": ["theme1", "theme2"],
  "reasoning": "Why these evidence items belong together"
}

Rules:
- Title should be specific and informative, not generic
- Overview must synthesize, not just list the evidence
- Identify the central narrative that connects all pieces
- Note any contradictions or gaps in the evidence
- Only output valid JSON`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a senior intelligence analyst who excels at finding connections between disparate evidence and weaving them into coherent narratives.",
    temperature: 0.3,
    maxTokens: 1536,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title || "Untitled Story Proposal",
        overview: parsed.overview || "",
        confidence: 0.7,
        evidenceIds: evidenceCluster.map(e => e.id),
        sharedTopics: Array.isArray(parsed.sharedTopics) ? parsed.sharedTopics : [],
        sharedEntities: Array.isArray(parsed.sharedEntities) ? parsed.sharedEntities : [],
        sharedThemes: Array.isArray(parsed.sharedThemes) ? parsed.sharedThemes : [],
        reasoning: parsed.reasoning || "",
      }
    }
  } catch {
    // fall through
  }

  // Fallback
  const allTopics = new Set<string>()
  const allEntities = new Set<string>()
  evidenceCluster.forEach(e => {
    e.topics.topics.forEach(t => allTopics.add(t))
    e.entities.forEach(ent => allEntities.add(ent))
  })

  return {
    title: `Story: ${evidenceCluster[0].title.slice(0, 40)}...`,
    overview: `A collection of ${evidenceCluster.length} related evidence items sharing themes: ${[...allTopics].slice(0, 5).join(", ")}.`,
    confidence: 0.5,
    evidenceIds: evidenceCluster.map(e => e.id),
    sharedTopics: [...allTopics],
    sharedEntities: [...allEntities],
    sharedThemes: [],
    reasoning: "Fallback proposal based on shared topics and entities.",
  }
}

// ==================== EXISTING FUNCTIONS ====================

export async function generateBriefContent(params: {
  storyTitle: string
  storyOverview: string
  evidenceItems: Array<{ title: string; summary: string; source: string }>
  mode: "full" | "partial" | "since_last"
}): Promise<{
  headline: string
  executiveSummary: string
  detailedNarrative: string
  keyFindings: string[]
  references: string[]
}> {
  const evidenceText = params.evidenceItems
    .map((e, i) => `[${i + 1}] ${e.title} - ${e.source}\n${e.summary}`)
    .join("\n\n")

  const prompt = `Generate a professional intelligence brief based on the following evidence.

Story: ${params.storyTitle}
Overview: ${params.storyOverview}
Generation Mode: ${params.mode}

Evidence:
${evidenceText}

Generate the brief in this exact JSON format:
{
  "headline": "Compelling headline summarizing the story",
  "executiveSummary": "2-3 paragraph executive summary",
  "detailedNarrative": "Detailed narrative connecting the evidence",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "references": ["[1] Title - Source", "[2] Title - Source"]
}

Only output valid JSON. No markdown, no explanations.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a senior intelligence analyst writing professional briefs. Base everything on evidence. No speculation.",
    temperature: 0.3,
    maxTokens: 4096,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return {
      headline: params.storyTitle,
      executiveSummary: response.slice(0, 500),
      detailedNarrative: response,
      keyFindings: ["Evidence-based finding pending review"],
      references: params.evidenceItems.map((e, i) => `[${i + 1}] ${e.title} - ${e.source}`),
    }
  } catch {
    return {
      headline: params.storyTitle,
      executiveSummary: response.slice(0, 500),
      detailedNarrative: response,
      keyFindings: ["Evidence-based finding pending review"],
      references: params.evidenceItems.map((e, i) => `[${i + 1}] ${e.title} - ${e.source}`),
    }
  }
}

export async function evaluateStoryRelevance(
  evidenceSummary: string,
  storyTitle: string,
  storyOverview: string
): Promise<{ score: number; reasoning: string }> {
  const prompt = `Evaluate how relevant this new evidence is to an existing intelligence story.

Story: ${storyTitle}
Story Overview: ${storyOverview}

New Evidence Summary: ${evidenceSummary}

Rate relevance from 0.0 to 1.0 where:
- 0.0: Completely unrelated
- 0.3: Tangentially related
- 0.5: Moderately relevant
- 0.7: Strongly relevant
- 1.0: Directly confirms or contradicts the story

Respond in this JSON format only:
{ "score": 0.75, "reasoning": "Brief explanation of relevance" }`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are an intelligence matching system. Be conservative with scores. Only high scores for direct relevance.",
    temperature: 0.1,
    maxTokens: 512,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return { score: Math.max(0, Math.min(1, parsed.score || 0)), reasoning: parsed.reasoning || "" }
    }
  } catch {
    // fall through
  }

  return { score: 0.3, reasoning: "Unable to evaluate automatically" }
}

export async function evaluateSourceConfidence(
  text: string,
  sourceType: string,
  source: string
): Promise<{ score: number; reasoning: string; factors: string[] }> {
  const prompt = `Evaluate the reliability and confidence level of the following intelligence source.

Source Type: ${sourceType}
Source: ${source}
Text Sample (first 3000 chars):
${text.slice(0, 3000)}

Analyze the following factors and respond in this exact JSON format:
{
  "score": 0.75,
  "reasoning": "Brief explanation of the confidence assessment",
  "factors": [
    "Factor 1: description",
    "Factor 2: description"
  ]
}

Confidence scoring guide:
- 0.9-1.0: Official government document, audited financial report, primary source with verifiable data
- 0.7-0.89: Reputable news outlet, established NGO report, academic research
- 0.5-0.69: Industry analysis, think tank report, secondary source with some citations
- 0.3-0.49: Blog post, social media, unverified claim, analyst note without sources
- 0.0-0.29: Rumor, anonymous source, clearly biased source, fabricated content indicators

Consider:
1. Source authority (official > reputable media > unknown)
2. Presence of specific data (names, dates, figures, locations)
3. Internal consistency and logical coherence
4. Corroboration potential (can facts be independently verified?)
5. Attribution (named authors vs anonymous)
6. Currency (recent vs outdated)
7. Bias indicators (emotional language, unsupported claims)

Only output valid JSON.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are an intelligence source reliability analyst. Be conservative. Require strong evidence for high scores.",
    temperature: 0.1,
    maxTokens: 1024,
  })

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
        reasoning: parsed.reasoning || "No detailed reasoning available",
        factors: Array.isArray(parsed.factors) ? parsed.factors : [],
      }
    }
  } catch {
    // fall through
  }

  const typeScores: Record<string, number> = {
    government: 0.85, report: 0.75, pdf: 0.7, word: 0.65,
    news: 0.6, website: 0.5, image: 0.4, analyst_note: 0.45,
  }
  const fallbackScore = typeScores[sourceType] || 0.5

  return {
    score: fallbackScore,
    reasoning: `Fallback assessment based on source type "${sourceType}". AI evaluation failed.`,
    factors: [`Source type "${sourceType}" assigned baseline score of ${fallbackScore}`],
  }
}

export async function extractEntitiesFromText(text: string): Promise<
  Array<{ name: string; type: string; aliases: string[] }>
> {
  const prompt = `Extract named entities from the following text. Identify people, organizations, companies, governments, projects, locations, minerals, legislation, banks, investors, mines, and infrastructure.

Text:
${text.slice(0, 4000)}

Respond in this JSON format only:
[
  { "name": "Entity Name", "type": "person|organization|company|government|project|location|minerals|legislation|bank|investor|mine|infrastructure", "aliases": ["Alias1", "Alias2"] }
]

Only output valid JSON array.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are an entity extraction system. Extract only entities explicitly mentioned in the text.",
    temperature: 0.1,
    maxTokens: 2048,
  })

  try {
    const jsonMatch = response.match(/\[.*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // fall through
  }

  return []
}

export async function extractTimelineEvents(text: string): Promise<
  Array<{ date: string; title: string; description: string }>
> {
  const prompt = `Extract timeline events with dates from the following text.

Text:
${text.slice(0, 4000)}

Respond in this JSON format only:
[
  { "date": "YYYY-MM-DD", "title": "Event Title", "description": "Brief description" }
]

Use approximate dates if exact dates are not available. Only output valid JSON array.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a timeline extraction system. Extract only events with explicit or strongly implied dates.",
    temperature: 0.1,
    maxTokens: 2048,
  })

  try {
    const jsonMatch = response.match(/\[.*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // fall through
  }

  return []
}
