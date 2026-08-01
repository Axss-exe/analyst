import { acquireSlot } from "./rate-limiter"
import { estimateTokens } from "./token-counter"

export interface AIGenerationOptions {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  retries?: number
}

export async function generateWithAI(
  prompt: string,
  options: AIGenerationOptions = {}
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY
  const model = process.env.CEREBRAS_MODEL || "llama3.1-70b"
  const temperature = options.temperature ?? parseFloat(process.env.AI_TEMPERATURE || "0.3")
  const maxTokens = options.maxTokens ?? parseInt(process.env.AI_MAX_TOKENS || "4096")
  const maxRetries = options.retries ?? 3

  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY not configured")
  }

  const inputTokens = estimateTokens(prompt + (options.systemPrompt || ""))
  const outputTokens = maxTokens
  const totalTokens = inputTokens + outputTokens

  // Wait for rate limit slot
  await acquireSlot(totalTokens)

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
        const errorText = await response.text()
        // Rate limit hit from API side
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("retry-after") || "60")
          console.log(`[ai/client] Rate limited by API. Retrying after ${retryAfter}s...`)
          await sleep(retryAfter * 1000)
          continue
        }
        throw new Error(`Cerebras API error: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ""
      console.log(`[ai/client] Success on attempt ${attempt}. Input: ${inputTokens}tok, Output: ~${estimateTokens(content)}tok`)
      return content
    } catch (err: any) {
      lastError = err
      console.warn(`[ai/client] Attempt ${attempt}/${maxRetries} failed:`, err.message)
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000)
        await sleep(backoff)
      }
    }
  }

  throw lastError || new Error("All AI generation attempts failed")
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
