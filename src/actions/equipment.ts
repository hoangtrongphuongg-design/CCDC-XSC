"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { equipment, equipmentTypeCatalog, groups } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";
import { nextAssetCode } from "@/lib/workflows";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { GROUP_PERMISSION_LABELS } from "@/lib/auth/roles";

export type EquipmentFormState = {
  status: "idle" | "success" | "error" | "confirm";
  message?: string;
  code?: string;
  afterSave?: "close" | "add_next";
};

const categoryCodes = EQUIPMENT_CATEGORIES.map((category) => category.code) as [string, ...string[]];
const conditionValues = ["good", "limited", "major_damage", "unknown"] as const;
const statusValues = [
  "in_use_owner",
  "wait_handover",
  "on_loan",
  "return_requested",
  "wait_inspection",
  "repairing",
  "wait_repair_confirm",
  "wait_disposal",
  "disposal_warehouse",
  "inactive",
] as const;
const originValues = ["existing", "new_purchase", "other"] as const;

const equipmentFormSchema = z.object({
  recordId: z.string().uuid().optional(),
  ownerGroupId: z.string().uuid(),
  originType: z.enum(originValues).default("existing"),
  recordedDate: z.string().date(),
  categoryCode: z.enum(categoryCodes),
  equipmentType: z.string().trim().min(2, "Loại dụng cụ phải có ít nhất 2 ký tự.").max(120),
  name: z.string().trim().min(2, "Tên CCDC phải có ít nhất 2 ký tự.").max(200),
  legacyCode: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(150).optional(),
  model: z.string().trim().max(180).optional(),
  serial: z.string().trim().max(150).optional(),
  manufactureYear: z.coerce.number().int().min(1900).max(2200).optional(),
  commissionYear: z.coerce.number().int().min(1900).max(2200).optional(),
  technicalSpecs: z.string().trim().max(8000).optional(),
  technicalNote: z.string().trim().max(4000).optional(),
  condition: z.enum(conditionValues).default("unknown"),
  status: z.enum(statusValues).default("in_use_owner"),
  currentLocation: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(4000).optional(),
  purchaseDate: z.string().date().optional(),
  poContractNo: z.string().trim().max(150).optional(),
  supplierName: z.string().trim().max(200).optional(),
  purchasePrice: z.coerce.number().min(0).max(9999999999999999).optional(),
  warrantyUntil: z.string().date().optional(),
  purchaseNote: z.string().trim().max(4000).optional(),
  correctionReason: z.string().trim().max(2000).optional(),
  adminSystemCode: z.string().trim().min(3).max(60).optional(),
  adminOwnerGroupId: z.string().uuid().optional(),
  adminOriginGroupId: z.string().uuid().optional(),
  adminOriginType: z.enum(originValues).optional(),
  afterSave: z.enum(["close", "add_next"]).default("close"),
  confirmDuplicates: z.boolean().default(false),
});

function textOrUndefined(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || undefined;
}

function numberTextOrUndefined(formData: FormData, name: string) {
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
  revalidatePath("/activities");
}


function getActorRoleLabel(auth: Awaited<ReturnType<typeof requireUser>>, groupId?: string) {
  if (auth.isWorkshopAdmin) return "Quản lý Xưởng / Admin";
  if (auth.isReadOnlyViewer) return "Người xem toàn xưởng";
  const permission = groupId ? auth.permissions.find((item) => item.groupId === groupId) : undefined;
  return permission ? GROUP_PERMISSION_LABELS[permission.level] : "Thành viên";
}

async function assertOperationalGroup(groupId: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group || group.isSystem || !group.isActive || !isOfficialOperationalGroupCode(group.code)) {
    throw new Error("Nhóm quản lý không hợp lệ.");
  }
  return group;
}

async function findDuplicateWarning(input: {
  recordId?: string;
  legacyCode?: string;
  serial?: string;
}) {
  const messages: string[] = [];
  if (input.legacyCode) {
    const filters = input.recordId
      ? and(eq(equipment.legacyCode, input.legacyCode), ne(equipment.id, input.recordId))
      : eq(equipment.legacyCode, input.legacyCode);
    const [duplicate] = await db.select({ code: equipment.code }).from(equipment).where(filters).limit(1);
    if (duplicate) messages.push(`Mã hiện hữu “${input.legacyCode}” đang được dùng ở ${duplicate.code}.`);
  }
  if (input.serial) {
    const filters = input.recordId
      ? and(eq(equipment.serial, input.serial), ne(equipment.id, input.recordId))
      : eq(equipment.serial, input.serial);
    const [duplicate] = await db.select({ code: equipment.code }).from(equipment).where(filters).limit(1);
    if (duplicate) messages.push(`Serial “${input.serial}” đang tồn tại ở ${duplicate.code}.`);
  }
  return messages;
}

