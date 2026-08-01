import { generateWithAI } from "./client"
import { estimateTokens } from "./token-counter"

function extractJsonArray(response: string): any[] | null {
  // Try to extract JSON array from markdown code blocks first
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (Array.isArray(parsed)) return parsed
    } catch { /* fall through */ }
  }

  // Try raw JSON array with dotAll flag (CRITICAL FIX: added /s)
  const jsonMatch = response.match(/\[.*\]/s)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch { /* fall through */ }
  }

  // Fallback: find first [ and last ] and try to parse
  const start = response.indexOf("[")
  const end = response.lastIndexOf("]")
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(response.slice(start, end + 1))
    } catch { /* fall through */ }
  }

  return null
}

export async function extractEntitiesFromText(text: string): Promise<
  Array<{ name: string; type: string; aliases: string[] }>
> {
  const sample = text.slice(0, 25000)
  console.log(`[entities] Processing sample of ${estimateTokens(sample)} tokens`)

  const prompt = `Extract named entities from the following text. Identify people, organizations, companies, governments, projects, locations, minerals, legislation, banks, investors, mines, and infrastructure.

Text:
${sample}

Respond in this JSON format only:
[
  { "name": "Entity Name", "type": "person|organization|company|government|project|location|minerals|legislation|bank|investor|mine|infrastructure", "aliases": ["Alias1", "Alias2"] }
]

CRITICAL RULES:
- Every entity MUST have a non-empty "name" field.
- Every entity MUST have a non-empty "type" field from the allowed list.
- "aliases" may be an empty array [] but must be present.
- Only output valid JSON array. No markdown, no explanations.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are an entity extraction system. Extract only entities explicitly mentioned in the text. NEVER return empty names.",
    temperature: 0.1,
    maxTokens: 2048,
  })

  const parsed = extractJsonArray(response)
  if (parsed && Array.isArray(parsed)) {
    // Filter out invalid entries
    const valid = parsed.filter(
      (e: any) =>
        e &&
        typeof e.name === "string" &&
        e.name.trim().length > 0 &&
        typeof e.type === "string" &&
        e.type.trim().length > 0
    )
    if (valid.length !== parsed.length) {
      console.warn(`[entities] Filtered ${parsed.length - valid.length} invalid entities from LLM response`)
    }
    return valid.map((e: any) => ({
      name: e.name.trim(),
      type: e.type.trim().toLowerCase(),
      aliases: Array.isArray(e.aliases) ? e.aliases.filter((a: any) => typeof a === "string" && a.trim().length > 0) : [],
    }))
  }

  console.warn("[entities] Failed to parse LLM response:", response.slice(0, 200))
  return []
}

export async function extractTimelineEvents(text: string): Promise<
  Array<{ date: string; title: string; description: string }>
> {
  const sample = text.slice(0, 25000)

  const prompt = `Extract timeline events with dates from the following text.

Text:
${sample}

Respond in this JSON format only:
[
  { "date": "YYYY-MM-DD", "title": "Event Title", "description": "Brief description" }
]

CRITICAL RULES:
- Every event MUST have a non-empty "date", "title", and "description".
- Use approximate dates if exact dates are not available (e.g., "2025-02-01" for "February 2025").
- If only a year is given, use "YYYY-01-01".
- If a month and year are given, use "YYYY-MM-01".
- Only output valid JSON array. No markdown, no explanations.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a timeline extraction system. Extract only events with explicit or strongly implied dates.",
    temperature: 0.1,
    maxTokens: 2048,
  })

  const parsed = extractJsonArray(response)
  if (parsed && Array.isArray(parsed)) {
    const valid = parsed.filter(
      (e: any) =>
        e &&
        typeof e.date === "string" &&
        e.date.trim().length > 0 &&
        typeof e.title === "string" &&
        e.title.trim().length > 0 &&
        typeof e.description === "string" &&
        e.description.trim().length > 0
    )
    if (valid.length !== parsed.length) {
      console.warn(`[timeline] Filtered ${parsed.length - valid.length} invalid events from LLM response`)
    }
    return valid.map((e: any) => ({
      date: e.date.trim(),
      title: e.title.trim(),
      description: e.description.trim(),
    }))
  }

  console.warn("[timeline] Failed to parse LLM response:", response.slice(0, 200))
  return []
}

export async function extractRelationshipsFromText(
  text: string,
  entities: Array<{ name: string; type: string }>
): Promise<
  Array<{ source: string; target: string; type: string; description: string }>
> {
  if (entities.length < 2) return []

  const sample = text.slice(0, 25000)
  const entityList = entities.map((e, i) => `${i + 1}. ${e.name} (${e.type})`).join("\n")

  const prompt = `Given the following text and the list of entities extracted from it, identify relationships between those entities.

Text:
${sample}

Entities:
${entityList}

Respond in this JSON format only:
[
  { "source": "Entity Name", "target": "Entity Name", "type": "relationship type", "description": "Brief description of the relationship" }
]

CRITICAL RULES:
- Only use entity names EXACTLY as they appear in the list above.
- "source" and "target" MUST be non-empty and MUST match names from the entity list.
- "type" should describe the relationship (e.g., "owns", "regulates", "works for", "funds", "opposes").
- "description" must be a brief factual sentence.
- Only output valid JSON array. No markdown, no explanations.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a relationship extraction system. Identify factual relationships between named entities. NEVER invent entities not in the list.",
    temperature: 0.1,
    maxTokens: 2048,
  })

  const parsed = extractJsonArray(response)
  if (parsed && Array.isArray(parsed)) {
    const valid = parsed.filter(
      (r: any) =>
        r &&
        typeof r.source === "string" &&
        r.source.trim().length > 0 &&
        typeof r.target === "string" &&
        r.target.trim().length > 0 &&
        typeof r.type === "string" &&
        r.type.trim().length > 0 &&
        typeof r.description === "string" &&
        r.description.trim().length > 0
    )
    if (valid.length !== parsed.length) {
      console.warn(`[relationships] Filtered ${parsed.length - valid.length} invalid relationships from LLM response`)
    }
    return valid.map((r: any) => ({
      source: r.source.trim(),
      target: r.target.trim(),
      type: r.type.trim(),
      description: r.description.trim(),
    }))
  }

  console.warn("[relationships] Failed to parse LLM response:", response.slice(0, 200))
  return []
}
