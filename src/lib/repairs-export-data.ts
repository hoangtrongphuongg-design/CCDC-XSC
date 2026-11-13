/** Đọc phiếu sửa chữa để xuất Excel (chỉ chạy ở server). Mới nhất trước; vượt trần thì báo `truncated`. */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { activityLogs, equipment, groups, repairs, users } from "@/lib/db/schema";
import { MAX_REPAIR_EXPORT_ROWS, type RawRepairExportRow } from "@/lib/repairs-export";

export async function loadRepairsForExport(range: { fromAt: Date | null; toAt: Date | null }): Promise<{ rows: RawRepairExportRow[]; truncated: boolean }> {
  const ownerGroup = alias(groups, "owner_group");
  const reportedGroup = alias(groups, "reported_group");
  const reporter = alias(users, "reporter");
  const receiver = alias(users, "receiver");
  const completer = alias(users, "completer");

  const conditions = [
    ...(range.fromAt ? [gte(repairs.createdAt, range.fromAt)] : []),
    ...(range.toAt ? [lte(repairs.createdAt, range.toAt)] : []),
  ];

  const [fetched, externalLogs] = await Promise.all([
    db.select({
      id: repairs.id,
      code: repairs.code,
      status: repairs.status,
      repairType: repairs.repairType,
      vendor: repairs.vendor,
      issueDescription: repairs.issueDescription,
      workDescription: repairs.workDescription,
      resultNotes: repairs.resultNotes,
      cost: repairs.cost,
      createdAt: repairs.createdAt,
      receivedAt: repairs.receivedAt,
      completedAt: repairs.completedAt,
      ownerConfirmedAt: repairs.ownerConfirmedAt,
      equipmentCode: equipment.code,
      equipmentLegacyCode: equipment.legacyCode,
      equipmentName: equipment.name,
      ownerGroupName: ownerGroup.name,
      reportedGroupName: reportedGroup.name,
      reportedByName: reporter.fullName,
      receivedByName: receiver.fullName,
      completedByName: completer.fullName,
    }).from(repairs)
      .innerJoin(equipment, eq(equipment.id, repairs.equipmentId))
      .innerJoin(ownerGroup, eq(ownerGroup.id, equipment.ownerGroupId))
      .innerJoin(reportedGroup, eq(reportedGroup.id, repairs.reportedByGroupId))
      .innerJoin(reporter, eq(reporter.id, repairs.reportedBy))
      .leftJoin(receiver, eq(receiver.id, repairs.receivedBy))
      .leftJoin(completer, eq(completer.id, repairs.completedBy))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(repairs.createdAt))
      .limit(MAX_REPAIR_EXPORT_ROWS + 1),
    // Phiếu không lưu ngày gửi thuê ngoài: lấy lần ghi nhật ký `repair.external` sớm nhất của từng phiếu.
    db.select({ entityId: activityLogs.entityId, firstAt: sql<string | Date>`min(${activityLogs.createdAt})` })
      .from(activityLogs)
      .where(eq(activityLogs.action, "repair.external"))
      .groupBy(activityLogs.entityId),
  ]);

  const externalAt = new Map(externalLogs.flatMap((log) => (log.entityId ? [[log.entityId, new Date(log.firstAt)] as const] : [])));
  const truncated = fetched.length > MAX_REPAIR_EXPORT_ROWS;
  const rows = (truncated ? fetched.slice(0, MAX_REPAIR_EXPORT_ROWS) : fetched).map(({ id, ...row }) => ({
    ...row,
    externalSentAt: row.repairType === "external" ? externalAt.get(id) ?? null : null,
  }));
  return { rows, truncated };
}
