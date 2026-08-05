"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog } from "@/lib/db/schema";
import { requireGroupPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";

const equipmentSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(180),
  equipmentType: z.string().trim().min(2).max(120),
  model: z.string().trim().max(180).optional(),
  brand: z.string().trim().max(120).optional(),
  ownerGroupId: z.string().uuid(),
  currentLocation: z.string().trim().max(180).optional(),
});

export async function createEquipmentAction(formData: FormData) {
  const parsed = equipmentSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    equipmentType: formData.get("equipmentType"),
    model: formData.get("model") || undefined,
    brand: formData.get("brand") || undefined,
    ownerGroupId: formData.get("ownerGroupId"),
    currentLocation: formData.get("currentLocation") || undefined,
  });
  const auth = await requireGroupPermission(parsed.ownerGroupId, "manager");
  const [ownerGroup] = await db.select().from(groups).where(eq(groups.id, parsed.ownerGroupId)).limit(1);
  if (!ownerGroup || ownerGroup.isSystem || !ownerGroup.isActive) throw new Error("Nhóm quản lý không hợp lệ.");

  await db.transaction(async (tx) => {
    const [created] = await tx.insert(equipment).values({
      ...parsed,
      currentGroupId: parsed.ownerGroupId,
      status: "in_use_owner",
      condition: "unknown",
    }).returning();
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: parsed.ownerGroupId,
      action: "equipment.create",
      entityType: "equipment",
      entityId: created.id,
      description: `Tạo máy/CCDC ${created.code}`,
      afterData: created,
    });
  });
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
}

export async function updateEquipmentConditionAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  type EquipmentCondition = typeof equipment.$inferSelect["condition"];
  const condition = String(formData.get("condition") || "unknown") as EquipmentCondition;
  const [item] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  const auth = await requireGroupPermission(item.ownerGroupId, "operator");
  await db.transaction(async (tx) => {
    await tx.update(equipment).set({ condition, version: item.version + 1, updatedAt: new Date() }).where(eq(equipment.id, equipmentId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      action: "equipment.condition.update",
      entityType: "equipment",
      entityId: equipmentId,
      description: `Cập nhật tình trạng ${item.code}`,
      beforeData: { condition: item.condition },
      afterData: { condition },
    });
  });
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
}

export async function createGroupToolAction(formData: FormData) {
  const groupId = String(formData.get("groupId") || "");
  const name = String(formData.get("name") || "").trim();
  const specification = String(formData.get("specification") || "").trim();
  const unit = String(formData.get("unit") || "cái").trim();
  const quantityOnHand = Number(formData.get("quantityOnHand") || 0);
  if (!groupId || !name || quantityOnHand < 0) throw new Error("Thông tin dụng cụ nhóm không hợp lệ.");
  const auth = await requireGroupPermission(groupId, "operator");
  const [ownerGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!ownerGroup || ownerGroup.isSystem || !ownerGroup.isActive) throw new Error("Nhóm quản lý không hợp lệ.");
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(toolCatalog).values({
      groupId,
      name,
      specification: specification || null,
      unit: unit || "cái",
      quantityOnHand: String(quantityOnHand),
    }).returning();
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: groupId,
      action: "tool_catalog.create",
      entityType: "tool_catalog",
      entityId: created.id,
      description: `Thêm dụng cụ nhóm: ${name}`,
      afterData: created,
    });
  });
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
  revalidatePath("/quick-loans");
}
