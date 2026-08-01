/**
 * Cerebras rate limiter.
 * Models: gemma-4-31b, gpt-oss-120b
 * Limits: 5 req/min, 30,000 tokens/min
 */

interface RateLimitState {
  requestsThisMinute: number
  tokensThisMinute: number
  windowStart: number
}

let state: RateLimitState = {
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  windowStart: Date.now(),
}

const MAX_RPM = 5
const MAX_TPM = 30000
const WINDOW_MS = 60000

function resetWindowIfNeeded() {
  const now = Date.now()
  if (now - state.windowStart >= WINDOW_MS) {
    state.requestsThisMinute = 0
    state.tokensThisMinute = 0
    state.windowStart = now
  }
}

function msUntilNextWindow(): number {
  return Math.max(0, WINDOW_MS - (Date.now() - state.windowStart))
}

export async function acquireSlot(tokens: number): Promise<void> {
  resetWindowIfNeeded()

  // Check if we'd exceed RPM
  if (state.requestsThisMinute >= MAX_RPM) {
    const wait = msUntilNextWindow() + 100 // small buffer
    console.log(`[rate-limiter] RPM limit reached. Waiting ${wait}ms...`)
    await sleep(wait)
    return acquireSlot(tokens) // Recurse after window reset
  }

  // Check if we'd exceed TPM
  if (state.tokensThisMinute + tokens > MAX_TPM) {
    const wait = msUntilNextWindow() + 100
    console.log(`[rate-limiter] TPM limit reached (${state.tokensThisMinute} + ${tokens} > ${MAX_TPM}). Waiting ${wait}ms...`)
    await sleep(wait)
    return acquireSlot(tokens)
  }

  // Add small delay between requests to avoid burst (minimum 2s gap)
  await sleep(2000)

  state.requestsThisMinute++
  state.tokensThisMinute += tokens
  console.log(`[rate-limiter] Slot acquired. RPM: ${state.requestsThisMinute}/${MAX_RPM}, TPM: ${state.tokensThisMinute}/${MAX_TPM}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getRateLimitStatus() {
  resetWindowIfNeeded()
  return {
    requestsThisMinute: state.requestsThisMinute,
    tokensThisMinute: state.tokensThisMinute,
    maxRpm: MAX_RPM,
    maxTpm: MAX_TPM,
    windowResetIn: msUntilNextWindow(),
  }
}
