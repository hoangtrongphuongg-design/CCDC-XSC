/**
 * Truy vấn dùng chung cho trang "Dụng cụ nhóm tôi" và file Excel xuất từ đó, để file xuất
 * luôn đúng bằng danh sách trên màn hình. Chỉ chạy ở server.
 */
import { and, asc, desc, eq, inArray, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, repairs, toolCatalog, transfers } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { OPEN_MACHINE_LOAN_STATUSES, isHeldByBorrower } from "@/lib/loan-status";
import { CLOSED_REPAIR_STATUSES, CLOSED_TRANSFER_STATUSES } from "@/lib/workflow-status";
import type { ExportTool } from "@/lib/export/equipment-export";
import type { ToolRow } from "@/lib/tool-filter";
import { loadToolHistoryIds } from "@/lib/record-history";

export type OperationalGroup = {
  id: string;
  code: string;
  name: string;
  equipmentPrefix: string;
  isSystem: boolean;
};

export type EquipmentScopePermission = {
  groupId: string;
  groupCode: string;
  groupName: string;
  equipmentPrefix: string;
  level: "viewer" | "operator" | "manager";
};

export type ActiveLoan = { equipmentId: string; ownerGroupId: string; borrowerGroupId: string; status: string; workLocation: string | null; updatedAt: Date };
export type ActiveTransfer = { equipmentId: string; sourceGroupId: string; targetGroupId: string; status: string; updatedAt: Date };
export type ActiveRepair = { equipmentId: string; status: string; repairType: string | null; updatedAt: Date };


/** Nhóm nghiệp vụ chính thức đang hoạt động (bỏ nhóm hệ thống như Kho thanh lý). */
export async function loadOperationalGroups(): Promise<OperationalGroup[]> {
  const rows = await db.select({
    id: groups.id,
    code: groups.code,
    name: groups.name,
    equipmentPrefix: groups.equipmentPrefix,
    isSystem: groups.isSystem,
  }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name));
  return rows.filter((group) => !group.isSystem && isOfficialOperationalGroupCode(group.code));
}

/** Mọi nhóm (kể cả không hoạt động / hệ thống) để tra tên nhóm. */
export async function loadAllGroups(): Promise<Array<{ id: string; code: string; name: string }>> {
  return db.select({ id: groups.id, code: groups.code, name: groups.name }).from(groups);
}

/**
 * Phạm vi nhóm mà tài khoản được xem/thao tác ở "Dụng cụ nhóm tôi": Admin/Quản lý Xưởng
 * mọi nhóm (quyền manager), Người xem toàn xưởng mọi nhóm (quyền viewer), còn lại theo
 * quyền được cấp.
 */
export function buildEquipmentPermissions(
  auth: Pick<AuthContext, "isWorkshopAdmin" | "isReadOnlyViewer" | "permissions">,
  groupRows: OperationalGroup[],
): EquipmentScopePermission[] {
  const toPermission = (group: OperationalGroup, level: EquipmentScopePermission["level"]): EquipmentScopePermission => ({
    groupId: group.id,
    groupCode: group.code,
    groupName: group.name,
    equipmentPrefix: group.equipmentPrefix,
    level,
  });
  if (auth.isWorkshopAdmin) return groupRows.map((group) => toPermission(group, "manager"));
  if (auth.isReadOnlyViewer) return groupRows.map((group) => toPermission(group, "viewer"));

  const permissionByGroup = new Map(auth.permissions.map((permission) => [permission.groupId, permission]));
  return groupRows
    .filter((group) => permissionByGroup.has(group.id))
    .map((group) => toPermission(group, permissionByGroup.get(group.id)!.level));
}

function firstPerEquipment<T extends { equipmentId: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(row.equipmentId)) map.set(row.equipmentId, row);
  return map;
}

async function loadOpenLoans(groupIds?: string[]): Promise<ActiveLoan[]> {
  const openStatus = inArray(machineLoans.status, [...OPEN_MACHINE_LOAN_STATUSES]);
  return db.select({
    equipmentId: machineLoans.equipmentId,
    ownerGroupId: machineLoans.ownerGroupId,
    borrowerGroupId: machineLoans.borrowerGroupId,
    status: machineLoans.status,
    workLocation: machineLoans.workLocation,
    updatedAt: machineLoans.updatedAt,
  }).from(machineLoans)
    .where(groupIds
      ? and(openStatus, or(inArray(machineLoans.ownerGroupId, groupIds), inArray(machineLoans.borrowerGroupId, groupIds)))
      : openStatus)
    .orderBy(desc(machineLoans.updatedAt));
}

async function loadOpenTransfers(groupIds?: string[]): Promise<ActiveTransfer[]> {
  const openStatus = notInArray(transfers.status, [...CLOSED_TRANSFER_STATUSES]);
  return db.select({
    equipmentId: transfers.equipmentId,
    sourceGroupId: transfers.sourceGroupId,
    targetGroupId: transfers.targetGroupId,
    status: transfers.status,
    updatedAt: transfers.updatedAt,
  }).from(transfers)
    .where(groupIds
      ? and(openStatus, or(inArray(transfers.sourceGroupId, groupIds), inArray(transfers.targetGroupId, groupIds)))
      : openStatus)
    .orderBy(desc(transfers.updatedAt));
}

