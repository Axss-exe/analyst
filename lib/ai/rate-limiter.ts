/**
 * Provider rate limiter with request queue.
 * Limits: 5 req/min, 30,000 tokens/min
 */

interface QueuedRequest {
  tokens: number;
  resolve: () => void;
}

interface RateLimitState {
  requestsThisMinute: number;
  tokensThisMinute: number;
  windowStart: number;
  queue: QueuedRequest[];
  isProcessing: boolean;
}

let state: RateLimitState = {
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  windowStart: Date.now(),
  queue: [],
  isProcessing: false,
};

const MAX_RPM = 5;
const MAX_TPM = 30000;
const WINDOW_MS = 60000;
const MIN_GAP_MS = 2000; // minimum gap between requests

let lastRequestTime = 0;

function resetWindowIfNeeded() {
  const now = Date.now();
  if (now - state.windowStart >= WINDOW_MS) {
    state.requestsThisMinute = 0;
    state.tokensThisMinute = 0;
    state.windowStart = now;
    console.log("[rate-limiter] Window reset");
  }
}

function msUntilNextWindow(): number {
  return Math.max(0, WINDOW_MS - (Date.now() - state.windowStart));
}

async function processQueue() {
  if (state.isProcessing) return;
  state.isProcessing = true;

  while (state.queue.length > 0) {
    resetWindowIfNeeded();

    // Check RPM
    if (state.requestsThisMinute >= MAX_RPM) {
      const wait = msUntilNextWindow() + 100;
      console.log(
        `[rate-limiter] RPM limit (${MAX_RPM}) reached. Waiting ${wait}ms for window reset...`,
      );
      await sleep(wait);
      resetWindowIfNeeded();
    }

    const next = state.queue[0];
    if (!next) continue;

    if (next.tokens > MAX_TPM) {
      state.queue.shift();
      next.resolve();
      continue;
    }

    if (state.tokensThisMinute + next.tokens > MAX_TPM) {
      const wait = msUntilNextWindow() + 100;
      console.log(`[rate-limiter] TPM limit (${MAX_TPM}) would be exceeded. Waiting ${wait}ms for window reset...`);
      await sleep(wait);
      continue;
    }

    state.queue.shift();

    // Enforce minimum gap between requests
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - timeSinceLast;
      console.log(`[rate-limiter] Enforcing ${wait}ms gap between requests...`);
      await sleep(wait);
    }

    lastRequestTime = Date.now();
    next.resolve();

    // Small yield to allow the request to increment counters before next loop
    await sleep(100);
  }

  state.isProcessing = false;
}

export async function acquireSlot(tokens: number): Promise<void> {
  if (tokens > MAX_TPM) {
    throw new Error(`AI request exceeds configured token limit: ${tokens} > ${MAX_TPM}`);
  }

  return new Promise((resolve) => {
    state.queue.push({ tokens, resolve: () => {
      state.requestsThisMinute++;
      state.tokensThisMinute += tokens;
      console.log(
        `[rate-limiter] Slot acquired. RPM: ${state.requestsThisMinute}/${MAX_RPM}, TPM: ${state.tokensThisMinute}/${MAX_TPM}, Tokens: ${tokens}`,
      );
      resolve();
    }});
    processQueue();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRateLimitStatus() {
  resetWindowIfNeeded();
  return {
    requestsThisMinute: state.requestsThisMinute,
    tokensThisMinute: state.tokensThisMinute,
    maxRpm: MAX_RPM,
    maxTpm: MAX_TPM,
    windowResetIn: msUntilNextWindow(),
    queueLength: state.queue.length,
  };
}
