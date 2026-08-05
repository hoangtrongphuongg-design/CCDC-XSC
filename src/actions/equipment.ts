"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog } from "@/lib/db/schema";
import { requireGroupPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";
import { nextAssetCode } from "@/lib/workflows";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";

export type EquipmentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
};

const categoryCodes = EQUIPMENT_CATEGORIES.map((category) => category.code) as [string, ...string[]];
const conditionValues = ["good", "limited", "minor_damage", "major_damage", "awaiting_assessment", "irreparable", "unknown"] as const;

const assetFormSchema = z.object({
  managementMode: z.enum(["individual", "quantity"]),
  recordId: z.string().uuid().optional(),
  ownerGroupId: z.string().uuid(),
  intent: z.enum(["draft", "complete"]),
  categoryCode: z.enum(categoryCodes),
  equipmentType: z.string().trim().min(2, "Loại dụng cụ phải có ít nhất 2 ký tự.").max(120),
  name: z.string().trim().min(2, "Tên dụng cụ phải có ít nhất 2 ký tự.").max(180),
  specification: z.string().trim().max(240).optional(),
  brand: z.string().trim().max(120).optional(),
  model: z.string().trim().max(180).optional(),
  serial: z.string().trim().max(120).optional(),
  currentLocation: z.string().trim().max(180).optional(),
  unit: z.string().trim().min(1).max(30).default("cái"),
  quantityOnHand: z.coerce.number().min(0).max(999999999).default(1),
  condition: z.enum(conditionValues).default("unknown"),
  notes: z.string().trim().max(2000).optional(),
});

function textOrUndefined(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || undefined;
}

function refreshEquipmentConsumers() {
  revalidatePath("/equipment");
  revalidatePath("/my-equipment");
  revalidatePath("/machine-loans");
  revalidatePath("/quick-loans");
  revalidatePath("/transfers");
  revalidatePath("/repairs");
  revalidatePath("/disposals");
  revalidatePath("/reports");
}