async function loadOpenRepairs(equipmentIds?: string[]): Promise<ActiveRepair[]> {
  if (equipmentIds && !equipmentIds.length) return [];
  const openStatus = notInArray(repairs.status, [...CLOSED_REPAIR_STATUSES]);
  return db.select({
    equipmentId: repairs.equipmentId,
    status: repairs.status,
    repairType: repairs.repairType,
    updatedAt: repairs.updatedAt,
  }).from(repairs)
    .where(equipmentIds ? and(openStatus, inArray(repairs.equipmentId, equipmentIds)) : openStatus)
    .orderBy(desc(repairs.updatedAt));
}

export type EquipmentMovements = {
  loanByEquipment: Map<string, ActiveLoan>;
  transferByEquipment: Map<string, ActiveTransfer>;
  repairByEquipment: Map<string, ActiveRepair>;
};

/**
 * Máy hiển thị cho tập nhóm `groupIds`: máy thuộc nhóm, HOẶC nhóm đang giữ do mượn (phiếu
 * on_loan/incident — không dựa vào current_group_id), HOẶC có điều chuyển đang mở liên quan.
 */
export async function loadScopedEquipment(groupIds: string[]): Promise<{ rows: Array<typeof equipment.$inferSelect> } & EquipmentMovements> {
  if (!groupIds.length) {
    return { rows: [], loanByEquipment: new Map(), transferByEquipment: new Map(), repairByEquipment: new Map() };
  }

  const [loanRows, transferRows] = await Promise.all([loadOpenLoans(groupIds), loadOpenTransfers(groupIds)]);

  const heldAsBorrowerIds = loanRows
    .filter((row) => isHeldByBorrower(row.status) && groupIds.includes(row.borrowerGroupId))
    .map((row) => row.equipmentId);
  const extraIds = Array.from(new Set([...transferRows.map((row) => row.equipmentId), ...heldAsBorrowerIds]));

  const rows = await db.select().from(equipment)
    .where(extraIds.length
      ? or(inArray(equipment.ownerGroupId, groupIds), inArray(equipment.id, extraIds))
      : inArray(equipment.ownerGroupId, groupIds))
    .orderBy(asc(equipment.code));

  const repairRows = await loadOpenRepairs(rows.map((row) => row.id));
  return {
    rows,
    loanByEquipment: firstPerEquipment(loanRows),
    transferByEquipment: firstPerEquipment(transferRows),
    repairByEquipment: firstPerEquipment(repairRows),
  };
}

/** Toàn bộ máy đã hoàn thành hồ sơ (cho trang/báo cáo toàn xưởng) + phiếu đang mở. */
export async function loadWorkshopEquipment(): Promise<{ rows: Array<typeof equipment.$inferSelect> } & EquipmentMovements> {
  const [rows, loanRows, transferRows, repairRows] = await Promise.all([
    db.select().from(equipment).where(eq(equipment.recordStatus, "active")).orderBy(asc(equipment.code)),
    loadOpenLoans(),
    loadOpenTransfers(),
    loadOpenRepairs(),
  ]);
  return {
    rows,
    loanByEquipment: firstPerEquipment(loanRows),
    transferByEquipment: firstPerEquipment(transferRows),
    repairByEquipment: firstPerEquipment(repairRows),
  };
}

/** CCDC quản lý theo số lượng đang hoạt động (tùy chọn giới hạn theo nhóm). */
export async function loadTools(groupIds?: string[]): Promise<ExportTool[]> {
  if (groupIds && !groupIds.length) return [];
  const active = and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active"));
  const rows = await db.select({
    code: toolCatalog.code,
    name: toolCatalog.name,
    specification: toolCatalog.specification,
    unit: toolCatalog.unit,
    quantity: toolCatalog.quantityOnHand,
    categoryCode: toolCatalog.categoryCode,
    equipmentType: toolCatalog.equipmentType,
    groupId: toolCatalog.groupId,
    groupCode: groups.code,
    groupName: groups.name,
  }).from(toolCatalog)
    .innerJoin(groups, eq(toolCatalog.groupId, groups.id))
    .where(groupIds ? and(active, inArray(toolCatalog.groupId, groupIds)) : active)
    .orderBy(asc(groups.name), asc(toolCatalog.code), asc(toolCatalog.name));
  return rows.map((row) => ({ ...row, quantity: Number(row.quantity) }));
}

/** CCDC theo số lượng cho bảng "Dụng cụ nhóm tôi" (có id, tình trạng, vị trí, ghi chú, phiên bản để sửa). */
export async function loadToolRows(groupIds?: string[]): Promise<ToolRow[]> {
  if (groupIds && !groupIds.length) return [];
  const active = and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active"));
  const rows = await db.select({
    id: toolCatalog.id,
    code: toolCatalog.code,
    name: toolCatalog.name,
    specification: toolCatalog.specification,
    unit: toolCatalog.unit,
    quantity: toolCatalog.quantityOnHand,
    categoryCode: toolCatalog.categoryCode,
    equipmentType: toolCatalog.equipmentType,
    condition: toolCatalog.condition,
    currentLocation: toolCatalog.currentLocation,
    notes: toolCatalog.notes,
    updatedAt: toolCatalog.updatedAt,
    groupId: toolCatalog.groupId,
    groupCode: groups.code,
    groupName: groups.name,
  }).from(toolCatalog)
    .innerJoin(groups, eq(toolCatalog.groupId, groups.id))
    .where(groupIds ? and(active, inArray(toolCatalog.groupId, groupIds)) : active)
    .orderBy(asc(groups.name), asc(toolCatalog.code), asc(toolCatalog.name));
  const withHistory = await loadToolHistoryIds(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, quantity: Number(row.quantity), updatedAt: row.updatedAt.toISOString(), hasHistory: withHistory.has(row.id) }));
}
