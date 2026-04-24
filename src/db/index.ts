import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "cabinflow.db");

// Singleton pattern — reuse connection across hot-reloads in dev
const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> };

if (!globalForDb.db) {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  globalForDb.db = drizzle(sqlite, { schema });
}

export const db = globalForDb.db;
