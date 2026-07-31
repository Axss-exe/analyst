import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { sqlite?: Database.Database }

const sqlite = globalForDb.sqlite || new Database(process.env.DATABASE_URL || "./atis.db")
if (!globalForDb.sqlite) {
  sqlite.pragma("journal_mode = WAL")
  globalForDb.sqlite = sqlite
}

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
