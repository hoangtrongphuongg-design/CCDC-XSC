import { and, eq, gte, inArray, isNotNull, isNull, max, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, quickLoans, repairs } from "@/lib/db/schema";
import { vnDate } from "@/lib/export/equipment-export";
import { BORROWER_HOLDING_STATUSES } from "@/lib/loan-status";
import {
  buildOverdueRows,
  idleMachines,
  monthsWindowStart,
  repairCostByGroup,
  repairCostByMonth,
  type IdleRow,
  type OverdueRow,
  type RepairCostGroup,
  type RepairCostMonth,
} from "@/lib/reports";

export type OperationsReport = {
  today: string;
  overdue: OverdueRow[];
  repairByMonth: RepairCostMonth[];
  repairByGroup: RepairCostGroup[];
  idle: { rows: IdleRow[]; total: number };
};

/** Báo cáo điều hành dùng cho trang /reports và file Excel (cùng một nguồn số liệu). */
export async function loadOperationsReport(now: Date = new Date()): Promise<OperationsReport> {
  const today = vnDate(now);
  const windowStart = monthsWindowStart(now);

  const [groupRows, loanRows, quickRows, repairRows, machineRows, lastLoanRows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups),
    db.select({
      code: machineLoans.code, status: machineLoans.status, ownerGroupId: machineLoans.ownerGroupId, borrowerGroupId: machineLoans.borrowerGroupId,
      expectedReturnDate: machineLoans.expectedReturnDate, equipmentCode: equipment.code, equipmentName: equipment.name,
    }).from(machineLoans).innerJoin(equipment, eq(equipment.id, machineLoans.equipmentId))
      .where(inArray(machineLoans.status, [...BORROWER_HOLDING_STATUSES])),
    db.select({
      code: quickLoans.code, status: quickLoans.status, sourceGroupId: quickLoans.sourceGroupId, borrowerGroupId: quickLoans.borrowerGroupId,
      expectedReturnAt: quickLoans.expectedReturnAt, itemName: quickLoans.itemName, quantity: quickLoans.quantityBorrowed, unit: quickLoans.unit,
    }).from(quickLoans).where(eq(quickLoans.status, "borrowed")),
    db.select({ completedAt: repairs.completedAt, cost: repairs.cost, ownerGroupId: equipment.ownerGroupId })
      .from(repairs).innerJoin(equipment, eq(equipment.id, repairs.equipmentId))
      .where(and(isNotNull(repairs.completedAt), gte(repairs.completedAt, windowStart))),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId, recordedDate: equipment.recordedDate })
      .from(equipment)
      .where(and(eq(equipment.recordStatus, "active"), isNull(equipment.archivedAt), eq(equipment.status, "in_use_owner"), eq(equipment.condition, "good"))),
    db.select({ equipmentId: machineLoans.equipmentId, lastAt: max(machineLoans.createdAt) }).from(machineLoans)
      .where(notInArray(machineLoans.status, ["rejected", "cancelled"])).groupBy(machineLoans.equipmentId),
  ]);

  const groupNames = new Map(groupRows.map((g) => [g.id, g.name]));
  const lastLoanById = new Map(lastLoanRows.map((r) => [r.equipmentId, r.lastAt]));

  return {
    today,
    overdue: buildOverdueRows({
      loans: loanRows.map((r) => ({ ...r, label: `${r.equipmentName} (${r.equipmentCode})` })),
      quickLoans: quickRows.map((r) => ({ ...r, label: `${r.itemName} × ${Number(r.quantity)} ${r.unit}` })),
      groupNames,
      today,
    }),
    repairByMonth: repairCostByMonth(repairRows, now),
    repairByGroup: repairCostByGroup(repairRows, groupNames, now),
    idle: idleMachines(machineRows.map((m) => ({ ...m, lastLoanAt: lastLoanById.get(m.id) ?? null })), groupNames, today),
  };
}
