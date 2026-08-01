# ATIS Forensic Report — Why Entities, Timelines & Relationships Are Empty

## Executive Summary

After tracing every line of code in your repository, I found **three distinct root causes**:

1. **Cerebras API calls hang indefinitely** (no fetch timeout) → background worker freezes forever
2. **Relationship extraction was never implemented** → `relationships` table has zero rows by design
3. **Timeline-entity linking was never implemented** → `timelineEvents.entityIds` is always `"[]"`

## 1. Why Entities Don't Show

### Expected
Upload evidence → AI extracts entities → saves to `entities` + `evidence_entities` tables → detail page shows entity list.

### Actual
Upload evidence → background worker starts → calls `extractEntitiesFromText()` → calls `generateWithAI()` → **fetch() to Cerebras hangs forever with no timeout** → Promise never resolves → worker frozen → no entities saved.

### Evidence from code

**`lib/ai/client.ts` (BEFORE fix):**
```ts
const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
  method: "POST",
  headers: { ... },
  body: JSON.stringify({...}),
})
// NO timeout. NO AbortController.
```

When Cerebras is under load or rate-limiting, the connection hangs. Node.js waits indefinitely. The background worker Promise never resolves. No subsequent stages run.

**`app/api/evidence/route.ts` error handling:**
```ts
try {
  const extractedEntities = await extractEntitiesFromText(content)
  // ... save loop ...
} catch {
  // silent fail — but if the Promise never resolves, catch never fires either
}
```

The `catch` only fires if the Promise **rejects**. If it **hangs forever**, the `catch` never runs.

### Fix
Added `AbortController` with 60-second timeout to `fetch()` in `lib/ai/client.ts`. If Cerebras doesn't respond in 60s, the request is aborted, the Promise rejects, and the worker continues to the next stage.

## 2. Why Timelines Don't Show

### Expected
Upload evidence → AI extracts dated events → saves to `timeline_events` table → detail page shows timeline.

### Actual
**Two problems:**

**Problem A:** Same as entities — the Cerebras fetch hangs, so `extractTimelineEvents()` never returns. The timeline stage never runs.

**Problem B:** Even when timeline extraction succeeds, entities are never linked to events.

**`app/api/evidence/route.ts` (original):**
```ts
db.insert(timelineEvents).values({
  date: evt.date,
  title: evt.title,
  description: evt.description,
  evidenceId: result.id,
  entityIds: "[]",  // ← HARD-CODED EMPTY ARRAY
  createdBy: user.id,
}).run()
```

The `entityIds` column is always `"[]"`. The AI was never asked to return which entities are involved in each event.

### Fix
1. Added timeout to fetch (same fix as entities)
2. Updated `extractTimelineEvents()` prompt to request `entityNames` per event
3. Updated the save loop to map entity names to IDs and store them

## 3. Why Relationships Don't Show

### Expected
Upload evidence → AI analyzes entity connections → saves to `relationships` table → graph page shows network.

### Actual
**The feature was never implemented.**

I searched every file in the repository for:
- `relationships` → only table definition and manual CRUD API
- `relation` → only `relationshipType` field in `storyEvidence`
- `edge` → only variable name in graph API
- `connect` → not found

**The ingestion pipeline has NO stage for relationship extraction.**

The pipeline goes:
```
Confidence → Topics → Entities → Timeline → Summary → Story Matching → Done
```

There is no "Relationship Extraction" step.

### Fix
Created `lib/ai/relationships.ts` with `extractRelationshipsFromText()` and added it as Stage 4 in the background worker.

## 4. Rate Limiter Race Condition

**`lib/ai/rate-limiter.ts` (BEFORE fix):**
```ts
if (state.requestsThisMinute >= MAX_RPM) {
  await sleep(wait)
  return acquireSlot(tokens) // recurse
}
await sleep(2000)
state.requestsThisMinute++
state.tokensThisMinute += tokens
```

Two concurrent calls can both pass the limit check before either increments state, causing a burst that exceeds Cerebras limits.

### Fix
Replaced with a proper FIFO queue. Requests are queued and processed one at a time with enforced gaps.

## 5. Complete Execution Chain

