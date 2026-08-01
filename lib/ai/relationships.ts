import { generateWithAI } from "./client"

export interface ExtractedRelationship {
  sourceName: string
  targetName: string
  type: string
  description: string
  confidence: number
}

export async function extractRelationshipsFromText(
  text: string,
  entityNames: string[]
): Promise<ExtractedRelationship[]> {
  if (entityNames.length < 2) {
    return []
  }

  const sample = text.slice(0, 30000)

  const prompt = `You are analyzing an intelligence document to identify relationships between the following entities.

Entities mentioned in the document:
${entityNames.join(", ")}

Document text (representative sample):
${sample}

For each relationship you find, respond with a JSON object in this array format:
[
  {
    "sourceName": "Entity A",
    "targetName": "Entity B",
    "type": "owns|invests_in|partners_with|regulates|supplies|competes_with|affiliated_with|contracted_by|subsidiary_of|operates_in",
    "description": "Brief description of the relationship as stated in the document",
    "confidence": 0.85
  }
]

Rules:
- Only include relationships EXPLICITLY stated or strongly implied in the text
- Do NOT invent relationships not supported by the document
- Use the exact entity names from the list above
- Confidence: 0.9-1.0 = directly stated, 0.7-0.89 = strongly implied, 0.5-0.69 = moderately implied, <0.5 = weak
- If no relationships are found, return an empty array: []

Only output valid JSON array.`

  const response = await generateWithAI(prompt, {
    systemPrompt: "You are a relationship extraction engine. Only report relationships supported by evidence.",
    temperature: 0.1,
    maxTokens: 2048,
    timeoutMs: 45000,
  })

  try {
    const jsonMatch = response.match(/\[.*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        return parsed.filter((r: any) =>
          entityNames.includes(r.sourceName) &&
          entityNames.includes(r.targetName) &&
          r.sourceName !== r.targetName
        ).map((r: any) => ({
          sourceName: r.sourceName,
          targetName: r.targetName,
          type: r.type || "related",
          description: r.description || "",
          confidence: Math.max(0, Math.min(1, r.confidence || 0.5)),
        }))
      }
    }
  } catch (e) {
    console.error("[relationships] Parse failed:", e)
  }

  return []
}