export async function saveEquipmentRecordAction(
  _previousState: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const parsed = assetFormSchema.safeParse({
    managementMode: formData.get("managementMode"),
    recordId: textOrUndefined(formData, "recordId"),
    ownerGroupId: formData.get("ownerGroupId"),
    intent: formData.get("intent") || "draft",
    categoryCode: formData.get("categoryCode") || "KHAC",
    equipmentType: formData.get("equipmentType"),
    name: formData.get("name"),
    specification: textOrUndefined(formData, "specification"),
    brand: textOrUndefined(formData, "brand"),
    model: textOrUndefined(formData, "model"),
    serial: textOrUndefined(formData, "serial"),
    currentLocation: textOrUndefined(formData, "currentLocation"),
    unit: formData.get("unit") || "cái",
    quantityOnHand: formData.get("quantityOnHand") || 0,
    condition: formData.get("condition") || "unknown",
    notes: textOrUndefined(formData, "notes"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." };
  }

  const data = parsed.data;
  const requestedRecordStatus = data.intent === "complete" ? "active" : "draft";

  try {
    if (data.managementMode === "individual") {
      if (data.recordId) {
        const [before] = await db.select().from(equipment).where(eq(equipment.id, data.recordId)).limit(1);
        if (!before) return { status: "error", message: "Không tìm thấy máy/CCDC cần cập nhật." };

        const auth = await requireGroupPermission(before.ownerGroupId, requestedRecordStatus === "active" && before.recordStatus === "draft" ? "manager" : "operator");
        const nextRecordStatus = before.recordStatus === "active" ? "active" : requestedRecordStatus;

        await db.transaction(async (tx) => {
          const [updated] = await tx.update(equipment).set({
            name: data.name,
            equipmentType: data.equipmentType,
            categoryCode: data.categoryCode,
            specification: data.specification || null,
            unit: data.unit,
            brand: data.brand || null,
            model: data.model || null,
            serial: data.serial || null,
            currentLocation: data.currentLocation || null,
            condition: data.condition,
            notes: data.notes || null,
            recordStatus: nextRecordStatus,
            updatedBy: auth.userId,
            updatedAt: new Date(),
            version: before.version + 1,
          }).where(eq(equipment.id, before.id)).returning();

          await writeAudit(tx as never, {
            actorUserId: auth.userId,
            actorGroupId: before.ownerGroupId,
            action: "equipment.update",
            entityType: "equipment",
            entityId: before.id,
            description: `Cập nhật máy/CCDC ${before.code}`,
            beforeData: before,
            afterData: updated,
          });
        });

        refreshEquipmentConsumers();
        return { status: "success", message: `Đã cập nhật ${before.code}.`, code: before.code };
      }

      const [ownerGroup] = await db.select().from(groups).where(eq(groups.id, data.ownerGroupId)).limit(1);
      if (!ownerGroup || ownerGroup.isSystem || !ownerGroup.isActive || !isOfficialOperationalGroupCode(ownerGroup.code)) return { status: "error", message: "Nhóm quản lý không hợp lệ." };
      const auth = await requireGroupPermission(data.ownerGroupId, requestedRecordStatus === "active" ? "manager" : "operator");
      let createdCode = "";

      await db.transaction(async (tx) => {
        createdCode = await nextAssetCode(tx, {
          groupCode: ownerGroup.code,
          equipmentPrefix: ownerGroup.equipmentPrefix,
          mode: "individual",
        });
        const [created] = await tx.insert(equipment).values({
          code: createdCode,
          name: data.name,
          equipmentType: data.equipmentType,
          categoryCode: data.categoryCode,
          specification: data.specification || null,
          unit: data.unit,
          brand: data.brand || null,
          model: data.model || null,
          serial: data.serial || null,
          ownerGroupId: data.ownerGroupId,
          currentGroupId: data.ownerGroupId,
          currentLocation: data.currentLocation || null,
          status: "in_use_owner",
          condition: data.condition,
          recordStatus: requestedRecordStatus,
          notes: data.notes || null,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        }).returning();

        await writeAudit(tx as never, {
          actorUserId: auth.userId,
          actorGroupId: data.ownerGroupId,
          action: "equipment.create",
          entityType: "equipment",
          entityId: created.id,
          description: `Tạo máy/CCDC ${created.code}`,
          afterData: created,
        });
      });

      refreshEquipmentConsumers();
      return { status: "success", message: `Đã tạo ${createdCode}.`, code: createdCode };
    }

    if (data.recordId) {
      const [before] = await db.select().from(toolCatalog).where(eq(toolCatalog.id, data.recordId)).limit(1);
      if (!before) return { status: "error", message: "Không tìm thấy dụng cụ số lượng cần cập nhật." };

      const auth = await requireGroupPermission(before.groupId, requestedRecordStatus === "active" && before.recordStatus === "draft" ? "manager" : "operator");
      const nextRecordStatus = before.recordStatus === "active" ? "active" : requestedRecordStatus;

      await db.transaction(async (tx) => {
        const [updated] = await tx.update(toolCatalog).set({
          name: data.name,
          equipmentType: data.equipmentType,
          categoryCode: data.categoryCode,
          specification: data.specification || null,
          unit: data.unit,
          quantityOnHand: String(data.quantityOnHand),
          notes: data.notes || null,
          recordStatus: nextRecordStatus,
          updatedBy: auth.userId,
          updatedAt: new Date(),
        }).where(eq(toolCatalog.id, before.id)).returning();

        await writeAudit(tx as never, {
          actorUserId: auth.userId,
          actorGroupId: before.groupId,
          action: "tool_catalog.update",
          entityType: "tool_catalog",
          entityId: before.id,
          description: `Cập nhật dụng cụ ${before.code || before.name}`,
          beforeData: before,
          afterData: updated,
        });
      });

      refreshEquipmentConsumers();
      return { status: "success", message: `Đã cập nhật ${before.code || before.name}.`, code: before.code || undefined };
    }

    const [ownerGroup] = await db.select().from(groups).where(eq(groups.id, data.ownerGroupId)).limit(1);
    if (!ownerGroup || ownerGroup.isSystem || !ownerGroup.isActive || !isOfficialOperationalGroupCode(ownerGroup.code)) return { status: "error", message: "Nhóm quản lý không hợp lệ." };
    const auth = await requireGroupPermission(data.ownerGroupId, requestedRecordStatus === "active" ? "manager" : "operator");
    let createdCode = "";

    await db.transaction(async (tx) => {
      createdCode = await nextAssetCode(tx, {
        groupCode: ownerGroup.code,
        equipmentPrefix: ownerGroup.equipmentPrefix,
        mode: "quantity",
      });
      const [created] = await tx.insert(toolCatalog).values({
        groupId: data.ownerGroupId,
        code: createdCode,
        categoryCode: data.categoryCode,
        equipmentType: data.equipmentType,
        recordStatus: requestedRecordStatus,
        name: data.name,
        specification: data.specification || null,
        unit: data.unit,
        quantityOnHand: String(data.quantityOnHand),
        notes: data.notes || null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      }).returning();

      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: data.ownerGroupId,
        action: "tool_catalog.create",
        entityType: "tool_catalog",
        entityId: created.id,
        description: `Tạo dụng cụ số lượng ${created.code}`,
        afterData: created,
      });
    });

    refreshEquipmentConsumers();
    return { status: "success", message: `Đã tạo ${createdCode}.`, code: createdCode };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Không thể lưu dụng cụ." };
  }
}

export async function updateEquipmentConditionAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const conditionRaw = String(formData.get("condition") || "unknown");
  if (!conditionValues.includes(conditionRaw as (typeof conditionValues)[number])) throw new Error("Tình trạng không hợp lệ.");
  const condition = conditionRaw as (typeof conditionValues)[number];
  const [item] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  const auth = await requireGroupPermission(item.ownerGroupId, "operator");
  await db.transaction(async (tx) => {
    await tx.update(equipment).set({ condition, updatedBy: auth.userId, version: item.version + 1, updatedAt: new Date() }).where(eq(equipment.id, equipmentId));
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
  refreshEquipmentConsumers();
}
