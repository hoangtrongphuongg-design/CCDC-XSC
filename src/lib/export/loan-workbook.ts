/**
 * File Excel Mượn – Trả (sheet "Mượn máy", "Mượn nhanh", "Tổng hợp") và Điều chuyển (sheet "Điều chuyển", "Tổng hợp").
 * Ngày là ngày thật theo giờ VN, số lượng là số, ô chưa có dữ liệu để trống.
 */
import { toVnWallClock } from "@/lib/activity-log";
import { vnDateTime } from "@/lib/export/equipment-export";
import { addDataRow, finishSheet, newWorkbook, startSheet, toBytes, type SheetContext } from "@/lib/export/workbook-kit";
import {
  summarizeLoans,
  summarizeTransfers,
  type MachineLoanExportRow,
  type QuickLoanExportRow,
  type SummarySection,
  type TransferExportRow,
} from "@/lib/loans-export";
import type ExcelJS from "exceljs";

const DATE_FORMAT = "dd/mm/yyyy";

function dateCell(date: Date | null): Date | "" {
  return date ? toVnWallClock(date) : "";
}

const dmy = (iso: string) => iso.split("-").reverse().join("/");

function rangeText(range: { from: string | null; to: string | null }): string {
  if (!range.from && !range.to) return "Toàn bộ phiếu";
  return `Ngày đề nghị: ${range.from ? dmy(range.from) : "đầu"} – ${range.to ? dmy(range.to) : "nay"}`;
}

function metaLine(input: { generatedAt: Date; exportedBy: string; range: { from: string | null; to: string | null } }): string {
  return `Ngày xuất: ${vnDateTime(input.generatedAt)} · Người xuất: ${input.exportedBy} · ${rangeText(input.range)}`;
}

/** Định dạng ngày + canh giữa cho các cột ngày; cột số canh phải. */
function styleRow(row: ExcelJS.Row, dateColumns: number[], numberColumns: number[] = []) {
  for (const column of dateColumns) {
    const cell = row.getCell(column);
    cell.numFmt = DATE_FORMAT;
    cell.alignment = { vertical: "top", horizontal: "center" };
  }
  for (const column of numberColumns) row.getCell(column).alignment = { vertical: "top", horizontal: "right" };
}

function addSummarySheet(workbook: ExcelJS.Workbook, used: Set<string>, meta: string, sections: SummarySection[]) {
  const tab = startSheet(workbook, used, "Tổng hợp", "TỔNG HỢP", meta, [
    { header: "Nhóm số liệu", width: 44 },
    { header: "Mục", width: 40 },
    { header: "Số phiếu", width: 12 },
  ]);
  for (const section of sections) {
    section.lines.forEach((line, index) => {
      const row = addDataRow(tab, [index === 0 ? section.title : "", line.label, line.count]);
      row.getCell(1).alignment = { vertical: "top", horizontal: "left" };
      row.getCell(3).alignment = { vertical: "top", horizontal: "right" };
    });
  }
  finishSheet(tab);
}

function truncatedNote(truncated: boolean): string {
  return truncated ? " · Đã cắt bớt phần cũ nhất do quá nhiều dòng, hãy chọn khoảng ngày ngắn hơn" : "";
}

function machineSheet(workbook: ExcelJS.Workbook, used: Set<string>, meta: string, rows: MachineLoanExportRow[], note: string): SheetContext {
  const sheet = startSheet(workbook, used, "Mượn máy", "PHIẾU MƯỢN MÁY (MÁY CÓ MÃ)", `${meta} · Tổng: ${rows.length} phiếu${note}`, [
    { header: "STT", width: 6 }, { header: "Mã phiếu", width: 16 }, { header: "Mã hệ thống", width: 14 }, { header: "Tem nhôm", width: 12 },
    { header: "Tên máy", width: 30 }, { header: "Nhóm cho mượn", width: 26 }, { header: "Nhóm mượn", width: 26 },
    { header: "Người đề nghị", width: 20 }, { header: "Mục đích", width: 30 }, { header: "Nơi làm việc", width: 22 }, { header: "Người nhận máy", width: 20 },
    { header: "Ngày đề nghị", width: 13 }, { header: "Ngày duyệt", width: 13 }, { header: "Ngày bàn giao", width: 13 }, { header: "Ngày nhận", width: 13 },
    { header: "Hạn trả", width: 13 }, { header: "Ngày báo trả", width: 13 }, { header: "Ngày hoàn tất", width: 13 },
    { header: "Trạng thái", width: 20 }, { header: "Số ngày trễ", width: 11 }, { header: "Người duyệt", width: 20 },
    { header: "Tình trạng khi bàn giao", width: 26 }, { header: "Tình trạng khi trả", width: 26 }, { header: "Sự cố", width: 26 }, { header: "Lý do từ chối", width: 26 },
  ]);
  rows.forEach((row, index) => {
    const excel = addDataRow(sheet, [
      index + 1, row.code, row.equipmentCode, row.equipmentLegacyCode || "", row.equipmentName, row.ownerGroupName, row.borrowerGroupName,
      row.requestedByName, row.purpose, row.workLocation || "", row.receiverName || "",
      dateCell(row.createdAt), dateCell(row.approvedAt), dateCell(row.handedOverAt), dateCell(row.receivedAt),
      row.expectedReturnDate ? toVnWallClock(new Date(`${row.expectedReturnDate}T00:00:00+07:00`)) : "", dateCell(row.returnRequestedAt), dateCell(row.closedAt),
      row.statusLabel, row.late ?? "", row.approvedByName || "",
      row.handoverCondition || "", row.returnCondition || "", row.incidentNotes || "", row.rejectionReason || "",
    ] as Array<string | number>);
    styleRow(excel, [12, 13, 14, 15, 16, 17, 18], [20]);
  });
  finishSheet(sheet);
  return sheet;
}

