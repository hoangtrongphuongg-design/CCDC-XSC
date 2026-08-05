"use server";

import { or, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { groups, users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/auth/rate-limit";

export type RegisterState = { error?: string; success?: string };

export async function registerAction(_: RegisterState, formData: FormData): Promise<RegisterState> {
  const headerStore = await headers();
  const ip = (headerStore.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const allowed = await checkRateLimit(`register:ip:${ip}`, 5, 3600);
  if (!allowed) return { error: "Đã có quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau." };

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    employeeCode: formData.get("employeeCode"),
    requestedGroupId: formData.get("requestedGroupId"),
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Thông tin đăng ký không hợp lệ." };

  const { confirmPassword: _ignore, ...data } = parsed.data;
  const [requestedGroup] = await db.select().from(groups).where(eq(groups.id, data.requestedGroupId)).limit(1);
  if (!requestedGroup || !requestedGroup.isActive || requestedGroup.isSystem) return { error: "Nhóm đăng ký không hợp lệ." };
  const [duplicate] = await db.select({ id: users.id }).from(users).where(or(
    eq(users.username, data.username),
    eq(users.employeeCode, data.employeeCode),
  )).limit(1);
  if (duplicate) return { error: "Tên đăng nhập hoặc mã nhân viên đã được sử dụng." };

  await db.insert(users).values({
    username: data.username,
    passwordHash: await hashPassword(data.password),
    employeeCode: data.employeeCode,
    fullName: data.fullName,
    requestedGroupId: data.requestedGroupId,
    accountStatus: "pending",
  });

  return { success: "Đăng ký thành công. Tài khoản đang chờ quản trị viên duyệt." };
}
