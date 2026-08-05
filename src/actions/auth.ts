"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth/session";
import { getAuthContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function changeOwnPasswordAction(formData: FormData) {
  const auth = await getAuthContext();
  if (!auth || auth.accountStatus !== "active") throw new Error("Phiên đăng nhập không hợp lệ.");
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (newPassword.length < 8 || newPassword.length > 72) throw new Error("Mật khẩu mới phải dài 8–72 ký tự.");
  if (newPassword !== confirmPassword) throw new Error("Mật khẩu nhập lại không khớp.");

  const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new Error("Mật khẩu hiện tại không đúng.");

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      sessionVersion: user.sessionVersion + 1,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
    await writeAudit(tx as never, {
      actorUserId: user.id,
      action: "user.password.change",
      entityType: "user",
      entityId: user.id,
      description: `User ${user.username} đổi mật khẩu`,
      afterData: { mustChangePassword: false },
    });
  });
  await clearSessionCookie();
  revalidatePath("/");
  redirect("/login?passwordChanged=1");
}
