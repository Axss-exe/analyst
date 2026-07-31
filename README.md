# ATIS Performance Fixes — Patch v2

This patch fixes the critical bugs discovered after applying v1.

## What Went Wrong in v1

1. **`evaluateStoryRelevance` was in the wrong file** — I put it in `lib/ai/confidence.ts`, but `app/api/evidence/route.ts` imported it from `@/lib/ai/similarity`. This caused webpack to log an import error on every evidence API hit, leaking memory until Node crashed with "JavaScript heap out of memory" at ~3.5 GB.

2. **`/api/evidence/:id/related` loaded 100 full evidence rows** — including potentially large `summary` and `aiMetadata` fields. This caused 30–60 second response times and memory pressure.

## What This Patch Fixes

| Fix | File | Change |
|-----|------|--------|
| Move `evaluateStoryRelevance` to correct module | `lib/ai/similarity.ts` | Added `evaluateStoryRelevance` export |
| Remove duplicate from confidence module | `lib/ai/confidence.ts` | Removed `evaluateStoryRelevance` (now lives in similarity) |
| Update barrel exports | `lib/ai/index.ts` | Re-exports `evaluateStoryRelevance` from `similarity` |
| Fix evidence route import | `app/api/evidence/route.ts` | No change needed — already imports from `similarity`, which now has the function |
| Optimize related evidence queries | `app/api/evidence/[id]/related/route.ts` | Only selects `id, title, sourceType, createdAt` instead of full rows |

## File Placement

| File in this zip | Destination | Action |
|------------------|-------------|--------|
| `lib/ai/similarity.ts` | `lib/ai/similarity.ts` | **Replace** |
| `lib/ai/confidence.ts` | `lib/ai/confidence.ts` | **Replace** |
| `lib/ai/index.ts` | `lib/ai/index.ts` | **Replace** |
| `app/api/evidence/route.ts` | `app/api/evidence/route.ts` | **Replace** (same as v1, but included for completeness) |
| `app/api/evidence/[id]/related/route.ts` | `app/api/evidence/[id]/related/route.ts` | **Replace** |

## Steps

1. Stop the dev server if running.
2. Copy all files from this zip to your repo.
3. Restart: `npm run dev`
4. The import error spam should disappear immediately.
5. The heap crash should stop happening.

## Expected Results

| Metric | Before (v1) | After (v2) |
|--------|-------------|------------|
| Import error spam | Every evidence API hit | **Zero** |
| Node heap crash | After ~35 min / 3.5 GB | **Stable** |
| `/api/evidence/:id/related` | 30–60s | **<500ms** (after first compile) |
| `/api/evidence` POST | 13–18s | **<10s** (AI calls are the bottleneck, not bundling) |
