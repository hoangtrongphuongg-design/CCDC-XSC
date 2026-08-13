"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { groups, userGroupPermissions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { isOfficialOperationalGroupCode, STANDARD_GROUPS } from "@/lib/group-structure";

type PermissionLevel = "viewer" | "operator" | "manager";
type PrimarySystemRole = "group_user" | "readonly_viewer" | "ws_manager" | "admin";

function parsePermissionLevel(value: FormDataEntryValue | null): PermissionLevel {
  const raw = String(value || "viewer");
  if (!(["viewer", "operator", "manager"] as const).includes(raw as PermissionLevel)) {
    throw new Error("Mức quyền không hợp lệ.");
  }
  return raw as PermissionLevel;
}

export async function approveUserAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const accountMode = String(formData.get("accountMode") || "group_user") as "group_user" | "readonly_viewer";
  const groupId = String(formData.get("groupId") || "");
  const permissionLevel = parsePermissionLevel(formData.get("permissionLevel"));

  if (!userId) throw new Error("Thiếu user.");

  let primaryGroup: typeof groups.$inferSelect | null = null;
  if (accountMode === "group_user") {
    if (!groupId) throw new Error("Thiếu nhóm chính.");
    const [foundGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!foundGroup || foundGroup.isSystem || !foundGroup.isActive || !isOfficialOperationalGroupCode(foundGroup.code)) {
      throw new Error("Nhóm chính không hợp lệ.");
    }
    primaryGroup = foundGroup;
  }

  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("Không tìm thấy user.");

    await tx.update(users).set({
      accountStatus: "active",
      primaryGroupId: accountMode === "readonly_viewer" ? null : primaryGroup!.id,
      isReadOnlyViewer: accountMode === "readonly_viewer",
      reviewedBy: auth.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    if (accountMode === "group_user") {
      await tx.insert(userGroupPermissions).values({
        userId,
        groupId: primaryGroup!.id,
        permissionLevel,
        isPrimary: true,
        assignedBy: auth.userId,
      }).onConflictDoUpdate({
        target: [userGroupPermissions.userId, userGroupPermissions.groupId],
        set: {
          permissionLevel,
          isPrimary: true,
          isActive: true,
          assignedBy: auth.userId,
          assignedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
        },
      });
    }

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorRole: "Quản lý Xưởng / Admin",
      action: "user.approve",
      entityType: "user",
      entityId: userId,
      description: accountMode === "readonly_viewer"
        ? `Duyệt ${target.username} với vai trò Người xem toàn xưởng`
        : `Duyệt tài khoản ${target.username}`,
      beforeData: target,
      afterData: accountMode === "readonly_viewer"
        ? { accountStatus: "active", isReadOnlyViewer: true }
        : { accountStatus: "active", groupId: primaryGroup!.id, permissionLevel },
    });
  });

  revalidatePath("/users");

  await setFlashMessage("success", 'Đã duyệt tài khoản');
}

