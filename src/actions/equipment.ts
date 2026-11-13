"use server";

import { setFlashMessage } from "@/lib/auth/session";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { equipment, equipmentTypeCatalog, groups, toolCatalog } from "@/lib/db/schema";
import { hasGroupPermission, requireGroupPermission, requireUser } from "@/lib/auth/guards";
import { isUniqueViolation } from "@/lib/db/errors";
import { writeAudit } from "@/lib/audit";
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";
import { assertEquipmentHasNoOtherOpenWorkflow, lockEquipment, nextAssetCode } from "@/lib/workflows";
import { insertEquipmentRecord } from "@/lib/equipment-create";
import { loadCanonicalizers } from "@/lib/canonical-data";
import { cleanLabel } from "@/lib/canonical-text";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { GROUP_PERMISSION_LABELS } from "@/lib/auth/roles";
import { validateQuantityAdjustment } from "@/lib/tool-permissions";
import { statusForCondition } from "@/lib/equipment-status-rule";
import { canChangeIdentity, changedIdentityFields, legacyConflictMessage, normalizeLegacyCode } from "@/lib/equipment-identity";

export type EquipmentFormState = {
  status: "idle" | "success" | "error" | "confirm";
  message?: string;
  code?: string;
  afterSave?: "close" | "add_next";
};

const categoryCodes = EQUIPMENT_CATEGORIES.map((category) => category.code) as [string, ...string[]];
const conditionValues = ["good", "major_damage", "awaiting_assessment", "irreparable"] as const;
/**
 * Trạng thái nhập tay được phép đổi trong form sửa. Các trạng thái còn lại (đang mượn,
 * chờ nhận lại, đang sửa, chờ/ở kho thanh lý, chờ bàn giao...) do quy trình nghiệp vụ
 * điều khiển và không được ghi đè từ form.
 */
const MANUAL_EQUIPMENT_STATUSES = ["in_use_owner", "wait_inspection", "inactive"] as const;
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
  condition: z.enum(conditionValues).default("good"),
  status: z.string().trim().max(40).optional(),
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

/**
 * Tem nhôm là nhãn vật lý của đúng một máy: trùng với MÁY KHÁC (kể cả máy đã thanh lý) là LỖI chặn cứng, không còn
 * "vẫn lưu". So khớp không phân biệt hoa/thường và khoảng trắng. Nơi gọi chỉ gọi khi tem mới hoặc vừa đổi.
 */
async function assertLegacyCodeFree(legacyCode: string, recordId?: string) {
  const key = normalizeLegacyCode(legacyCode);
  if (!key) return;
  const sameLegacy = sql`lower(regexp_replace(btrim(${equipment.legacyCode}), '\\s+', ' ', 'g')) = ${key}`;
  const [other] = await db.select({ code: equipment.code, status: equipment.status }).from(equipment)
    .where(recordId ? and(sameLegacy, ne(equipment.id, recordId)) : sameLegacy).limit(1);
  if (other) throw new Error(legacyConflictMessage(legacyCode.trim(), other));
}

