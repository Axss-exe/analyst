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

export async function generateWithAI(
  prompt: string,
  options: AIGenerationOptions = {}
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY
  const model = process.env.CEREBRAS_MODEL || "llama3.1-70b"
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

export async function generateEvidenceSummary(evidenceText: string): Promise<string> {
  const prompt = `Analyze the following evidence and provide a structured summary. Include key facts, entities mentioned, dates, and relationships. Keep it factual and evidence-based.

Evidence:
${evidenceText}

Provide a concise summary in 2-3 paragraphs.`

  return generateWithAI(prompt, {
    systemPrompt: "You are an intelligence analyst. Summarize evidence factually. Never speculate.",
    temperature: 0.2,
    maxTokens: 1024,
  })
}

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
    systemPrompt: "You are a senior intelligence analyst writing professional briefs. Base everything on evidence. No speculation. No opportunity or risk analysis.",
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

export async function extractEntitiesFromText(text: string): Promise<
  Array<{ name: string; type: string; aliases: string[] }>
> {
  const prompt = `Extract named entities from the following text. Identify people, organizations, companies, governments, projects, locations, minerals, legislation, banks, investors, mines, and infrastructure.

Text:
${text.slice(0, 4000)}

Respond in this JSON format only:
[
  { "name": "Entity Name", "type": "person|organization|company|government|project|location|mineral|legislation|bank|investor|mine|infrastructure", "aliases": ["Alias1", "Alias2"] }
]

Only output valid JSON array.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are an entity extraction system. Extract only entities explicitly mentioned in the text.",
    temperature: 0.1,
    maxTokens: 2048,
  })

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/)
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
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // fall through
  }

  return []
}
