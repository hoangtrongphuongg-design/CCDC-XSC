import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function checkRateLimit(key: string, maxAttempts: number, windowSeconds: number) {
  const result = await db.execute<{ count: number }>(sql`
    insert into auth_rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when auth_rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1
        else auth_rate_limits.count + 1
      end,
      window_start = case
        when auth_rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now()
        else auth_rate_limits.window_start
      end
    returning count
  `);
  return Number(result.rows[0]?.count ?? maxAttempts + 1) <= maxAttempts;
}

export async function resetRateLimit(key: string) {
  await db.execute(sql`delete from auth_rate_limits where key = ${key}`);
}