function quickSheet(workbook: ExcelJS.Workbook, used: Set<string>, meta: string, rows: QuickLoanExportRow[], note: string): SheetContext {
  const sheet = startSheet(workbook, used, "Mượn nhanh", "PHIẾU MƯỢN NHANH (CCDC LẶT VẶT)", `${meta} · Tổng: ${rows.length} phiếu${note}`, [
    { header: "STT", width: 6 }, { header: "Mã phiếu", width: 16 }, { header: "Mã CCDC", width: 16 }, { header: "Tên dụng cụ", width: 30 },
    { header: "Quy cách", width: 18 }, { header: "ĐVT", width: 8 },
    { header: "SL mượn", width: 10 }, { header: "SL trả tốt", width: 10 }, { header: "SL trả hư", width: 10 }, { header: "SL mất", width: 10 },
    { header: "Nhóm cho mượn", width: 26 }, { header: "Nhóm mượn", width: 26 }, { header: "Người đề nghị", width: 20 },
    { header: "Ngày đề nghị", width: 13 }, { header: "Ngày duyệt", width: 13 }, { header: "Ngày nhận", width: 13 },
    { header: "Hạn trả", width: 13 }, { header: "Ngày báo trả", width: 13 }, { header: "Ngày hoàn tất", width: 13 },
    { header: "Trạng thái", width: 20 }, { header: "Số ngày trễ", width: 11 }, { header: "Người duyệt", width: 20 },
    { header: "Ghi chú bên cho mượn", width: 26 }, { header: "Ghi chú bên mượn", width: 26 }, { header: "Ghi chú khi trả", width: 26 },
  ]);
  rows.forEach((row, index) => {
    const excel = addDataRow(sheet, [
      index + 1, row.code, row.toolCode || "", row.itemName, row.specification || "", row.unit,
      row.qtyBorrowed, row.qtyGood, row.qtyDamaged, row.qtyLost,
      row.sourceGroupName, row.borrowerGroupName, row.requestedByName,
      dateCell(row.createdAt), dateCell(row.approvedAt), dateCell(row.receivedAt), dateCell(row.expectedReturnAt), dateCell(row.returnReportedAt), dateCell(row.closedAt),
      row.statusLabel, row.late ?? "", row.approvedByName || "",
      row.lenderNote || "", row.borrowerNote || "", row.returnNote || "",
    ] as Array<string | number>);
    styleRow(excel, [14, 15, 16, 17, 18, 19], [7, 8, 9, 10, 21]);
  });
  finishSheet(sheet);
  return sheet;
}

export async function buildLoanWorkbook(input: {
  generatedAt: Date;
  exportedBy: string;
  range: { from: string | null; to: string | null };
  machine: MachineLoanExportRow[];
  quick: QuickLoanExportRow[];
  truncated: boolean;
}): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const meta = metaLine(input);
  const note = truncatedNote(input.truncated);
  machineSheet(workbook, used, meta, input.machine, note);
  quickSheet(workbook, used, meta, input.quick, note);
  addSummarySheet(workbook, used, `${meta} · Mượn máy: ${input.machine.length} · Mượn nhanh: ${input.quick.length}`, summarizeLoans(input.machine, input.quick));
  return toBytes(await workbook.xlsx.writeBuffer());
}

export async function buildTransferWorkbook(input: {
  generatedAt: Date;
  exportedBy: string;
  range: { from: string | null; to: string | null };
  rows: TransferExportRow[];
  truncated: boolean;
}): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const meta = metaLine(input);
  const sheet = startSheet(workbook, used, "Điều chuyển", "PHIẾU ĐIỀU CHUYỂN", `${meta} · Tổng: ${input.rows.length} phiếu${truncatedNote(input.truncated)}`, [
    { header: "STT", width: 6 }, { header: "Mã phiếu", width: 16 }, { header: "Mã hệ thống", width: 14 }, { header: "Tem nhôm", width: 12 },
    { header: "Tên máy", width: 30 }, { header: "Nhóm giao", width: 26 }, { header: "Nhóm nhận", width: 26 },
    { header: "Nhóm đề xuất", width: 26 }, { header: "Người đề xuất", width: 20 }, { header: "Lý do điều chuyển", width: 34 },
    { header: "Ngày đề xuất", width: 13 }, { header: "Ngày nhóm đối tác đồng ý", width: 15 }, { header: "Ngày Quản lý Xưởng duyệt", width: 15 },
    { header: "Ngày bàn giao", width: 13 }, { header: "Ngày nhận máy", width: 13 },
    { header: "Trạng thái", width: 22 }, { header: "Tổng số ngày", width: 11 },
    { header: "Tình trạng khi bàn giao", width: 26 }, { header: "Lý do từ chối", width: 26 },
  ]);
  input.rows.forEach((row, index) => {
    const excel = addDataRow(sheet, [
      index + 1, row.code, row.equipmentCode, row.equipmentLegacyCode || "", row.equipmentName, row.sourceGroupName, row.targetGroupName,
      row.proposedByGroupName, row.proposedByName, row.reason,
      dateCell(row.createdAt), dateCell(row.counterpartAcceptedAt), dateCell(row.wsApprovedAt), dateCell(row.handedOverAt), dateCell(row.receivedAt),
      row.statusLabel, row.totalDays ?? "", row.handoverCondition || "", row.rejectionReason || "",
    ] as Array<string | number>);
    styleRow(excel, [11, 12, 13, 14, 15], [17]);
  });
  finishSheet(sheet);
  addSummarySheet(workbook, used, `${meta} · Tổng: ${input.rows.length} phiếu`, summarizeTransfers(input.rows));
  return toBytes(await workbook.xlsx.writeBuffer());
}
