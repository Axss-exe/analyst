# ATIS v3 Migration Guide

## Pre-Migration Checklist

- [ ] Backup your SQLite database (`atis.db` or `DATABASE_URL`)
- [ ] Ensure Node.js 18+ is installed
- [ ] Verify `CEREBRAS_API_KEY` is set in `.env.local`

## Step 1: Apply Database Schema

```bash
npx drizzle-kit push
This creates four new tables: - facts - evidence_connections - graph_clusters - narratives
No existing data is modified or deleted.
Step 2: Replace Files
Copy all files from this patch into your repository, preserving folder structure.
Step 3: Delete Stale File
rm lib/ai.ts
This file shadowed lib/ai/index.ts and contained broken generateWithAI.
Step 4: Build and Test
npm run build
npm start
Step 5: Verify
Upload evidence with full text content
Check /api/debug — facts, evidenceConnections, graphClusters, narratives counts should increase
Visit /discover — clusters should appear after background processing completes
Visit /graph — reasoning panel should show stats, narratives, and contradictions
Rollback
If issues occur: 1. Restore lib/ai.ts from git history 2. Revert app/api/evidence/route.ts to synchronous version 3. Drop new tables: facts, evidence_connections, graph_clusters, narratives

---

### File: `DEPLOYMENT.md`

```markdown
# ATIS v3 Deployment Guide

## Environment

- Node.js 18+
- SQLite (better-sqlite3)
- Cerebras API key

## Build

```bash
npm install
npx drizzle-kit push
npm run build
Start
npm start
# or
node .next/standalone/server.js
Background Worker
The worker runs in-process. For production with high upload volume, consider: - Extracting the worker to a separate Node.js process - Using BullMQ + Redis for persistent job queues - Running the worker on a separate CPU core
Performance Tuning
Dataset Size
Recommendation
< 1,000 evidence
In-process worker is fine
1,000–10,000
Consider incremental signal updates instead of full rebuild
> 10,000
Move worker to separate process; add Redis for job persistence
Monitoring
GET /api/debug — check table counts and job status
GET /api/jobs/:jobId — track individual evidence processing progress
Server logs — worker stages are logged with [worker] prefix

---

### File: `MANIFEST.md`

```markdown
# ATIS v3 File Manifest

## New Files (14)

| # | Path | Description |
|---|------|-------------|
| 1 | `types/index.ts` | Graph-first type definitions |
| 2 | `db/schema.ts` | Added facts, evidenceConnections, graphClusters, narratives tables |
| 3 | `lib/ai/extraction.ts` | Single-pass structured fact extraction |
| 4 | `lib/graph/types.ts` | Internal graph type system |
| 5 | `lib/graph/builder.ts` | Evidence graph construction from DB |
| 6 | `lib/graph/signals.ts` | 10 explainable connection signal types |
| 7 | `lib/graph/cluster.ts` | Connected-component density clustering |
| 8 | `lib/graph/paths.ts` | Hidden path BFS + bridge nodes + contradictions |
| 9 | `lib/graph/narrative.ts` | Deterministic narrative pattern detection |
| 10 | `lib/graph/index.ts` | Public graph API barrel |
| 11 | `lib/worker.ts` | 11-stage background ingestion pipeline |
| 12 | `app/discover/page.tsx` | Graph-driven cluster display |
| 13 | `app/graph/page.tsx` | Entity graph + reasoning overlay |
| 14 | `app/stories/page.tsx` | Manual/auto story distinction |

## Modified Files (12)

| # | Path | Change |
|---|------|--------|
| 1 | `lib/ai/stories.ts` | Added `generateNarrativeFromCluster` |
| 2 | `lib/ai/entities.ts` | Removed `extractRelationshipsFromText`; added `entityNames` to timeline |
| 3 | `lib/ai/relationships.ts` | Aligned signature with unified extraction |
| 4 | `lib/ai/topics.ts` | Added `sampleLength` parameter |
| 5 | `lib/ai/confidence.ts` | Type safety cleanup |
| 6 | `lib/ai/index.ts` | Added new exports; resolved `extractRelationshipsFromText` conflict |
| 7 | `lib/jobs.ts` | Added `enqueueJob`, `processJob`, `cancelJob` |
| 8 | `app/api/evidence/route.ts` | Async background enqueue; immediate response |
| 9 | `app/api/graph/route.ts` | Enriched with clusters, paths, contradictions, narratives |
| 10 | `app/api/discover/route.ts` | Graph-driven cluster query |
| 11 | `app/api/stories/route.ts` | Auto narratives included |
| 12 | `app/api/debug/route.ts` | New table counts added |

## Deleted Files (1)

| # | Path | Reason |
|---|------|--------|
| 1 | `lib/ai.ts` | Shadowed `lib/ai/index.ts`; contained broken `generateWithAI` |