```
Upload
│
├─→ Save evidence ──────────────────────────────── ✅ Works (<100ms)
│   └─→ Insert into `evidence` table
│
├─→ Background Worker Starts
│   │
│   ├─→ Stage 1: Confidence Evaluation ─────────── ❌ HANGS (fetch timeout)
│   │   └─→ Calls evaluateSourceConfidence()
│   │       └─→ Calls generateWithAI()
│   │           └─→ fetch("https://api.cerebras.ai/...")
│   │               └─→ NO TIMEOUT → hangs forever
│   │
│   ├─→ Stage 2: Topic Extraction ──────────────── ❌ Never runs (worker frozen)
│   │
│   ├─→ Stage 3: Entity Extraction ─────────────── ❌ Never runs (worker frozen)
│   │   └─→ Would save to `entities` + `evidence_entities`
│   │
│   ├─→ Stage 4: Relationship Extraction ───────── ❌ NEVER IMPLEMENTED
│   │   └─→ Would save to `relationships`
│   │
│   ├─→ Stage 5: Timeline Extraction ───────────── ❌ Never runs (worker frozen)
│   │   └─→ Would save to `timeline_events`
│   │       └─→ entityIds would be "[]" anyway (hard-coded)
│   │
│   ├─→ Stage 6: Summarization ─────────────────── ❌ Never runs (worker frozen)
│   │
│   ├─→ Stage 7: Story Matching ────────────────── ❌ Never runs (worker frozen)
│   │
│   └─→ Stage 8: Finalization ──────────────────── ❌ Never runs (worker frozen)
│
└─→ Evidence Detail Page
    ├─→ Queries `evidence_entities` → empty → "No entities extracted"
    ├─→ Queries `timeline_events` → empty → "No timeline events"
    └─→ Queries `relationships` → empty → Graph is blank
```

**Execution stops at:** `generateWithAI()` → `fetch()` to Cerebras. The connection hangs. The worker freezes.

## 6. File Placement

| File in this zip | Destination | Action |
|------------------|-------------|--------|
| `lib/ai/client.ts` | `lib/ai/client.ts` | **Replace** — Add fetch timeout |
| `lib/ai/rate-limiter.ts` | `lib/ai/rate-limiter.ts` | **Replace** — Fix race condition |
| `lib/ai/relationships.ts` | `lib/ai/relationships.ts` | **Create** — NEW |
| `lib/ai/entities.ts` | `lib/ai/entities.ts` | **Replace** — Link timeline to entities |
| `app/api/evidence/route.ts` | `app/api/evidence/route.ts` | **Replace** — Parallel stages + relationships + worker timeout |
| `app/api/debug/route.ts` | `app/api/debug/route.ts` | **Create** — NEW: Diagnostic endpoint |

## 7. How to Verify the Fix

1. Apply all files from this zip.
2. Restart dev server: `npm run dev --turbo`
3. Upload a new piece of evidence with content.
4. Open browser dev tools → Network tab.
5. Watch `/api/jobs/:jobId` polls. You should see stage updates every 2 seconds.
6. **Check terminal logs.** You should see:
   ```
   [ai/client] Attempt 1/3 — 1200 input tokens, model: gemma-4-31b
   [rate-limiter] Slot acquired. RPM: 1/5, TPM: 1200/30000
   [ai/client] ✅ Success on attempt 1. Input: 1200tok, Output: 450tok
   ```
7. If a call fails, you'll see:
   ```
   [ai/client] ❌ Attempt 1/3 failed: Cerebras API error: 429 {...}
   [ai/client] Backing off 2000ms before retry...
   ```
8. **If a call hangs**, after 60 seconds you'll see:
   ```
   [ai/client] ⏱️ Attempt 1 ABORTED after 60000ms (timeout)
   [ai/client] Backing off 2000ms before retry...
   ```
9. After processing completes, check the debug endpoint:
   ```
   GET http://localhost:3000/api/debug
   ```
   This returns database counts, rate limiter status, and recent job statuses.

## 8. If It Still Doesn't Work

If entities/timelines still don't appear after applying these fixes:

1. **Check `/api/debug`** — look at `jobs` array. If a job shows `status: "failed"`, read the `error` field.
2. **Check terminal logs** — look for `[ai/client]` messages. If you see repeated timeouts, Cerebras may be completely down or your API key may be invalid.
3. **Test Cerebras directly:**
   ```bash
   curl -X POST https://api.cerebras.ai/v1/chat/completions      -H "Authorization: Bearer $CEREBRAS_API_KEY"      -H "Content-Type: application/json"      -d '{"model":"gemma-4-31b","messages":[{"role":"user","content":"Hello"}]}'
   ```
4. **Check `env` in `/api/debug`** — verify `hasApiKey: true` and `cerebrasModel` is set correctly.
