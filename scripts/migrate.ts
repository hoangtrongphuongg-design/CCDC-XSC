import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL");

const migrationDir = resolve("drizzle");
const files = (await readdir(migrationDir))
  .filter((file) => /^\d+_.*\.sql$/.test(file))
  .sort((a, b) => a.localeCompare(b));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
});

try {
  for (const file of files) {
    const sql = await readFile(resolve(migrationDir, file), "utf8");
    await pool.query(sql);
    console.log(`Migration ${file} hoàn tất.`);
  }
} finally {
  await pool.end();
}
