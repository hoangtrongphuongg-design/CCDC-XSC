"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { groups, userGroupPermissions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { isOfficialOperationalGroupCode, STANDARD_GROUPS } from "@/lib/group-structure";

export async function approveUserAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const groupId = String(formData.get("groupId") || "");
  const permissionLevelRaw = String(formData.get("permissionLevel") || "viewer");
  if (!["viewer", "operator", "manager"].includes(permissionLevelRaw)) throw new Error("Mức quyền không hợp lệ.");
  const permissionLevel = permissionLevelRaw as "viewer" | "operator" | "manager";
  const isWsManager = formData.get("isWsManager") === "on";
  if (!userId || !groupId) throw new Error("Thiếu user hoặc nhóm.");
  const [primaryGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!primaryGroup || primaryGroup.isSystem || !primaryGroup.isActive || !isOfficialOperationalGroupCode(primaryGroup.code)) throw new Error("Nhóm chính không hợp lệ.");

  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("Không tìm thấy user.");
    await tx.update(users).set({
      accountStatus: "active",
      primaryGroupId: groupId,
      isWsManager,
      reviewedBy: auth.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    await tx.insert(userGroupPermissions).values({
      userId,
      groupId,
      permissionLevel,
      isPrimary: true,
      assignedBy: auth.userId,
    }).onConflictDoUpdate({
      target: [userGroupPermissions.userId, userGroupPermissions.groupId],
      set: { permissionLevel, isPrimary: true, isActive: true, assignedBy: auth.userId, assignedAt: new Date(), revokedAt: null, revokedBy: null },
    });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "user.approve",
      entityType: "user",
      entityId: userId,
      description: `Duyệt tài khoản ${target.username}`,
      beforeData: target,
      afterData: { accountStatus: "active", groupId, permissionLevel, isWsManager },
    });
  });
  revalidatePath("/users");
}

export async function updateUserStatusAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const status = String(formData.get("status") || "blocked") as "active" | "blocked" | "rejected";
  if (!userId) throw new Error("Thiếu user.");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!before) throw new Error("Không tìm thấy user.");
    await tx.update(users).set({ accountStatus: status, sessionVersion: before.sessionVersion + 1, updatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "user.status.update",
      entityType: "user",
      entityId: userId,
      description: `Cập nhật trạng thái tài khoản ${before.username}: ${status}`,
      beforeData: before,
      afterData: { accountStatus: status },
    });
  });
  revalidatePath("/users");
}

export async function assignGroupPermissionAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const groupId = String(formData.get("groupId") || "");
  const levelRaw = String(formData.get("permissionLevel") || "viewer");
  if (!["viewer", "operator", "manager"].includes(levelRaw)) throw new Error("Mức quyền không hợp lệ.");
  const level = levelRaw as "viewer" | "operator" | "manager";
  if (!userId || !groupId) throw new Error("Thiếu user hoặc nhóm.");
  const [assignedGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const officialCodes = new Set(STANDARD_GROUPS.map((group) => group.code));
  if (!assignedGroup || !assignedGroup.isActive || !officialCodes.has(assignedGroup.code as (typeof STANDARD_GROUPS)[number]["code"])) {
    throw new Error("Nhóm phân quyền không thuộc cơ cấu chính thức.");
  }

  await db.transaction(async (tx) => {
    await tx.insert(userGroupPermissions).values({ userId, groupId, permissionLevel: level, assignedBy: auth.userId })
      .onConflictDoUpdate({
        target: [userGroupPermissions.userId, userGroupPermissions.groupId],
        set: { permissionLevel: level, isActive: true, assignedBy: auth.userId, assignedAt: new Date(), revokedAt: null, revokedBy: null },
      });
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "user.permission.assign",
      entityType: "user",
      entityId: userId,
      description: "Gán quyền nhóm cho user",
      afterData: { groupId, level },
    });
  });
  revalidatePath("/users");
}

export async function revokeGroupPermissionAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const groupId = String(formData.get("groupId") || "");
  await db.transaction(async (tx) => {
    await tx.update(userGroupPermissions).set({ isActive: false, revokedBy: auth.userId, revokedAt: new Date() })
      .where(and(eq(userGroupPermissions.userId, userId), eq(userGroupPermissions.groupId, groupId)));
    await tx.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "user.permission.revoke",
      entityType: "user",
      entityId: userId,
      description: "Thu hồi quyền nhóm của user",
      afterData: { groupId },
    });
  });
  revalidatePath("/users");
}

export async function resetTemporaryPasswordAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const temporaryPassword = String(formData.get("temporaryPassword") || "");
  if (temporaryPassword.length < 8 || temporaryPassword.length > 72) throw new Error("Mật khẩu tạm phải dài 8–72 ký tự.");
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new Error("Không tìm thấy user.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      sessionVersion: target.sessionVersion + 1,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "user.password.reset",
      entityType: "user",
      entityId: userId,
      description: `Đặt mật khẩu tạm cho ${target.username}`,
      afterData: { mustChangePassword: true },
    });
  });
  revalidatePath("/users");
}

export async function setUserFlagsAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const isWsManager = formData.get("isWsManager") === "on";
  const isAdmin = formData.get("isAdmin") === "on";
  if (!userId) throw new Error("Thiếu user.");
  if (userId === auth.userId && !isAdmin) throw new Error("Không thể tự gỡ quyền admin của chính mình.");
  const [before] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!before) throw new Error("Không tìm thấy user.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ isWsManager, isAdmin, sessionVersion: before.sessionVersion + 1, updatedAt: new Date() }).where(eq(users.id, userId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "user.flags.update",
      entityType: "user",
      entityId: userId,
      description: `Cập nhật vai trò hệ thống cho ${before.username}`,
      beforeData: { isWsManager: before.isWsManager, isAdmin: before.isAdmin },
      afterData: { isWsManager, isAdmin },
    });
  });
  revalidatePath("/users");
}
