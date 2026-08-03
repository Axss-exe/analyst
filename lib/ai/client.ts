import { acquireSlot } from "./rate-limiter";
import { estimateTokens } from "./token-counter";

export interface AIGenerationOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  retries?: number;
  timeoutMs?: number;
}

export async function generateWithAI(
  prompt: string,
  options: AIGenerationOptions = {},
): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  const model = process.env.CEREBRAS_MODEL || "gemma-4-31b";
  const temperature =
    options.temperature ?? parseFloat(process.env.AI_TEMPERATURE || "0.3");
  const maxTokens =
    options.maxTokens ?? parseInt(process.env.AI_MAX_TOKENS || "4096");
  const maxRetries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 60000; // 60 second default timeout

  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY not configured");
  }

  const inputTokens = estimateTokens(prompt + (options.systemPrompt || ""));
  const outputTokens = maxTokens;
  const totalTokens = inputTokens + outputTokens;

  // Wait for rate limit slot
  await acquireSlot(totalTokens);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(
        `[ai/client] Attempt ${attempt}/${maxRetries} — ${inputTokens} input tokens, model: ${model}`,
      );

      const response = await fetch(
        "https://api.cerebras.ai/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              ...(options.systemPrompt
                ? [{ role: "system", content: options.systemPrompt }]
                : []),
              { role: "user", content: prompt },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Rate limit hit from API side
        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers.get("retry-after") || "60",
          );
          console.log(
            `[ai/client] Rate limited by API (429). Retrying after ${retryAfter}s...`,
          );
          await sleep(retryAfter * 1000);
          continue;
        }
        throw new Error(`Cerebras API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const usage = data.usage;
      console.log(
        `[ai/client] ✅ Success on attempt ${attempt}. Input: ${usage?.prompt_tokens || inputTokens}tok, Output: ${usage?.completion_tokens || estimateTokens(content)}tok, Total: ${usage?.total_tokens || "?"}tok`,
      );
      return content;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err.name === "AbortError") {
        console.error(
          `[ai/client] ⏱️ Attempt ${attempt} ABORTED after ${timeoutMs}ms (timeout)`,
        );
      } else {
        console.error(
          `[ai/client] ❌ Attempt ${attempt}/${maxRetries} failed:`,
          err.message,
        );
      }

      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`[ai/client] Backing off ${backoff}ms before retry...`);
        await sleep(backoff);
      }
    }
  }

  throw lastError || new Error("All AI generation attempts failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