export async function updateUserStatusAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const status = String(formData.get("status") || "blocked") as "active" | "blocked" | "rejected";
  if (!userId) throw new Error("Thiếu user.");
  if (userId === auth.userId && status !== "active") {
    throw new Error("Admin đang đăng nhập không thể tự khóa hoặc vô hiệu hóa chính mình.");
  }

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!before) throw new Error("Không tìm thấy user.");

    if (before.isAdmin && before.accountStatus === "active" && status !== "active") {
      const [adminCount] = await tx.select({ value: sql<number>`count(*)::int` }).from(users)
        .where(and(eq(users.isAdmin, true), eq(users.accountStatus, "active")));
      if ((adminCount?.value || 0) <= 1) {
        throw new Error("Hệ thống phải luôn còn ít nhất một Admin hoạt động.");
      }
    }

    await tx.update(users).set({
      accountStatus: status,
      sessionVersion: before.sessionVersion + 1,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
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

  await setFlashMessage("success", 'Đã cập nhật trạng thái tài khoản');
}

export async function assignGroupPermissionAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const groupId = String(formData.get("groupId") || "");
  const level = parsePermissionLevel(formData.get("permissionLevel"));
  if (!userId || !groupId) throw new Error("Thiếu user hoặc nhóm.");

  const [assignedGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const officialCodes = new Set(STANDARD_GROUPS.map((group) => group.code));
  if (!assignedGroup || !assignedGroup.isActive || !officialCodes.has(assignedGroup.code as (typeof STANDARD_GROUPS)[number]["code"])) {
    throw new Error("Nhóm phân quyền không thuộc cơ cấu chính thức.");
  }

  await db.transaction(async (tx) => {
    await tx.insert(userGroupPermissions).values({
      userId,
      groupId,
      permissionLevel: level,
      assignedBy: auth.userId,
    }).onConflictDoUpdate({
      target: [userGroupPermissions.userId, userGroupPermissions.groupId],
      set: {
        permissionLevel: level,
        isActive: true,
        assignedBy: auth.userId,
        assignedAt: new Date(),
        revokedAt: null,
        revokedBy: null,
      },
    });

    await tx.update(users).set({
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

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

  await setFlashMessage("success", 'Đã cấp quyền nhóm');
}

export async function revokeGroupPermissionAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const groupId = String(formData.get("groupId") || "");

  await db.transaction(async (tx) => {
    await tx.update(userGroupPermissions).set({
      isActive: false,
      revokedBy: auth.userId,
      revokedAt: new Date(),
    }).where(and(eq(userGroupPermissions.userId, userId), eq(userGroupPermissions.groupId, groupId)));

    await tx.update(users).set({
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

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

  await setFlashMessage("success", 'Đã thu hồi quyền nhóm');
}

export async function resetTemporaryPasswordAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const temporaryPassword = String(formData.get("temporaryPassword") || "");
  if (temporaryPassword.length < 8 || temporaryPassword.length > 72) {
    throw new Error("Mật khẩu tạm phải dài 8–72 ký tự.");
  }

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

  await setFlashMessage("success", 'Đã đặt lại mật khẩu tạm');
}

/**
 * Mỗi tài khoản chỉ có một vai trò hệ thống chính.
 * Quyền nhóm được giữ lại khi đổi vai trò để có thể phục hồi mà không mất cấu hình cũ,
 * nhưng chỉ có hiệu lực khi vai trò chính là Người dùng theo nhóm.
 */
export async function setPrimarySystemRoleAction(formData: FormData) {
  const auth = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("systemRole") || "group_user") as PrimarySystemRole;

  if (!userId) throw new Error("Thiếu user.");
  if (!( ["group_user", "readonly_viewer", "ws_manager", "admin"] as const).includes(role)) {
    throw new Error("Vai trò hệ thống không hợp lệ.");
  }

  const [before] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!before) throw new Error("Không tìm thấy user.");

  if (userId === auth.userId && role !== "admin") {
    throw new Error("Admin đang đăng nhập không thể tự hạ quyền của chính mình.");
  }

  if (before.isAdmin && role !== "admin" && before.accountStatus === "active") {
    const [adminCount] = await db.select({ value: sql<number>`count(*)::int` }).from(users)
      .where(and(eq(users.isAdmin, true), eq(users.accountStatus, "active")));
    if ((adminCount?.value || 0) <= 1) {
      throw new Error("Không thể hạ quyền Admin cuối cùng. Hệ thống phải luôn còn ít nhất một Admin hoạt động.");
    }
  }

  const changes = {
    isAdmin: role === "admin",
    isWsManager: role === "ws_manager",
    isReadOnlyViewer: role === "readonly_viewer",
  };

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      ...changes,
      sessionVersion: before.sessionVersion + 1,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorRole: "Admin hệ thống",
      action: "user.system_role.update",
      entityType: "user",
      entityId: userId,
      description: `Cập nhật vai trò hệ thống của ${before.username}: ${role}`,
      beforeData: { isAdmin: before.isAdmin, isWsManager: before.isWsManager, isReadOnlyViewer: before.isReadOnlyViewer },
      afterData: changes,
    });
  });

  revalidatePath("/users");
  revalidatePath("/dashboard");

  await setFlashMessage("success", 'Đã cập nhật vai trò hệ thống');
}

/** Tương thích với form cũ nếu còn request từ tab chưa tải lại. */
export async function setSystemRoleAction(formData: FormData) {
  const legacyRole = String(formData.get("role") || "");
  const enabled = String(formData.get("enabled") || "false") === "true";
  const translated = new FormData();
  translated.set("userId", String(formData.get("userId") || ""));
  if (!enabled) translated.set("systemRole", "group_user");
  else if (legacyRole === "workshop_admin") translated.set("systemRole", "admin");
  else if (legacyRole === "readonly_viewer") translated.set("systemRole", "readonly_viewer");
  else translated.set("systemRole", "group_user");
  return setPrimarySystemRoleAction(translated);
}
