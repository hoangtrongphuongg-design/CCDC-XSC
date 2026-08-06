import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
});

try {
  const schema = await readFile(resolve("database/current_schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Cấu trúc database hiện tại đã được đồng bộ.");
} finally {
  await pool.end();
}
