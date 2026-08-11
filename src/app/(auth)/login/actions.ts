"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Thông tin đăng nhập không hợp lệ." };

  const { username, password } = parsed.data;
  const headerStore = await headers();
  const ip = (headerStore.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const [ipOk, userOk] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, 20, 300),
    checkRateLimit(`login:user:${username}`, 5, 300),
  ]);
  if (!ipOk || !userOk) return { error: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau vài phút." };

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid) return { error: "Tên đăng nhập hoặc mật khẩu không đúng." };
  if (user.accountStatus === "pending") return { error: "Tài khoản đang chờ quản trị viên duyệt." };
  if (user.accountStatus === "blocked" || user.accountStatus === "rejected") return { error: "Tài khoản đã bị khóa hoặc từ chối." };

  await resetRateLimit(`login:user:${username}`);
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await setSessionCookie(user.id, user.sessionVersion);
  redirect("/dashboard");
}
