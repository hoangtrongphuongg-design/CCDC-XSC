import { cache } from "react";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { disposals, equipment, groups, inventoryItems, lossReports, inventorySessions, machineLoans, quickLoans, repairs, toolCatalog, toolDisposals, transfers } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import { OPEN_MACHINE_LOAN_STATUSES } from "@/lib/loan-status";
import { OPEN_DISPOSAL_STATUSES, OPEN_LOSS_STATUSES, OPEN_QUICK_LOAN_STATUSES, OPEN_TRANSFER_STATUSES } from "@/lib/workflow-status";
import { buildMyTasks, isWsLevel, type MyTask, type TaskSubject } from "@/lib/my-tasks";

/** Số phiếu đang mở rất ít nên đọc thẳng, không cần phân trang. */
async function compute(subject: TaskSubject): Promise<MyTask[]> {
  if (subject.isReadOnlyViewer) return [];
  if (!isWsLevel(subject) && subject.permissions.length === 0) return [];

  // Chỉ Đốc công (manager) mới có việc kiểm kê định kỳ. Truy vấn riêng, lỗi (vd chưa chạy SQL V1.7.1) không làm mất các việc khác.
  const inventoryRowsPromise = subject.permissions.some((p) => p.level === "manager")
    ? db.select({
      id: inventorySessions.id, code: inventorySessions.code, groupId: inventorySessions.groupId, period: inventorySessions.period, createdAt: inventorySessions.createdAt,
      pending: sql<number>`count(${inventoryItems.id}) filter (where ${inventoryItems.offsite} = false and ${inventoryItems.unexpected} = false and ${inventoryItems.result} is null)`.mapWith(Number),
      // CCDC theo số lượng chưa đếm (chỉ đợt quý có cờ includes_tools).
      toolPending: sql<number>`case when ${inventorySessions.includesTools} then greatest((select count(*) from tool_catalog tc where tc.group_id = ${inventorySessions.groupId} and tc.is_active = true and tc.record_status = 'active') - (select count(*) from inventory_tool_counts c where c.session_id = ${inventorySessions.id}), 0) else 0 end`.mapWith(Number),
    }).from(inventorySessions)
      .leftJoin(inventoryItems, eq(inventoryItems.sessionId, inventorySessions.id))
      .where(and(eq(inventorySessions.status, "open"), isNotNull(inventorySessions.period)))
      .groupBy(inventorySessions.id, inventorySessions.code, inventorySessions.groupId, inventorySessions.period, inventorySessions.createdAt, inventorySessions.includesTools)
      .catch((error) => { console.error("loadMyTasks inventory failed", error); return []; })
    : Promise.resolve([]);

  // Báo mất chỉ là việc của Quản lý Xưởng / Admin; truy vấn riêng, lỗi (vd chưa chạy SQL V1.7.3) không làm mất các việc khác.
  const lossRowsPromise = isWsLevel(subject)
    ? db.select({
      id: lossReports.id, code: lossReports.code, status: lossReports.status, updatedAt: lossReports.updatedAt,
      ownerGroupId: lossReports.ownerGroupId, reportedBy: lossReports.reportedBy, quantity: lossReports.quantity,
      equipmentCode: equipment.code, equipmentName: equipment.name, toolName: toolCatalog.name, unit: toolCatalog.unit,
    }).from(lossReports)
      .leftJoin(equipment, eq(equipment.id, lossReports.equipmentId))
      .leftJoin(toolCatalog, eq(toolCatalog.id, lossReports.toolId))
      .where(inArray(lossReports.status, [...OPEN_LOSS_STATUSES]))
      .catch((error) => { console.error("loadMyTasks losses failed", error); return []; })
    : Promise.resolve([]);

  const [groupRows, loanRows, quickRows, transferRows, repairRows, disposalRows, toolDisposalRows, inventoryRows, lossRows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name, code: groups.code }).from(groups),
    db.select({
      id: machineLoans.id, code: machineLoans.code, status: machineLoans.status, updatedAt: machineLoans.updatedAt,
      ownerGroupId: machineLoans.ownerGroupId, borrowerGroupId: machineLoans.borrowerGroupId, requestedBy: machineLoans.requestedBy,
      expectedReturnDate: machineLoans.expectedReturnDate, equipmentCode: equipment.code, equipmentName: equipment.name,
    }).from(machineLoans).innerJoin(equipment, eq(equipment.id, machineLoans.equipmentId))
      .where(inArray(machineLoans.status, [...OPEN_MACHINE_LOAN_STATUSES])),
    db.select({
      id: quickLoans.id, code: quickLoans.code, status: quickLoans.status, updatedAt: quickLoans.updatedAt,
      sourceGroupId: quickLoans.sourceGroupId, borrowerGroupId: quickLoans.borrowerGroupId, requestedBy: quickLoans.requestedBy,
      expectedReturnAt: quickLoans.expectedReturnAt, itemName: quickLoans.itemName, quantity: quickLoans.quantityBorrowed, unit: quickLoans.unit,
    }).from(quickLoans).where(inArray(quickLoans.status, [...OPEN_QUICK_LOAN_STATUSES])),
    db.select({
      id: transfers.id, code: transfers.code, status: transfers.status, updatedAt: transfers.updatedAt,
      sourceGroupId: transfers.sourceGroupId, targetGroupId: transfers.targetGroupId, proposedBy: transfers.proposedBy,
      handedOverAt: transfers.handedOverAt, equipmentCode: equipment.code, equipmentName: equipment.name,
    }).from(transfers).innerJoin(equipment, eq(equipment.id, transfers.equipmentId))
      .where(inArray(transfers.status, [...OPEN_TRANSFER_STATUSES])),
    db.select({
      id: repairs.id, code: repairs.code, status: repairs.status, updatedAt: repairs.updatedAt,
      ownerGroupId: equipment.ownerGroupId, equipmentCode: equipment.code, equipmentName: equipment.name,
    }).from(repairs).innerJoin(equipment, eq(equipment.id, repairs.equipmentId))
      .where(inArray(repairs.status, ["pending_acceptance", "wait_owner_confirm", "wait_owner_receive"])),
    db.select({
      id: disposals.id, code: disposals.code, status: disposals.status, updatedAt: disposals.updatedAt,
      ownerGroupId: disposals.ownerGroupId, proposedBy: disposals.proposedBy, equipmentCode: equipment.code, equipmentName: equipment.name,
    }).from(disposals).innerJoin(equipment, eq(equipment.id, disposals.equipmentId))
      .where(inArray(disposals.status, [...OPEN_DISPOSAL_STATUSES])),
    db.select({
      id: toolDisposals.id, code: toolDisposals.code, status: toolDisposals.status, updatedAt: toolDisposals.updatedAt,
      ownerGroupId: toolDisposals.ownerGroupId, proposedBy: toolDisposals.proposedBy, quantity: toolDisposals.quantity,
      toolName: toolCatalog.name, unit: toolCatalog.unit,
    }).from(toolDisposals).innerJoin(toolCatalog, eq(toolCatalog.id, toolDisposals.toolId))
      .where(inArray(toolDisposals.status, [...OPEN_DISPOSAL_STATUSES])),
    inventoryRowsPromise,
    lossRowsPromise,
  ]);

  return buildMyTasks(subject, {
    loans: loanRows.map((r) => ({ ...r, label: `${r.equipmentName} (${r.equipmentCode})` })),
    quickLoans: quickRows.map((r) => ({ ...r, label: `${r.itemName} × ${Number(r.quantity)} ${r.unit}` })),
    transfers: transferRows.map((r) => ({ ...r, handedOver: Boolean(r.handedOverAt), label: `${r.equipmentName} (${r.equipmentCode})` })),
    repairs: repairRows.map((r) => ({ ...r, label: `${r.equipmentName} (${r.equipmentCode})` })),
    disposals: [
      ...disposalRows.map((r) => ({ ...r, label: `${r.equipmentName} (${r.equipmentCode})` })),
      ...toolDisposalRows.map((r) => ({ ...r, label: `${r.toolName} × ${Number(r.quantity)} ${r.unit}` })),
    ],
    losses: lossRows.map((r) => ({ ...r, label: r.equipmentName ? `${r.equipmentName} (${r.equipmentCode})` : `${r.toolName ?? "CCDC"} × ${Number(r.quantity)} ${r.unit ?? ""}`.trim() })),
    inventories: inventoryRows.flatMap((r) => (r.period ? [{ id: r.id, code: r.code, groupId: r.groupId, period: r.period, pending: r.pending, toolPending: r.toolPending, updatedAt: r.createdAt }] : [])),
    warehouseGroupId: groupRows.find((g) => g.code === "KHO_TL")?.id ?? null,
    groupNames: new Map(groupRows.map((g) => [g.id, g.name])),
  });
}

/** Khóa chỉ gồm chuỗi để `cache` dùng chung kết quả giữa layout và trang trong cùng một request. */
const loadBySubjectKey = cache(async (key: string): Promise<MyTask[]> => {
  try {
    return await compute(JSON.parse(key) as TaskSubject);
  } catch (error) {
    // Huy hiệu/chuông chỉ là gợi ý: lỗi truy vấn không được làm hỏng cả trang.
    console.error("loadMyTasks failed", error);
    return [];
  }
});

export function loadMyTasks(auth: AuthContext): Promise<MyTask[]> {
  const subject: TaskSubject = {
    userId: auth.userId,
    isAdmin: auth.isAdmin,
    isWsManager: auth.isWsManager,
    isReadOnlyViewer: auth.isReadOnlyViewer,
    permissions: auth.permissions,
  };
  return loadBySubjectKey(JSON.stringify(subject));
}
