import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { groups, userGroupPermissions, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth/password";

const groupSeed = [
  ["WORKSHOP", "Workshop", false],
  ["NBS", "NBS", false],
  ["CBL", "CBL", false],
  ["LO", "Lò", false],
  ["MO", "Mỏ", false],
  ["NXM", "NXM", false],
  ["CK_CA", "Cơ khí ca", false],
  ["KHO_TL", "Kho thanh lý", true],
] as const;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Thiếu DATABASE_URL");
  for (const [code, name, isSystem] of groupSeed) {
    await db.insert(groups).values({ code, name, isSystem }).onConflictDoUpdate({ target: groups.code, set: { name, isSystem, isActive: true, updatedAt: new Date() } });
  }

  const username = (process.env.ADMIN_USERNAME || "admin_xsc").trim().toLowerCase();
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
      isWsManager: true,
      mustChangePassword: true,
      reviewedAt: new Date(),
    }).returning();
    await db.insert(userGroupPermissions).values({ userId: admin.id, groupId: workshop.id, permissionLevel: "manager", isPrimary: true, assignedBy: admin.id });
    const [warehouse] = await db.select().from(groups).where(eq(groups.code, "KHO_TL")).limit(1);
    if (warehouse) await db.insert(userGroupPermissions).values({ userId: admin.id, groupId: warehouse.id, permissionLevel: "manager", assignedBy: admin.id });
    console.log(`Đã tạo admin ${username}. Bắt buộc đổi mật khẩu ở lần đầu.`);
  }
}

main().finally(() => pool.end());
