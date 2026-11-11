import { cache } from "react";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { disposals, equipment, groups, machineLoans, quickLoans, repairs, toolCatalog, toolDisposals, transfers } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import { OPEN_MACHINE_LOAN_STATUSES } from "@/lib/loan-status";
import { OPEN_DISPOSAL_STATUSES, OPEN_QUICK_LOAN_STATUSES, OPEN_TRANSFER_STATUSES } from "@/lib/workflow-status";
import { buildMyTasks, isWsLevel, type MyTask, type TaskSubject } from "@/lib/my-tasks";

/** Số phiếu đang mở rất ít nên đọc thẳng, không cần phân trang. */
async function compute(subject: TaskSubject): Promise<MyTask[]> {
  if (subject.isReadOnlyViewer) return [];
  if (!isWsLevel(subject) && subject.permissions.length === 0) return [];

  const [groupRows, loanRows, quickRows, transferRows, repairRows, disposalRows, toolDisposalRows] = await Promise.all([
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
      .where(inArray(repairs.status, ["pending_acceptance", "wait_owner_confirm"])),
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
