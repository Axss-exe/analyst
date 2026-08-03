# ATIS v3 Deployment Guide

## Environment

- Node.js 18+
- SQLite (better-sqlite3)
- Cerebras API key

## Build

bash
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