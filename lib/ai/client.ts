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
