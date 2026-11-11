"use server";

import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLogs, equipment, groups, machineLoans, transfers, users } from "@/lib/db/schema";
import { canViewWholeWorkshop, requireUser } from "@/lib/auth/guards";
import { HISTORY_LIMIT, canViewEquipmentHistory } from "@/lib/equipment-history";
import { OPEN_MACHINE_LOAN_STATUSES, isHeldByBorrower } from "@/lib/loan-status";
import { CLOSED_TRANSFER_STATUSES } from "@/lib/workflow-status";
import type { EquipmentAuditRow } from "@/components/equipment/equipment-workspace";

export type EquipmentHistoryResult =
  | { ok: true; rows: EquipmentAuditRow[] }
  | { ok: false; message: string };

/**
 * Lịch sử thay đổi của MỘT máy, tải khi người dùng mở tab "Lịch sử" (trước đây trang tải sẵn
 * nhật ký của mọi máy mỗi lần mở nên chậm dần theo dữ liệu). Trả kết quả thay vì ném lỗi vì
 * Next che nội dung lỗi của server action ở production.
 */
export async function loadEquipmentHistoryAction(equipmentId: string): Promise<EquipmentHistoryResult> {
  const auth = await requireUser();
  if (typeof equipmentId !== "string" || !/^[0-9a-f-]{36}$/i.test(equipmentId)) {
    return { ok: false, message: "Mã máy không hợp lệ." };
  }

  const [item] = await db.select({ id: equipment.id, ownerGroupId: equipment.ownerGroupId })
    .from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
  if (!item) return { ok: false, message: "Không tìm thấy máy." };

  const [loanRows, transferRows] = await Promise.all([
    db.select({ borrowerGroupId: machineLoans.borrowerGroupId, status: machineLoans.status })
      .from(machineLoans)
      .where(and(eq(machineLoans.equipmentId, equipmentId), inArray(machineLoans.status, [...OPEN_MACHINE_LOAN_STATUSES]))),
    db.select({ sourceGroupId: transfers.sourceGroupId, targetGroupId: transfers.targetGroupId })
      .from(transfers)
      .where(and(eq(transfers.equipmentId, equipmentId), notInArray(transfers.status, [...CLOSED_TRANSFER_STATUSES]))),
  ]);

  const allowed = canViewEquipmentHistory({
    wholeWorkshop: canViewWholeWorkshop(auth),
    groupIds: auth.permissions.map((permission) => permission.groupId),
    ownerGroupId: item.ownerGroupId,
    heldByBorrowerGroupIds: loanRows.filter((loan) => isHeldByBorrower(loan.status)).map((loan) => loan.borrowerGroupId),
    transferGroupIds: transferRows.flatMap((transfer) => [transfer.sourceGroupId, transfer.targetGroupId]),
  });
  if (!allowed) return { ok: false, message: "Bạn không có quyền xem lịch sử của máy này." };

  const rows = await db.select({
    id: activityLogs.id,
    action: activityLogs.action,
    description: activityLogs.description,
    beforeData: activityLogs.beforeData,
    afterData: activityLogs.afterData,
    reason: activityLogs.reason,
    createdAt: activityLogs.createdAt,
    actorName: users.fullName,
    actorGroupName: groups.name,
    actorRole: activityLogs.actorRole,
  }).from(activityLogs)
    .leftJoin(users, eq(activityLogs.actorUserId, users.id))
    .leftJoin(groups, eq(activityLogs.actorGroupId, groups.id))
    .where(eq(activityLogs.entityId, equipmentId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(HISTORY_LIMIT);

  return {
    ok: true,
    rows: rows.map((row) => ({ ...row, equipmentId, createdAt: row.createdAt.toISOString() })),
  };
}
