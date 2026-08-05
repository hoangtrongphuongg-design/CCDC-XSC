import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { ccdcPool?: Pool };

export const pool =
  globalForDb.ccdcPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.ccdcPool = pool;

export const db = drizzle(pool, { schema });
