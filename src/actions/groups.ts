"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { equipment, groups, userGroupPermissions, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { LEGACY_GROUP_CODES, normalizeEquipmentPrefix, normalizeGroupCode, STANDARD_GROUPS } from "@/lib/group-structure";

function refreshGroupConsumers() {
  revalidatePath("/groups");
  revalidatePath("/users");
  revalidatePath("/register");
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
  revalidatePath("/machine-loans");
  revalidatePath("/quick-loans");
  revalidatePath("/transfers");
  revalidatePath("/repairs");
  revalidatePath("/disposals");
  revalidatePath("/reports");
}

export async function syncStandardGroupsAction() {
  const auth = await requireAdmin();

  await db.transaction(async (tx) => {
    for (const group of STANDARD_GROUPS) {
      await tx
        .insert(groups)
        .values({ code: group.code, name: group.name, equipmentPrefix: group.equipmentPrefix, isSystem: group.isSystem })
        .onConflictDoUpdate({
          target: groups.code,
          set: {
            name: group.name,
            equipmentPrefix: group.equipmentPrefix,
            isSystem: group.isSystem,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    const deactivatedLegacyCodes: string[] = [];
    const retainedLegacyCodes: string[] = [];

    for (const legacyCode of LEGACY_GROUP_CODES) {
      const [legacy] = await tx.select().from(groups).where(eq(groups.code, legacyCode)).limit(1);
      if (!legacy || legacy.isSystem || !legacy.isActive) continue;

      const [[assignedEquipment], [activePrimaryUser], [activePermission]] = await Promise.all([
        tx.select({ id: equipment.id }).from(equipment).where(or(eq(equipment.ownerGroupId, legacy.id), eq(equipment.currentGroupId, legacy.id))).limit(1),
        tx.select({ id: users.id }).from(users).where(and(eq(users.primaryGroupId, legacy.id), eq(users.accountStatus, "active"))).limit(1),
        tx.select({ id: userGroupPermissions.id }).from(userGroupPermissions).where(and(eq(userGroupPermissions.groupId, legacy.id), eq(userGroupPermissions.isActive, true))).limit(1),
      ]);

      if (assignedEquipment || activePrimaryUser || activePermission) {
        retainedLegacyCodes.push(legacyCode);
        continue;
      }

      await tx.update(groups).set({ isActive: false, updatedAt: new Date() }).where(eq(groups.id, legacy.id));
      deactivatedLegacyCodes.push(legacyCode);
    }

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "group.structure.sync",
      entityType: "group_structure",
      description: "Đồng bộ 15 nhóm nghiệp vụ chính thức của Xưởng Sửa chữa",
      afterData: {
        groups: STANDARD_GROUPS,
        deactivatedLegacyCodes,
        retainedLegacyCodes,
      },
    });
  });

  refreshGroupConsumers();
}

export async function createGroupAction(formData: FormData) {
  const auth = await requireAdmin();
  const code = normalizeGroupCode(String(formData.get("code") || ""));
  const name = String(formData.get("name") || "").trim();
  const equipmentPrefix = normalizeEquipmentPrefix(String(formData.get("equipmentPrefix") || code));

  if (code.length < 2) throw new Error("Mã nhóm phải có ít nhất 2 ký tự.");
  if (name.length < 2 || name.length > 120) throw new Error("Tên nhóm phải dài 2–120 ký tự.");
  if (equipmentPrefix.length < 2) throw new Error("Tiền tố mã dụng cụ phải có ít nhất 2 ký tự.");

  const [existing] = await db.select().from(groups).where(eq(groups.code, code)).limit(1);
  if (existing) throw new Error(`Mã nhóm ${code} đã tồn tại.`);

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(groups)
      .values({ code, name, equipmentPrefix, isSystem: false, isActive: true })
      .returning();

    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "group.create",
      entityType: "group",
      entityId: created.id,
      description: `Tạo nhóm ${created.code} - ${created.name}`,
      afterData: created,
    });
  });

  refreshGroupConsumers();
}

export async function updateGroupNameAction(formData: FormData) {
  const auth = await requireAdmin();
  const groupId = String(formData.get("groupId") || "");
  const name = String(formData.get("name") || "").trim();
  const equipmentPrefixRaw = String(formData.get("equipmentPrefix") || "");
  const equipmentPrefix = equipmentPrefixRaw ? normalizeEquipmentPrefix(equipmentPrefixRaw) : "";

  if (!groupId) throw new Error("Thiếu nhóm cần cập nhật.");
  if (name.length < 2 || name.length > 120) throw new Error("Tên nhóm phải dài 2–120 ký tự.");

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!before) throw new Error("Không tìm thấy nhóm.");
    if (before.isSystem) throw new Error("Nhóm hệ thống không được đổi tên tại màn hình này.");

    const nextPrefix = equipmentPrefix || before.equipmentPrefix;
    if (nextPrefix.length < 2) throw new Error("Tiền tố mã dụng cụ phải có ít nhất 2 ký tự.");
    await tx.update(groups).set({ name, equipmentPrefix: nextPrefix, updatedAt: new Date() }).where(eq(groups.id, groupId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "group.rename",
      entityType: "group",
      entityId: groupId,
      description: `Đổi tên nhóm ${before.code}`,
      beforeData: { name: before.name, equipmentPrefix: before.equipmentPrefix },
      afterData: { name, equipmentPrefix: equipmentPrefix || before.equipmentPrefix },
    });
  });

  refreshGroupConsumers();
}

export async function setGroupStatusAction(formData: FormData) {
  const auth = await requireAdmin();
  const groupId = String(formData.get("groupId") || "");
  const nextActive = String(formData.get("isActive") || "") === "true";

  if (!groupId) throw new Error("Thiếu nhóm cần cập nhật.");

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!before) throw new Error("Không tìm thấy nhóm.");
    if (before.isSystem) throw new Error("Không thể vô hiệu hóa nhóm hệ thống.");

    if (!nextActive) {
      const [assignedEquipment] = await tx
        .select({ id: equipment.id })
        .from(equipment)
        .where(or(eq(equipment.ownerGroupId, groupId), eq(equipment.currentGroupId, groupId)))
        .limit(1);
      if (assignedEquipment) {
        throw new Error("Nhóm còn máy/CCDC đang gán. Hãy điều chuyển hết trước khi vô hiệu hóa.");
      }

      const [activePrimaryUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.primaryGroupId, groupId), eq(users.accountStatus, "active")))
        .limit(1);
      if (activePrimaryUser) {
        throw new Error("Nhóm còn người dùng đang hoạt động với nhóm chính này.");
      }

      const [activePermission] = await tx
        .select({ id: userGroupPermissions.id })
        .from(userGroupPermissions)
        .where(and(eq(userGroupPermissions.groupId, groupId), eq(userGroupPermissions.isActive, true)))
        .limit(1);
      if (activePermission) {
        throw new Error("Nhóm còn quyền người dùng đang hiệu lực. Hãy thu hồi quyền trước.");
      }
    }

    await tx.update(groups).set({ isActive: nextActive, updatedAt: new Date() }).where(eq(groups.id, groupId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      action: "group.status.update",
      entityType: "group",
      entityId: groupId,
      description: `${nextActive ? "Kích hoạt" : "Vô hiệu hóa"} nhóm ${before.code}`,
      beforeData: { isActive: before.isActive },
      afterData: { isActive: nextActive },
    });
  });

  refreshGroupConsumers();
}
