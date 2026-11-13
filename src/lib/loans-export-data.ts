/** Đọc phiếu mượn máy / mượn nhanh / điều chuyển để xuất Excel (chỉ chạy ở server). Mới nhất trước. */
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, quickLoans, toolCatalog, transfers, users } from "@/lib/db/schema";
import {
  MAX_LOAN_EXPORT_ROWS,
  type RawMachineLoanExportRow,
  type RawQuickLoanExportRow,
  type RawTransferExportRow,
} from "@/lib/loans-export";

type Range = { fromAt: Date | null; toAt: Date | null };

const between = (column: Parameters<typeof gte>[0], range: Range) => {
  const conditions = [...(range.fromAt ? [gte(column, range.fromAt)] : []), ...(range.toAt ? [lte(column, range.toAt)] : [])];
  return conditions.length ? and(...conditions) : undefined;
};

function cut<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  return rows.length > MAX_LOAN_EXPORT_ROWS ? { rows: rows.slice(0, MAX_LOAN_EXPORT_ROWS), truncated: true } : { rows, truncated: false };
}

export async function loadLoansForExport(range: Range): Promise<{ machine: RawMachineLoanExportRow[]; quick: RawQuickLoanExportRow[]; truncated: boolean }> {
  const ownerGroup = alias(groups, "owner_group");
  const borrowerGroup = alias(groups, "borrower_group");
  const requester = alias(users, "requester");
  const approver = alias(users, "approver");

  const [machineFetched, quickFetched] = await Promise.all([
    db.select({
      code: machineLoans.code, status: machineLoans.status, purpose: machineLoans.purpose, workLocation: machineLoans.workLocation,
      receiverName: machineLoans.receiverName, expectedReturnDate: machineLoans.expectedReturnDate,
      handoverCondition: machineLoans.handoverCondition, returnCondition: machineLoans.returnCondition,
      incidentNotes: machineLoans.incidentNotes, rejectionReason: machineLoans.rejectionReason,
      createdAt: machineLoans.createdAt, approvedAt: machineLoans.approvedAt, handedOverAt: machineLoans.handedOverAt,
      receivedAt: machineLoans.receivedAt, returnRequestedAt: machineLoans.returnRequestedAt, closedAt: machineLoans.closedAt,
      equipmentCode: equipment.code, equipmentLegacyCode: equipment.legacyCode, equipmentName: equipment.name,
      ownerGroupName: ownerGroup.name, borrowerGroupName: borrowerGroup.name,
      requestedByName: requester.fullName, approvedByName: approver.fullName,
    }).from(machineLoans)
      .innerJoin(equipment, eq(equipment.id, machineLoans.equipmentId))
      .innerJoin(ownerGroup, eq(ownerGroup.id, machineLoans.ownerGroupId))
      .innerJoin(borrowerGroup, eq(borrowerGroup.id, machineLoans.borrowerGroupId))
      .innerJoin(requester, eq(requester.id, machineLoans.requestedBy))
      .leftJoin(approver, eq(approver.id, machineLoans.approvedBy))
      .where(between(machineLoans.createdAt, range))
      .orderBy(desc(machineLoans.createdAt))
      .limit(MAX_LOAN_EXPORT_ROWS + 1),
    db.select({
      code: quickLoans.code, status: quickLoans.status, itemName: quickLoans.itemName, specification: quickLoans.specification,
      unit: quickLoans.unit, toolCode: toolCatalog.code,
      quantityBorrowed: quickLoans.quantityBorrowed, returnedGood: quickLoans.returnedGood,
      returnedDamaged: quickLoans.returnedDamaged, lostQuantity: quickLoans.lostQuantity,
      lenderNote: quickLoans.lenderNote, borrowerNote: quickLoans.borrowerNote, returnNote: quickLoans.returnNote,
      createdAt: quickLoans.createdAt, approvedAt: quickLoans.approvedAt, receivedAt: quickLoans.receivedAt,
      expectedReturnAt: quickLoans.expectedReturnAt, returnReportedAt: quickLoans.returnReportedAt, closedAt: quickLoans.closedAt,
      sourceGroupName: ownerGroup.name, borrowerGroupName: borrowerGroup.name,
      requestedByName: requester.fullName, approvedByName: approver.fullName,
    }).from(quickLoans)
      .innerJoin(ownerGroup, eq(ownerGroup.id, quickLoans.sourceGroupId))
      .innerJoin(borrowerGroup, eq(borrowerGroup.id, quickLoans.borrowerGroupId))
      .innerJoin(requester, eq(requester.id, quickLoans.requestedBy))
      .leftJoin(approver, eq(approver.id, quickLoans.approvedBy))
      .leftJoin(toolCatalog, eq(toolCatalog.id, quickLoans.toolId))
      .where(between(quickLoans.createdAt, range))
      .orderBy(desc(quickLoans.createdAt))
      .limit(MAX_LOAN_EXPORT_ROWS + 1),
  ]);

  const machine = cut(machineFetched);
  const quick = cut(quickFetched);
  return { machine: machine.rows, quick: quick.rows, truncated: machine.truncated || quick.truncated };
}

export async function loadTransfersForExport(range: Range): Promise<{ rows: RawTransferExportRow[]; truncated: boolean }> {
  const sourceGroup = alias(groups, "source_group");
  const targetGroup = alias(groups, "target_group");
  const proposerGroup = alias(groups, "proposer_group");
  const proposer = alias(users, "proposer");

  const fetched = await db.select({
    code: transfers.code, status: transfers.status, reason: transfers.reason,
    handoverCondition: transfers.handoverCondition, rejectionReason: transfers.rejectionReason,
    createdAt: transfers.createdAt, counterpartAcceptedAt: transfers.counterpartAcceptedAt, wsApprovedAt: transfers.wsApprovedAt,
    handedOverAt: transfers.handedOverAt, receivedAt: transfers.receivedAt,
    equipmentCode: equipment.code, equipmentLegacyCode: equipment.legacyCode, equipmentName: equipment.name,
    sourceGroupName: sourceGroup.name, targetGroupName: targetGroup.name, proposedByGroupName: proposerGroup.name,
    proposedByName: proposer.fullName,
  }).from(transfers)
    .innerJoin(equipment, eq(equipment.id, transfers.equipmentId))
    .innerJoin(sourceGroup, eq(sourceGroup.id, transfers.sourceGroupId))
    .innerJoin(targetGroup, eq(targetGroup.id, transfers.targetGroupId))
    .innerJoin(proposerGroup, eq(proposerGroup.id, transfers.proposedByGroupId))
    .innerJoin(proposer, eq(proposer.id, transfers.proposedBy))
    .where(between(transfers.createdAt, range))
    .orderBy(desc(transfers.createdAt))
    .limit(MAX_LOAN_EXPORT_ROWS + 1);
  return cut(fetched);
}
