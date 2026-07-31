import { generateWithAI } from "./client"

export interface ExtractedTopics {
  topics: string[]
  themes: string[]
  geographicFocus: string[]
  temporalRange: { start?: string; end?: string }
  keyEntities: string[]
  sector: string[]
}

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
- topics: 3-5 specific subject areas
- themes: 1-3 overarching themes
- geographicFocus: countries, regions, or cities mentioned
- temporalRange: earliest and latest dates mentioned (null if none)
- keyEntities: important named organizations, people, or projects
- sector: industry sectors

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
