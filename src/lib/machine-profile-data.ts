import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLogs, disposals, equipment, groups, machineLoans, repairs, transfers, users } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import { canViewWholeWorkshop } from "@/lib/auth/roles";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { HISTORY_LIMIT, canViewEquipmentHistory } from "@/lib/equipment-history";
import { OPEN_MACHINE_LOAN_STATUSES } from "@/lib/loan-status";
import { canSeeFinancials, heldByGroupId, isInMyScope, isUuid } from "@/lib/machine-profile";
import { CLOSED_TRANSFER_STATUSES, OPEN_DISPOSAL_STATUSES, OPEN_REPAIR_STATUSES } from "@/lib/workflow-status";

export type ProfileTicket = { key: string; kind: string; code: string; statusLabel: string; groups: string; updatedAt: Date; href: string };
export type ProfileHistoryRow = { id: string; createdAt: Date; actor: string | null; description: string; reason: string | null };

export type MachineProfile = {
  machine: typeof equipment.$inferSelect;
  groupNames: ReadonlyMap<string, string>;
  heldByGroupName: string | null;
  tickets: ProfileTicket[];
  /** null = tài khoản không có quyền xem lịch sử máy này. */
  history: ProfileHistoryRow[] | null;
  showFinancials: boolean;
  inMyScope: boolean;
};

const statusLabel = (status: string) => (WORKFLOW_LABELS as Record<string, string>)[status] ?? status;

/** Hồ sơ một máy cho trang `/equipment/[id]` (ai đăng nhập cũng xem được phần thông tin; lịch sử theo quyền). */
export async function loadMachineProfile(auth: AuthContext, id: string): Promise<MachineProfile | null> {
  if (!isUuid(id)) return null;
  const [machine] = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
  if (!machine) return null;

  const [groupRows, loanRows, transferRows, repairRows, disposalRows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups),
    db.select().from(machineLoans).where(and(eq(machineLoans.equipmentId, id), inArray(machineLoans.status, [...OPEN_MACHINE_LOAN_STATUSES]))),
    db.select().from(transfers).where(and(eq(transfers.equipmentId, id), notInArray(transfers.status, [...CLOSED_TRANSFER_STATUSES]))),
    db.select().from(repairs).where(and(eq(repairs.equipmentId, id), inArray(repairs.status, [...OPEN_REPAIR_STATUSES]))),
    db.select().from(disposals).where(and(eq(disposals.equipmentId, id), inArray(disposals.status, [...OPEN_DISPOSAL_STATUSES]))),
  ]);
  const groupNames = new Map(groupRows.map((g) => [g.id, g.name]));
  const name = (gid: string) => groupNames.get(gid) ?? "—";
  const groupIds = auth.permissions.map((p) => p.groupId);
  const heldBy = heldByGroupId(loanRows);

  const tickets: ProfileTicket[] = [
    ...loanRows.map((r) => ({ key: `loan:${r.id}`, kind: "Mượn máy", code: r.code, statusLabel: statusLabel(r.status), groups: `${name(r.borrowerGroupId)} mượn của ${name(r.ownerGroupId)}`, updatedAt: r.updatedAt, href: "/machine-loans" })),
    ...transferRows.map((r) => ({ key: `transfer:${r.id}`, kind: "Điều chuyển", code: r.code, statusLabel: statusLabel(r.status), groups: `${name(r.sourceGroupId)} → ${name(r.targetGroupId)}`, updatedAt: r.updatedAt, href: "/transfers" })),
    ...repairRows.map((r) => ({ key: `repair:${r.id}`, kind: "Sửa chữa", code: r.code, statusLabel: statusLabel(r.status), groups: `Báo bởi ${name(r.reportedByGroupId)}`, updatedAt: r.updatedAt, href: "/repairs" })),
    ...disposalRows.map((r) => ({ key: `disposal:${r.id}`, kind: "Thanh lý", code: r.code, statusLabel: statusLabel(r.status), groups: `Nhóm quản lý: ${name(r.ownerGroupId)}`, updatedAt: r.updatedAt, href: "/disposals" })),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const allowedHistory = canViewEquipmentHistory({
    wholeWorkshop: canViewWholeWorkshop(auth),
    groupIds,
    ownerGroupId: machine.ownerGroupId,
    heldByBorrowerGroupIds: heldBy ? [heldBy] : [],
    transferGroupIds: transferRows.flatMap((t) => [t.sourceGroupId, t.targetGroupId]),
  });

  let history: ProfileHistoryRow[] | null = null;
  if (allowedHistory) {
    history = await db.select({
      id: activityLogs.id,
      createdAt: activityLogs.createdAt,
      actor: users.fullName,
      description: activityLogs.description,
      reason: activityLogs.reason,
    }).from(activityLogs)
      .leftJoin(users, eq(activityLogs.actorUserId, users.id))
      .where(eq(activityLogs.entityId, id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(HISTORY_LIMIT);
  }

  return {
    machine,
    groupNames,
    heldByGroupName: heldBy ? name(heldBy) : null,
    tickets,
    history,
    showFinancials: canSeeFinancials({ isWorkshopAdmin: auth.isWorkshopAdmin, isReadOnlyViewer: auth.isReadOnlyViewer, groupIds, ownerGroupId: machine.ownerGroupId }),
    inMyScope: isInMyScope({ isReadOnlyViewer: auth.isReadOnlyViewer, isWorkshopAdmin: auth.isWorkshopAdmin, groupIds, ownerGroupId: machine.ownerGroupId, heldByGroupId: heldBy }),
  };
}
