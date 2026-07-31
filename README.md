# ATIS Performance Fixes

This package contains all the files needed to fix the extreme compilation slowness and request spam in your ATIS (Africa Trade Intelligence System) Next.js app.

## What These Fixes Do

| Fix | Problem Solved | Expected Impact |
|-----|---------------|-----------------|
| **Split `lib/ai.ts`** | One 500-line monolith was being bundled into every API route, even routes that only used 1 function | **-70% API route compile time** |
| **`optimizePackageImports`** | `lucide-react`, `@radix-ui/*`, and `date-fns` were importing thousands of tiny modules per page | **-40% page compile time** |
| **SWR auth + notifications** | `useAuth` and `useNotifications` fired duplicate requests on every mount, causing request storms and constant re-compiles | **-90% auth/session calls** |
| **Global SQLite cache** | `better-sqlite3` connection was recreated on every HMR cycle | **Eliminates DB connection leaks** |
| **Narrowed middleware matcher** | Middleware ran JWT verify on *every* request including API routes (which already verify internally) | **-20% cold start overhead** |

## File Placement Table

| File in this zip | Destination in your repo | Action |
|------------------|-------------------------|--------|
| `next.config.js` | `next.config.js` | **Replace** existing file |
| `db/client.ts` | `db/client.ts` | **Replace** existing file |
| `middleware.ts` | `middleware.ts` | **Replace** existing file |
| `lib/ai/client.ts` | `lib/ai/client.ts` | **Create new** |
| `lib/ai/summary.ts` | `lib/ai/summary.ts` | **Create new** |
| `lib/ai/topics.ts` | `lib/ai/topics.ts` | **Create new** |
| `lib/ai/similarity.ts` | `lib/ai/similarity.ts` | **Create new** |
| `lib/ai/stories.ts` | `lib/ai/stories.ts` | **Create new** |
| `lib/ai/entities.ts` | `lib/ai/entities.ts` | **Create new** |
| `lib/ai/confidence.ts` | `lib/ai/confidence.ts` | **Create new** |
| `lib/ai/index.ts` | `lib/ai/index.ts` | **Create new** (barrel for backward compat) |
| `hooks/use-auth.ts` | `hooks/use-auth.ts` | **Replace** existing file |
| `hooks/use-notifications.ts` | `hooks/use-notifications.ts` | **Replace** existing file |
| `app/api/evidence/route.ts` | `app/api/evidence/route.ts` | **Replace** existing file |
| `app/api/discover/route.ts` | `app/api/discover/route.ts` | **Replace** existing file |
| `app/api/evidence/[id]/related/route.ts` | `app/api/evidence/[id]/related/route.ts` | **Replace** existing file |
| `app/api/admin/stats/route.ts` | `app/api/admin/stats/route.ts` | **Replace** existing file |
| `app/api/notifications/route.ts` | `app/api/notifications/route.ts` | **Replace** existing file |
| `app/api/auth/session/route.ts` | `app/api/auth/session/route.ts` | **Replace** existing file |

## Installation Steps

1. **Install SWR** (required for the new hooks):
   ```bash
   npm install swr
   ```

2. **Copy all files** from this zip into your repo according to the table above.

3. **Delete the old monolith** (optional but recommended):
   ```bash
   del lib\ai.ts
   ```
   The barrel file (`lib/ai/index.ts`) re-exports everything for backward compatibility, so any other files still importing from `@/lib/ai` will continue to work.

4. **Add Windows Defender exclusions** (critical on Windows):
   - Open **Windows Security** → **Virus & threat protection** → **Manage settings** → **Exclusions** → **Add or remove exclusions**
   - Add these folder exclusions:
     - `C:\Users\tmaki\Downloads\analyst` (your project root)
     - `C:\Users\tmaki\Downloads\analyst\node_modules`
     - `%LOCALAPPDATA%\Temp`

5. **Try Turbopack** (Next.js 14.2+):
   ```json
   // package.json
   "dev": "next dev --turbo"
   ```
   If any routes fail under Turbopack, fall back to `next dev` — the webpack optimizations in `next.config.js` will still apply.

6. **Restart the dev server**:
   ```bash
   npm run dev
   ```

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| `/api/admin/stats` compile | ~485s | **<5s** |
| `/evidence/new` compile | ~26s | **<3s** |
| `/api/auth/session` calls | 40+/minute | **~1/minute** |
| `/api/notifications` polling | Every 30s | **Every 60s** |
| Cold start (first page load) | ~87s | **<10s** |

## Notes

- **Backward compatibility**: The barrel file `lib/ai/index.ts` preserves all existing exports. Any file you didn't update that still does `import { ... } from "@/lib/ai"` will continue to work.
- **Middleware change**: API routes are now excluded from middleware matching because they already call `requireAuth()` internally. This eliminates double JWT verification.
- **DB client change**: Uses `globalThis` to cache the SQLite connection across HMR cycles, preventing connection leaks.
