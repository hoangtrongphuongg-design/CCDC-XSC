/**
 * Tạo máy mới dùng chung cho form "Thêm CCDC" (`saveEquipmentRecordAction`) và nhập Excel
 * (`importEquipmentAction`), để hai đường tạo máy không bao giờ lệch nhau.
 * File này KHÔNG phải Server Action nên không được gắn "use server".
 */
import { equipment, equipmentTypeCatalog } from "@/lib/db/schema";
import { statusForCondition } from "@/lib/equipment-status-rule";
import { writeAudit } from "@/lib/audit";
import { nextAssetCode, type DbTx } from "@/lib/workflows";

export type NewEquipmentOrigin = "existing" | "new_purchase" | "other";
export type NewEquipmentCondition = "good" | "major_damage" | "awaiting_assessment" | "irreparable";

export type NewEquipmentFields = {
  name: string;
  equipmentType: string;
  categoryCode: string;
  condition: NewEquipmentCondition;
  legacyCode?: string | null;
  technicalSpecs?: string | null;
  technicalNote?: string | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  manufactureYear?: number | null;
  commissionYear?: number | null;
  currentLocation?: string | null;
  purchaseDate?: string | null;
  poContractNo?: string | null;
  supplierName?: string | null;
  purchasePrice?: number | null;
  warrantyUntil?: string | null;
  purchaseNote?: string | null;
  notes?: string | null;
};

export type NewEquipmentBase = {
  code: string;
  ownerGroupId: string;
  originType: NewEquipmentOrigin;
  recordedDate: string;
  actorUserId: string;
};

/** Giá trị cột của một máy mới (trạng thái ban đầu luôn "Sẵn sàng", hồ sơ "active"). */
export function buildEquipmentInsertValues(base: NewEquipmentBase, fields: NewEquipmentFields): typeof equipment.$inferInsert {
  return {
    code: base.code,
    legacyCode: fields.legacyCode || null,
    name: fields.name,
    equipmentType: fields.equipmentType,
    categoryCode: fields.categoryCode,
    technicalSpecs: fields.technicalSpecs || null,
    technicalNote: fields.technicalNote || null,
    unit: "cái",
    recordStatus: "active",
    originType: base.originType,
    recordedDate: base.recordedDate,
    brand: fields.brand || null,
    model: fields.model || null,
    serial: fields.serial || null,
    manufactureYear: fields.manufactureYear || null,
    commissionYear: fields.commissionYear || null,
    originGroupId: base.ownerGroupId,
    ownerGroupId: base.ownerGroupId,
    currentGroupId: base.ownerGroupId,
    currentLocation: fields.currentLocation || null,
    // Sẵn sàng chỉ khi tình trạng Tốt; Hư hỏng / Chưa đánh giá / Không thể phục hồi thì Chờ kiểm tra.
    status: statusForCondition("in_use_owner", fields.condition) as "in_use_owner" | "wait_inspection",
    condition: fields.condition,
    purchaseDate: fields.purchaseDate || null,
    poContractNo: fields.poContractNo || null,
    supplierName: fields.supplierName || null,
    purchasePrice: fields.purchasePrice === undefined || fields.purchasePrice === null ? null : String(fields.purchasePrice),
    warrantyUntil: fields.warrantyUntil || null,
    purchaseNote: fields.purchaseNote || null,
    notes: fields.notes || null,
    createdBy: base.actorUserId,
    updatedBy: base.actorUserId,
  };
}

/** Loại máy mới tự được thêm vào danh mục gợi ý của nhóm thiết bị. */
export async function ensureEquipmentType(tx: DbTx, categoryCode: string, name: string, createdBy: string) {
  await tx.insert(equipmentTypeCatalog).values({ categoryCode, name, createdBy }).onConflictDoNothing();
}

/** Tạo một máy: cấp mã hệ thống, thêm loại vào danh mục, ghi máy và nhật ký (trong transaction của người gọi). */
export async function insertEquipmentRecord(
  tx: DbTx,
  input: {
    actorUserId: string;
    actorRole: string;
    ownerGroup: { id: string; code: string; name: string; equipmentPrefix: string };
    originType: NewEquipmentOrigin;
    recordedDate: string;
    fields: NewEquipmentFields;
  },
): Promise<typeof equipment.$inferSelect> {
  const code = await nextAssetCode(tx, {
    groupCode: input.ownerGroup.code,
    equipmentPrefix: input.ownerGroup.equipmentPrefix,
    mode: "individual",
  });
  await ensureEquipmentType(tx, input.fields.categoryCode, input.fields.equipmentType, input.actorUserId);

  const [created] = await tx.insert(equipment).values(buildEquipmentInsertValues({
    code,
    ownerGroupId: input.ownerGroup.id,
    originType: input.originType,
    recordedDate: input.recordedDate,
    actorUserId: input.actorUserId,
  }, input.fields)).returning();

  await writeAudit(tx, {
    actorUserId: input.actorUserId,
    actorGroupId: input.ownerGroup.id,
    actorRole: input.actorRole,
    action: input.originType === "new_purchase" ? "equipment.initial_allocation" : "equipment.create",
    entityType: "equipment",
    entityId: created.id,
    description: input.originType === "new_purchase"
      ? `Tiếp nhận và cấp phát ban đầu ${created.code} cho ${input.ownerGroup.name}`
      : `Tạo CCDC hiện hữu ${created.code}`,
    afterData: created,
  });
  return created;
}