export async function saveEquipmentRecordAction(
  _previousState: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const parsed = equipmentFormSchema.safeParse({
    recordId: textOrUndefined(formData, "recordId"),
    ownerGroupId: formData.get("ownerGroupId"),
    originType: formData.get("originType") || "existing",
    recordedDate: formData.get("recordedDate"),
    categoryCode: formData.get("categoryCode") || "KHAC",
    equipmentType: formData.get("equipmentType"),
    name: formData.get("name"),
    legacyCode: textOrUndefined(formData, "legacyCode"),
    brand: textOrUndefined(formData, "brand"),
    model: textOrUndefined(formData, "model"),
    serial: textOrUndefined(formData, "serial"),
    manufactureYear: numberTextOrUndefined(formData, "manufactureYear"),
    commissionYear: numberTextOrUndefined(formData, "commissionYear"),
    technicalSpecs: textOrUndefined(formData, "technicalSpecs"),
    technicalNote: textOrUndefined(formData, "technicalNote"),
    condition: formData.get("condition") || "unknown",
    status: formData.get("status") || "in_use_owner",
    currentLocation: textOrUndefined(formData, "currentLocation"),
    notes: textOrUndefined(formData, "notes"),
    purchaseDate: textOrUndefined(formData, "purchaseDate"),
    poContractNo: textOrUndefined(formData, "poContractNo"),
    supplierName: textOrUndefined(formData, "supplierName"),
    purchasePrice: numberTextOrUndefined(formData, "purchasePrice"),
    warrantyUntil: textOrUndefined(formData, "warrantyUntil"),
    purchaseNote: textOrUndefined(formData, "purchaseNote"),
    correctionReason: textOrUndefined(formData, "correctionReason"),
    adminSystemCode: textOrUndefined(formData, "adminSystemCode"),
    adminOwnerGroupId: textOrUndefined(formData, "adminOwnerGroupId"),
    adminOriginGroupId: textOrUndefined(formData, "adminOriginGroupId"),
    adminOriginType: textOrUndefined(formData, "adminOriginType"),
    afterSave: formData.get("afterSave") || "close",
    confirmDuplicates: String(formData.get("confirmDuplicates") || "false") === "true",
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." };
  }

  const data = parsed.data;

  try {
    const auth = await requireUser();
    if (auth.isReadOnlyViewer) return { status: "error", message: "Người xem toàn xưởng chỉ có quyền xem dữ liệu." };

    const duplicateWarnings = await findDuplicateWarning({
      recordId: data.recordId,
      legacyCode: data.legacyCode,
      serial: data.serial,
    });
    if (duplicateWarnings.length && !data.confirmDuplicates) {
      return {
        status: "confirm",
        message: `${duplicateWarnings.join(" ")} Kiểm tra lại máy thực tế; nếu đúng là trường hợp đặc biệt, bạn vẫn có thể lưu.`,
      };
    }

    if (data.recordId) {
      const [before] = await db.select().from(equipment).where(eq(equipment.id, data.recordId)).limit(1);
      if (!before) return { status: "error", message: "Không tìm thấy CCDC cần cập nhật." };

      const canManageOwnGroup = hasGroupPermission(auth, before.ownerGroupId, "operator");
      if (!auth.isWorkshopAdmin && !canManageOwnGroup) {
        return { status: "error", message: "Bạn chỉ được cập nhật CCDC thuộc nhóm mình quản lý." };
      }

      let nextOwnerGroupId = before.ownerGroupId;
      let nextOriginGroupId = before.originGroupId;
      let nextOriginType = before.originType;
      let nextCode = before.code;
      const isAdminCorrection = auth.isWorkshopAdmin && Boolean(
        data.adminSystemCode || data.adminOwnerGroupId || data.adminOriginGroupId || data.adminOriginType || data.correctionReason,
      );

      if (auth.isWorkshopAdmin) {
        if (data.adminOwnerGroupId) {
          await assertOperationalGroup(data.adminOwnerGroupId);
          nextOwnerGroupId = data.adminOwnerGroupId;
        }
        if (data.adminOriginGroupId) {
          await assertOperationalGroup(data.adminOriginGroupId);
          nextOriginGroupId = data.adminOriginGroupId;
        }
        if (data.adminOriginType) nextOriginType = data.adminOriginType;
        if (data.adminSystemCode) nextCode = data.adminSystemCode.toUpperCase();

        const changedSensitive = nextOwnerGroupId !== before.ownerGroupId
          || nextOriginGroupId !== before.originGroupId
          || nextOriginType !== before.originType
          || nextCode !== before.code;
        if ((changedSensitive || isAdminCorrection) && !data.correctionReason) {
          return { status: "error", message: "Admin phải nhập lý do khi can thiệp/hiệu chỉnh dữ liệu CCDC." };
        }
      }

      const currentGroupFollowsOwner = before.currentGroupId === before.ownerGroupId;

      await db.transaction(async (tx) => {
        await tx.insert(equipmentTypeCatalog).values({
          categoryCode: data.categoryCode,
          name: data.equipmentType,
          createdBy: auth.userId,
        }).onConflictDoNothing();

        const [updated] = await tx.update(equipment).set({
          code: nextCode,
          legacyCode: data.legacyCode || null,
          name: data.name,
          equipmentType: data.equipmentType,
          categoryCode: data.categoryCode,
          technicalSpecs: data.technicalSpecs || null,
          technicalNote: data.technicalNote || null,
          brand: data.brand || null,
          model: data.model || null,
          serial: data.serial || null,
          manufactureYear: data.manufactureYear || null,
          commissionYear: data.commissionYear || null,
          recordedDate: data.recordedDate,
          originType: nextOriginType,
          originGroupId: nextOriginGroupId,
          ownerGroupId: nextOwnerGroupId,
          currentGroupId: currentGroupFollowsOwner ? nextOwnerGroupId : before.currentGroupId,
          currentLocation: data.currentLocation || null,
          status: data.status,
          condition: data.condition,
          purchaseDate: data.purchaseDate || null,
          poContractNo: data.poContractNo || null,
          supplierName: data.supplierName || null,
          purchasePrice: data.purchasePrice === undefined ? null : String(data.purchasePrice),
          warrantyUntil: data.warrantyUntil || null,
          purchaseNote: data.purchaseNote || null,
          notes: data.notes || null,
          recordStatus: "active",
          updatedBy: auth.userId,
          updatedAt: new Date(),
          version: before.version + 1,
        }).where(eq(equipment.id, before.id)).returning();

        await writeAudit(tx as never, {
          actorUserId: auth.userId,
          actorGroupId: nextOwnerGroupId,
          actorRole: getActorRoleLabel(auth, nextOwnerGroupId),
          action: auth.isWorkshopAdmin && data.correctionReason ? "equipment.admin_correction" : "equipment.update",
          entityType: "equipment",
          entityId: before.id,
          description: auth.isWorkshopAdmin && data.correctionReason
            ? `Admin hiệu chỉnh CCDC ${before.code}`
            : `Cập nhật CCDC ${before.code}`,
          beforeData: before,
          afterData: updated,
          reason: data.correctionReason,
        });
      });

      await setFlashMessage("success", "Đã lưu thay đổi", `CCDC ${nextCode} đã được cập nhật.`);
      refreshEquipmentConsumers();
      return { status: "success", message: `Đã cập nhật ${nextCode}.`, code: nextCode, afterSave: "close" };
    }

    const ownerGroup = await assertOperationalGroup(data.ownerGroupId);
    if (!auth.isWorkshopAdmin && !hasGroupPermission(auth, data.ownerGroupId, "operator")) {
      return { status: "error", message: "Chỉ Kỹ sư giám sát hoặc Đốc công được thêm CCDC cho nhóm mình." };
    }
    if (!auth.isWorkshopAdmin && data.originType !== "existing") {
      return { status: "error", message: "Chỉ Quản lý Xưởng / Admin được tiếp nhận hoặc cấp phát CCDC mới." };
    }

    let createdCode = "";
    await db.transaction(async (tx) => {
      createdCode = await nextAssetCode(tx, {
        groupCode: ownerGroup.code,
        equipmentPrefix: ownerGroup.equipmentPrefix,
        mode: "individual",
      });

      await tx.insert(equipmentTypeCatalog).values({
        categoryCode: data.categoryCode,
        name: data.equipmentType,
        createdBy: auth.userId,
      }).onConflictDoNothing();

      const [created] = await tx.insert(equipment).values({
        code: createdCode,
        legacyCode: data.legacyCode || null,
        name: data.name,
        equipmentType: data.equipmentType,
        categoryCode: data.categoryCode,
        technicalSpecs: data.technicalSpecs || null,
        technicalNote: data.technicalNote || null,
        unit: "cái",
        recordStatus: "active",
        originType: data.originType,
        recordedDate: data.recordedDate,
        brand: data.brand || null,
        model: data.model || null,
        serial: data.serial || null,
        manufactureYear: data.manufactureYear || null,
        commissionYear: data.commissionYear || null,
        originGroupId: data.ownerGroupId,
        ownerGroupId: data.ownerGroupId,
        currentGroupId: data.ownerGroupId,
        currentLocation: data.currentLocation || null,
        status: data.status,
        condition: data.condition,
        purchaseDate: data.purchaseDate || null,
        poContractNo: data.poContractNo || null,
        supplierName: data.supplierName || null,
        purchasePrice: data.purchasePrice === undefined ? null : String(data.purchasePrice),
        warrantyUntil: data.warrantyUntil || null,
        purchaseNote: data.purchaseNote || null,
        notes: data.notes || null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      }).returning();

      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: data.ownerGroupId,
        actorRole: getActorRoleLabel(auth, data.ownerGroupId),
        action: data.originType === "new_purchase" ? "equipment.initial_allocation" : "equipment.create",
        entityType: "equipment",
        entityId: created.id,
        description: data.originType === "new_purchase"
          ? `Tiếp nhận và cấp phát ban đầu ${created.code} cho ${ownerGroup.name}`
          : `Tạo CCDC hiện hữu ${created.code}`,
        afterData: created,
      });
    });

    await setFlashMessage("success", "Đã thêm CCDC mới", `CCDC ${createdCode} đã được tạo thành công.`);
    refreshEquipmentConsumers();
    return {
      status: "success",
      message: data.originType === "new_purchase"
        ? `Đã cấp mã ${createdCode} và cấp phát ban đầu cho ${ownerGroup.name}.`
        : `Đã tạo ${createdCode}.`,
      code: createdCode,
      afterSave: data.afterSave,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu CCDC.";
    if (message.toLowerCase().includes("equipment_code_unique") || message.toLowerCase().includes("duplicate key")) {
      return { status: "error", message: "Mã hệ thống đã tồn tại. Vui lòng kiểm tra lại dữ liệu hiệu chỉnh." };
    }
    return { status: "error", message };
  }
}

