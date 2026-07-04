/**
 * The single database client. Only code under src/server/ may import this —
 * enforced by the boundary check in ./init.sh (harness/docs/ARCHITECTURE.md).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Next.js dev re-evaluates modules on hot reload; keep one pool on globalThis
// so reloads do not leak connections.
const globalForDb = globalThis as unknown as { dbPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (see .env.example)");
  }
  return new Pool({ connectionString: url });
}

const pool = globalForDb.dbPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.dbPool = pool;

export const db = drizzle(pool, { schema });
