import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * IP client dùng làm khóa rate-limit. `x-forwarded-for` có thể bị client chèn
 * giá trị giả ở đầu chuỗi, nên KHÔNG lấy phần tử đầu. `x-real-ip` /
 * `x-vercel-forwarded-for` do hạ tầng (Vercel) tự đặt và ghi đè giá trị client
 * gửi lên nên không giả mạo được; với `x-forwarded-for` chỉ tin hop cuối cùng
 * (do proxy tin cậy thêm vào). Local dev không có header này -> "local".
 */
export async function getClientIp(): Promise<string> {
  const store = await headers();
  const realIp = store.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const lastHop = (value: string | null) => value?.split(",").pop()?.trim() || "";
  return (
    lastHop(store.get("x-vercel-forwarded-for")) ||
    lastHop(store.get("x-forwarded-for")) ||
    "local"
  );
}

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