export async function updateEquipmentConditionAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const conditionRaw = String(formData.get("condition") || "unknown");
  if (!conditionValues.includes(conditionRaw as (typeof conditionValues)[number])) throw new Error("Tình trạng không hợp lệ.");
  const condition = conditionRaw as (typeof conditionValues)[number];
  const [item] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  const auth = await requireUser();
  if (!hasGroupPermission(auth, item.ownerGroupId, "operator")) throw new Error("Bạn không có quyền cập nhật CCDC này.");
  await db.transaction(async (tx) => {
    await tx.update(equipment).set({ condition, updatedBy: auth.userId, version: item.version + 1, updatedAt: new Date() }).where(eq(equipment.id, equipmentId));
    await writeAudit(tx as never, {
      actorUserId: auth.userId,
      actorGroupId: item.ownerGroupId,
      actorRole: getActorRoleLabel(auth, item.ownerGroupId),
      action: "equipment.condition.update",
      entityType: "equipment",
      entityId: equipmentId,
      description: `Cập nhật tình trạng ${item.code}`,
      beforeData: { condition: item.condition },
      afterData: { condition },
    });
  });
  await setFlashMessage("success", "Đã lưu tình trạng CCDC", `Đã cập nhật ${item.code}.`);
  refreshEquipmentConsumers();
}
