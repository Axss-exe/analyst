import { generateWithAI } from "./client"

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
