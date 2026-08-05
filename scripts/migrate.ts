import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL");
const sql = await readFile(resolve("drizzle/0000_initial.sql"), "utf8");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
});
try {
  await pool.query(sql);
  console.log("Migration 0000_initial.sql hoàn tất.");
} finally {
  await pool.end();
}
