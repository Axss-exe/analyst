# ATIS — Africa Trade Intelligence System

## Requirements

- **Node.js 20+ or 22+**
- **npm 10+**

## Quick Start

```bash
cd atis

# 1. Clean install (do this if you had errors before)
rm -rf node_modules package-lock.json   # Mac/Linux
rmdir /s /q node_modules && del package-lock.json   # Windows

# 2. Install
npm install

# 3. Copy and edit environment file
cp .env.local.example .env.local        # Mac/Linux
copy .env.local.example .env.local      # Windows
# Edit .env.local — add your Cerebras API key and invite code

# 4. Create database tables and seed data
npm run db:setup
# If it asks "Are you sure?" just type y and press Enter

# 5. Start the app
npm run dev
```

Open http://localhost:3000 and log in with:
- **Email:** `admin@atis.local`
- **Password:** `admin123`

## What "npm run db:setup" Does

1. `drizzle-kit push` — reads `db/schema.ts` and creates all SQLite tables automatically
2. `tsx db/seed.ts` — creates the admin user + 7 report templates + invite code

No migration files needed. `push` creates tables directly from your schema.

## If drizzle-kit push asks for confirmation

Just type `y` and press Enter. It only asks once.

## Available Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run db:push` | Create/update database tables from schema |
| `npm run db:seed` | Seed admin user and templates |
| `npm run db:setup` | Push tables + seed (run this first) |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |

## About npm warnings

You may see harmless deprecation warnings from build tools. These do not affect the running app.

## Troubleshooting

**"Can't find meta/_journal.json file"**
You ran the old `db:migrate.ts`. Use `npm run db:setup` instead.

**"better-sqlite3 build errors"**
```bash
npm install -g node-gyp
# Then reinstall:
npm install
```

**"No matching version found for next@14.2.28"**
```bash
# Find latest Next.js 14 patch:
npm view next versions --json | grep '"14.2.' | tail -5
# Edit package.json with the latest version number
```
