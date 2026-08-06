import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL");

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./database/generated",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