async function findDuplicateWarning(input: {
  recordId?: string;
  serial?: string;
}) {
  const messages: string[] = [];
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
    recordedDate: formData.get("recordedDate") || new Date().toISOString().slice(0, 10),
    categoryCode: formData.get("categoryCode") || "KHAC",
    equipmentType: formData.get("equipmentType") || formData.get("name"),
    name: formData.get("name"),
    legacyCode: textOrUndefined(formData, "legacyCode"),
    brand: textOrUndefined(formData, "brand"),
    model: textOrUndefined(formData, "model"),
    serial: textOrUndefined(formData, "serial"),
    manufactureYear: numberTextOrUndefined(formData, "manufactureYear"),
    commissionYear: numberTextOrUndefined(formData, "commissionYear"),
    technicalSpecs: textOrUndefined(formData, "technicalSpecs"),
    technicalNote: textOrUndefined(formData, "technicalNote"),
    condition: formData.get("condition") || "good",
    status: textOrUndefined(formData, "status"),
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

  let data = parsed.data;

  try {
    const auth = await requireUser();
    if (auth.isReadOnlyViewer) return { status: "error", message: "Người xem toàn xưởng chỉ có quyền xem dữ liệu." };

    // Đưa Loại máy / Vị trí về đúng cách viết đã có (không phân biệt hoa thường, gộp khoảng trắng);
    // loại/vị trí chưa có vẫn được thêm như cũ.
    const { canonicalType, canonicalLocation } = await loadCanonicalizers();
    data = {
      ...data,
      equipmentType: canonicalType(data.categoryCode, data.equipmentType) || cleanLabel(data.name),
      currentLocation: data.currentLocation ? canonicalLocation(data.currentLocation) || undefined : undefined,
    };

    const duplicateWarnings = await findDuplicateWarning({
      recordId: data.recordId,
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

      // Danh tính (Tên / Nhóm thiết bị / Loại) cố định theo mã hệ thống: lịch sử gắn theo mã nên không cho đổi sang
      // chủng loại khác. Chỉ Quản lý Xưởng / Admin hiệu chỉnh, bắt buộc lý do (xử lý ở khối quyền Admin bên dưới).
      const changedIdentity = changedIdentityFields(before, data);
      if (changedIdentity.length && !canChangeIdentity(auth)) {
        return {
          status: "error",
          message: `${changedIdentity.join(", ")} đã cố định theo mã ${before.code}, không sửa được. Muốn đổi chủng loại hãy tạo mã mới; nhập sai thì nhờ Quản lý Xưởng hiệu chỉnh.`,
        };
      }
      if (!changedIdentity.length) {
        // Chỉ khác hoa/thường hay khoảng trắng: giữ nguyên chữ đã lưu.
        data = { ...data, name: before.name, equipmentType: before.equipmentType, categoryCode: before.categoryCode as typeof data.categoryCode };
      }
      if (normalizeLegacyCode(data.legacyCode) !== normalizeLegacyCode(before.legacyCode)) {
        await assertLegacyCodeFree(data.legacyCode ?? "", before.id);
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

        const changedSensitive = changedIdentity.length > 0
          || nextOwnerGroupId !== before.ownerGroupId
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

        // Chỉ đổi trạng thái khi cả trạng thái HIỆN TẠI (đọc lại sau khi khóa dòng, không tin ảnh
        // chụp lúc mở form) và trạng thái được chọn đều là loại nhập tay, và máy không có quy
        // trình nào đang mở. Nhờ vậy lưu form không ghi đè máy vừa được mượn/trả/sửa.
        const locked = await lockEquipment(tx, before.id);
        const manual = MANUAL_EQUIPMENT_STATUSES as readonly string[];
        let nextManualStatus: (typeof MANUAL_EQUIPMENT_STATUSES)[number] | null = null;
        if (data.status && data.status !== locked.status && manual.includes(locked.status) && manual.includes(data.status)) {
          await assertEquipmentHasNoOtherOpenWorkflow(tx, before.id);
          nextManualStatus = data.status as (typeof MANUAL_EQUIPMENT_STATUSES)[number];
        }
        // Sẵn sàng chỉ khi tình trạng Tốt: máy đang/sắp Sẵn sàng mà tình trạng không Tốt → Chờ kiểm tra (kể cả khi
        // người dùng không đụng ô trạng thái). Trạng thái do quy trình điều khiển giữ nguyên.
        if (manual.includes(locked.status)) {
          const enforced = statusForCondition(nextManualStatus ?? locked.status, data.condition);
          if (enforced !== locked.status && enforced !== nextManualStatus) {
            await assertEquipmentHasNoOtherOpenWorkflow(tx, before.id);
            nextManualStatus = enforced as (typeof MANUAL_EQUIPMENT_STATUSES)[number];
          }
        }

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
          ...(nextOwnerGroupId !== before.ownerGroupId && currentGroupFollowsOwner ? { currentGroupId: nextOwnerGroupId } : {}),
          currentLocation: data.currentLocation || null,
          ...(nextManualStatus ? { status: nextManualStatus } : {}),
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
    if (data.legacyCode) await assertLegacyCodeFree(data.legacyCode);
    if (!auth.isWorkshopAdmin && data.originType !== "existing") {
      return { status: "error", message: "Chỉ Quản lý Xưởng / Admin được tiếp nhận hoặc cấp phát CCDC mới." };
    }

    let createdCode = "";
    await db.transaction(async (tx) => {
      const created = await insertEquipmentRecord(tx, {
        actorUserId: auth.userId,
        actorRole: getActorRoleLabel(auth, data.ownerGroupId),
        ownerGroup: { id: ownerGroup.id, code: ownerGroup.code, name: ownerGroup.name, equipmentPrefix: ownerGroup.equipmentPrefix },
        originType: data.originType,
        recordedDate: data.recordedDate,
        fields: data,
      });
      createdCode = created.code;
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
    if (isUniqueViolation(error)) {
      return { status: "error", message: "Mã hệ thống đã tồn tại. Vui lòng kiểm tra lại dữ liệu hiệu chỉnh." };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Không thể lưu CCDC." };
  }
}

export async function updateEquipmentConditionAction(formData: FormData) {
  const equipmentId = String(formData.get("equipmentId") || "");
  const conditionRaw = String(formData.get("condition") || "good");
  if (!conditionValues.includes(conditionRaw as (typeof conditionValues)[number])) throw new Error("Tình trạng không hợp lệ.");
  const condition = conditionRaw as (typeof conditionValues)[number];
  const [item] = await db.select().from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) throw new Error("Không tìm thấy máy.");
  if (item.recordStatus !== "active") throw new Error("Dụng cụ chưa hoàn thành hồ sơ nên chưa thể thực hiện nghiệp vụ.");
  const auth = await requireUser();
  if (!hasGroupPermission(auth, item.ownerGroupId, "operator")) throw new Error("Bạn không có quyền cập nhật CCDC này.");
  await db.transaction(async (tx) => {
    // Đổi sang tình trạng không Tốt khi máy đang Sẵn sàng → Chờ kiểm tra (đọc lại trạng thái sau khi khóa dòng).
    const locked = await lockEquipment(tx, equipmentId);
    const nextStatus = statusForCondition(locked.status, condition) as typeof item.status;
    await tx.update(equipment).set({ condition, ...(nextStatus !== locked.status ? { status: nextStatus } : {}), updatedBy: auth.userId, version: item.version + 1, updatedAt: new Date() }).where(eq(equipment.id, equipmentId));
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

/** Tạo CCDC nhỏ lẻ quản lý theo số lượng. */
export async function createQuantityToolAction(
  _previousState: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const groupId = String(formData.get("ownerGroupId") || "");
  const name = String(formData.get("name") || "").trim();
  const categoryCode = String(formData.get("categoryCode") || "KHAC");
  const equipmentType = name;
  const specification = String(formData.get("specification") || "").trim();
  const unit = String(formData.get("unit") || "Cái").trim();
  const quantity = Number(String(formData.get("quantity") || "0").replace(/,/g, "."));
  const purchasePriceRaw = String(formData.get("purchasePrice") || "").replace(/\D/g, "");
  const condition = String(formData.get("condition") || "good") as typeof toolCatalog.$inferInsert["condition"];
  const notes = String(formData.get("notes") || "").trim();
  const afterSave = String(formData.get("afterSave") || "close") === "add_next" ? "add_next" : "close";

  if (!groupId || name.length < 2 || !unit || !Number.isFinite(quantity) || quantity <= 0) {
    return { status: "error", message: "Vui lòng nhập Tên CCDC, ĐVT và Số lượng lớn hơn 0." };
  }
  if (!categoryCodes.includes(categoryCode as (typeof categoryCodes)[number])) {
    return { status: "error", message: "Nhóm thiết bị không hợp lệ." };
  }
  if (!condition || !["good", "major_damage", "awaiting_assessment", "irreparable"].includes(condition)) {
    return { status: "error", message: "Tình trạng CCDC không hợp lệ." };
  }

  try {
    const auth = await requireUser();
    if (auth.isReadOnlyViewer) return { status: "error", message: "Người xem toàn xưởng chỉ có quyền xem dữ liệu." };
    if (!auth.isWorkshopAdmin && !hasGroupPermission(auth, groupId, "operator")) {
      return { status: "error", message: "Chỉ Kỹ sư giám sát hoặc Đốc công được thêm CCDC cho nhóm mình." };
    }
    const ownerGroup = await assertOperationalGroup(groupId);
    let code = "";
    await db.transaction(async (tx) => {
      code = await nextAssetCode(tx, { groupCode: ownerGroup.code, equipmentPrefix: ownerGroup.equipmentPrefix, mode: "quantity" });
      const [created] = await tx.insert(toolCatalog).values({
        groupId,
        code,
        categoryCode,
        equipmentType: equipmentType || "Dụng cụ khác",
        name,
        specification: specification || null,
        unit,
        quantityOnHand: String(quantity),
        purchasePrice: purchasePriceRaw ? String(Number(purchasePriceRaw)) : null,
        condition,
        notes: notes || null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      }).returning();
      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: groupId,
        actorRole: getActorRoleLabel(auth, groupId),
        action: "tool_catalog.create",
        entityType: "tool_catalog",
        entityId: created.id,
        description: `Thêm CCDC theo số lượng ${code} - ${name}`,
        afterData: created,
      });
    });
    await setFlashMessage("success", "Đã thêm CCDC theo số lượng", `${code} · ${name} · ${quantity} ${unit}`);
    refreshEquipmentConsumers();
    return { status: "success", message: `Đã tạo ${code}.`, code, afterSave };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: "error", message: "Mã CCDC vừa sinh đã tồn tại. Vui lòng thử lại." };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Không thể thêm CCDC." };
  }
}

const toolConditionValues = ["good", "major_damage", "awaiting_assessment", "irreparable"] as const;

/**
 * Sửa THÔNG TIN CCDC theo số lượng (không đổi số lượng, không đổi giá): Kỹ sư giám sát (operator) trở lên của nhóm.
 * Chống ghi đè đồng thời: form gửi kèm `updatedAt` lúc mở; khác bản đang lưu thì báo tải lại.
 */
export async function updateQuantityToolAction(
  _previousState: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const toolId = String(formData.get("toolId") || "");
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") || "");
  const name = String(formData.get("name") || "").trim();
  const categoryCode = String(formData.get("categoryCode") || "KHAC");
  const specification = String(formData.get("specification") || "").trim();
  const unit = String(formData.get("unit") || "").trim();
  const condition = String(formData.get("condition") || "good");
  const currentLocation = String(formData.get("currentLocation") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const identityReason = String(formData.get("identityReason") || "").trim().replace(/\s+/g, " ");

  if (!toolId || !expectedUpdatedAt) return { status: "error", message: "Thiếu thông tin CCDC cần sửa." };
  if (name.length < 2 || name.length > 180) return { status: "error", message: "Tên CCDC cần từ 2 đến 180 ký tự." };
  if (!unit || unit.length > 30) return { status: "error", message: "Đơn vị tính không hợp lệ." };
  if (specification.length > 180) return { status: "error", message: "Quy cách tối đa 180 ký tự." };
  if (currentLocation.length > 255) return { status: "error", message: "Vị trí tối đa 255 ký tự." };
  if (!categoryCodes.includes(categoryCode as (typeof categoryCodes)[number])) return { status: "error", message: "Nhóm thiết bị không hợp lệ." };
  if (!(toolConditionValues as readonly string[]).includes(condition)) return { status: "error", message: "Tình trạng CCDC không hợp lệ." };

  try {
    const [current] = await db.select().from(toolCatalog).where(eq(toolCatalog.id, toolId)).limit(1);
    if (!current || !current.isActive || current.recordStatus !== "active") {
      return { status: "error", message: "Không tìm thấy CCDC (có thể đã bị ngừng quản lý). Hãy tải lại trang." };
    }
    const auth = await requireGroupPermission(current.groupId, "operator");

    // Tên + Nhóm thiết bị là danh tính của CCDC: chỉ Quản lý Xưởng / Admin đổi, bắt buộc lý do (ghi nhật ký).
    const changedIdentity = changedIdentityFields(
      { name: current.name, equipmentType: current.equipmentType, categoryCode: current.categoryCode },
      { name, equipmentType: current.equipmentType, categoryCode },
    );
    if (changedIdentity.length) {
      if (!canChangeIdentity(auth)) {
        return { status: "error", message: `${changedIdentity.join(", ")} đã cố định theo mã ${current.code ?? "CCDC"}, không sửa được. Muốn đổi chủng loại hãy thêm CCDC mới; nhập sai thì nhờ Quản lý Xưởng hiệu chỉnh.` };
      }
      if (identityReason.length < 5) return { status: "error", message: "Đổi Tên / Nhóm thiết bị cần ghi lý do hiệu chỉnh (ít nhất 5 ký tự)." };
    }

    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(toolCatalog).where(eq(toolCatalog.id, toolId)).for("update");
      if (!locked || locked.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new Error("CCDC này vừa được người khác cập nhật. Hãy đóng hộp thoại, tải lại trang rồi sửa lại.");
      }
      const [updated] = await tx.update(toolCatalog).set({
        name: changedIdentity.length ? name : current.name,
        // CCDC theo số lượng: "loại" luôn bằng tên (giống lúc thêm mới).
        equipmentType: changedIdentity.length ? name : current.equipmentType,
        categoryCode,
        specification: specification || null,
        unit,
        condition: condition as typeof toolCatalog.$inferInsert["condition"],
        currentLocation: currentLocation || null,
        notes: notes || null,
        updatedBy: auth.userId,
        updatedAt: new Date(),
      }).where(and(eq(toolCatalog.id, toolId), eq(toolCatalog.updatedAt, locked.updatedAt))).returning();
      if (!updated) throw new Error("CCDC này vừa được người khác cập nhật. Hãy tải lại trang rồi sửa lại.");
      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: current.groupId,
        actorRole: getActorRoleLabel(auth, current.groupId),
        action: "tool_catalog.update",
        entityType: "tool_catalog",
        entityId: toolId,
        description: `Sửa thông tin CCDC theo số lượng ${current.code ?? ""} ${name}`.replace(/\s+/g, " "),
        beforeData: locked,
        afterData: updated,
        reason: changedIdentity.length ? identityReason : null,
      });
    });
    await setFlashMessage("success", "Đã cập nhật CCDC", `${current.code ?? ""} · ${name}`.trim());
    refreshEquipmentConsumers();
    return { status: "success", message: "Đã lưu thay đổi.", afterSave: "close" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật CCDC." };
  }
}

/**
 * Hiệu chỉnh SỐ LƯỢNG tồn trực tiếp (kiểm kê thấy lệch, nhập sai): Đốc công (manager) trở lên, BẮT BUỘC ghi lý do.
 * Số mượn/trả/thanh lý vẫn đi theo phiếu; chỗ này chỉ để sửa sai. Khóa dòng + điều kiện theo số cũ để không đè phiếu đang chạy.
 */
export async function adjustToolQuantityAction(
  _previousState: EquipmentFormState,
  formData: FormData,
): Promise<EquipmentFormState> {
  const toolId = String(formData.get("toolId") || "");
  const oldQty = Number(String(formData.get("oldQuantity") || "").replace(/,/g, "."));
  const newQty = Number(String(formData.get("newQuantity") || "").replace(/,/g, "."));
  const reasonRaw = String(formData.get("reason") || "");

  if (!toolId) return { status: "error", message: "Thiếu thông tin CCDC cần hiệu chỉnh." };
  const check = validateQuantityAdjustment({ oldQty, newQty, reason: reasonRaw });
  if (!check.ok) return { status: "error", message: check.message };

  try {
    const [current] = await db.select().from(toolCatalog).where(eq(toolCatalog.id, toolId)).limit(1);
    if (!current || !current.isActive || current.recordStatus !== "active") {
      return { status: "error", message: "Không tìm thấy CCDC (có thể đã bị ngừng quản lý). Hãy tải lại trang." };
    }
    const auth = await requireGroupPermission(current.groupId, "manager");
    const newValue = String(Math.round(newQty * 100) / 100);

    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(toolCatalog).where(eq(toolCatalog.id, toolId)).for("update");
      if (!locked || Math.round(Number(locked.quantityOnHand) * 100) !== Math.round(oldQty * 100)) {
        throw new Error("Số lượng vừa thay đổi (có phiếu mượn/trả/thanh lý khác). Hãy tải lại trang rồi hiệu chỉnh lại.");
      }
      const [updated] = await tx.update(toolCatalog).set({
        quantityOnHand: newValue,
        updatedBy: auth.userId,
        updatedAt: new Date(),
      }).where(and(eq(toolCatalog.id, toolId), eq(toolCatalog.quantityOnHand, locked.quantityOnHand))).returning();
      if (!updated) throw new Error("Số lượng vừa thay đổi. Hãy tải lại trang rồi hiệu chỉnh lại.");
      await writeAudit(tx as never, {
        actorUserId: auth.userId,
        actorGroupId: current.groupId,
        actorRole: getActorRoleLabel(auth, current.groupId),
        action: "tool_catalog.adjust_quantity",
        entityType: "tool_catalog",
        entityId: toolId,
        description: `Hiệu chỉnh số lượng ${current.code ?? current.name}: ${Number(locked.quantityOnHand)} → ${Number(newValue)} ${current.unit}. Lý do: ${check.reason}`,
        beforeData: { quantityOnHand: locked.quantityOnHand },
        afterData: { quantityOnHand: updated.quantityOnHand, reason: check.reason },
      });
    });
    await setFlashMessage("success", "Đã hiệu chỉnh số lượng", `${current.code ?? current.name} · ${Number(oldQty)} → ${Number(newValue)} ${current.unit}`);
    refreshEquipmentConsumers();
    return { status: "success", message: "Đã hiệu chỉnh số lượng.", afterSave: "close" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Không thể hiệu chỉnh số lượng." };
  }
}
