import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

const DB_SYMBOL = Symbol.for("atis.sqlite.connection")

interface GlobalWithDb {
  [DB_SYMBOL]?: { db: any; sqlite: Database.Database; createdAt: number }
}

const g = globalThis as unknown as GlobalWithDb

let sqlite: Database.Database

if (g[DB_SYMBOL]) {
  sqlite = g[DB_SYMBOL].sqlite
  console.log("[db/client] Reusing existing SQLite connection (created", Date.now() - g[DB_SYMBOL].createdAt, "ms ago)")
} else {
  const dbPath = process.env.DATABASE_URL || "./atis.db"
  console.log("[db/client] Creating new SQLite connection to", dbPath)
  sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")
  g[DB_SYMBOL] = { db: null, sqlite, createdAt: Date.now() }
}

export const db = drizzle(sqlite, { schema })
export type DB = typeof db

;(g[DB_SYMBOL] as any).db = db
