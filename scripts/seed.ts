import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { groups, userGroupPermissions, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { STANDARD_GROUPS } from "../src/lib/group-structure";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL");

  for (const group of STANDARD_GROUPS) {
    await db
      .insert(groups)
      .values({ code: group.code, name: group.name, equipmentPrefix: group.equipmentPrefix, isSystem: group.isSystem })
      .onConflictDoUpdate({
        target: groups.code,
        set: { name: group.name, equipmentPrefix: group.equipmentPrefix, isSystem: group.isSystem, isActive: true, updatedAt: new Date() },
      });
  }

  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("ADMIN_PASSWORD phải có ít nhất 8 ký tự.");
  const [workshop] = await db.select().from(groups).where(eq(groups.code, "WORKSHOP")).limit(1);
  if (!workshop) throw new Error("Không tìm thấy nhóm WORKSHOP.");

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    console.log(`Admin ${username} đã tồn tại; không ghi đè mật khẩu.`);
  } else {
    const [admin] = await db.insert(users).values({
      username,
      passwordHash: await hashPassword(password),
      employeeCode: process.env.ADMIN_EMPLOYEE_CODE || "ADMIN001",
      fullName: process.env.ADMIN_FULL_NAME || "Quản trị XSC",
      primaryGroupId: workshop.id,
      requestedGroupId: workshop.id,
      accountStatus: "active",
      isAdmin: true,
      isWsManager: false,
      mustChangePassword: true,
      reviewedAt: new Date(),
    }).returning();
    await db.insert(userGroupPermissions).values({
      userId: admin.id,
      groupId: workshop.id,
      permissionLevel: "viewer",
      isPrimary: true,
      assignedBy: admin.id,
    });
    console.log(`Đã tạo admin ${username}. Tài khoản chỉ có vai trò Quản trị hệ thống; không tự động là Quản lý Xưởng.`);
  }
}

main().finally(() => pool.end());
