/**
 * File Excel toàn bộ phiếu sửa chữa: sheet "Phiếu sửa chữa" (mỗi phiếu một dòng, ngày là ngày thật, chi phí là số,
 * để trống nếu chưa nhập) + sheet "Tổng hợp" (theo trạng thái, hình thức, tháng báo hỏng, nhóm quản lý máy).
 */
import { toVnWallClock } from "@/lib/activity-log";
import { vnDateTime } from "@/lib/export/equipment-export";
import { addDataRow, finishSheet, newWorkbook, startSheet, toBytes } from "@/lib/export/workbook-kit";
import { monthLabel, summarizeRepairs, type RepairExportRow, type SummaryLine } from "@/lib/repairs-export";

const MONEY_FORMAT = '#,##0" đ"';
const DATE_FORMAT = "dd/mm/yyyy";

/** Cột ngày: ô trống nếu chưa có, ngược lại là ngày thật theo giờ VN. */
function dateCell(date: Date | null): Date | "" {
  return date ? toVnWallClock(date) : "";
}

function rangeText(range: { from: string | null; to: string | null }): string {
  if (!range.from && !range.to) return "Toàn bộ phiếu";
  const dmy = (iso: string) => iso.split("-").reverse().join("/");
  return `Ngày báo hỏng: ${range.from ? dmy(range.from) : "đầu"} – ${range.to ? dmy(range.to) : "nay"}`;
}

export async function buildRepairWorkbook(input: {
  generatedAt: Date;
  exportedBy: string;
  range: { from: string | null; to: string | null };
  rows: RepairExportRow[];
  truncated: boolean;
}): Promise<Uint8Array> {
  const { rows } = input;
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const meta = `Ngày xuất: ${vnDateTime(input.generatedAt)} · Người xuất: ${input.exportedBy} · ${rangeText(input.range)} · Tổng: ${rows.length} phiếu`;
  const truncatedNote = input.truncated ? " · Đã cắt bớt phần cũ nhất do quá nhiều dòng, hãy chọn khoảng ngày ngắn hơn" : "";

  // --- Sheet 1: từng phiếu ---
  const sheet = startSheet(workbook, used, "Phiếu sửa chữa", "PHIẾU SỬA CHỮA", `${meta}${truncatedNote}`, [
    { header: "STT", width: 6 },
    { header: "Mã phiếu", width: 16 },
    { header: "Mã hệ thống", width: 14 },
    { header: "Tem nhôm", width: 12 },
    { header: "Tên máy", width: 30 },
    { header: "Nhóm quản lý máy", width: 26 },
    { header: "Nhóm báo hỏng", width: 26 },
    { header: "Người báo", width: 20 },
    { header: "Hiện tượng hỏng", width: 36 },
    { header: "Ngày báo hỏng", width: 14 },
    { header: "Ngày tiếp nhận", width: 14 },
    { header: "Hình thức", width: 14 },
    { header: "Đơn vị sửa ngoài", width: 24 },
    { header: "Ngày gửi thuê ngoài", width: 14 },
    { header: "Ngày nhận về / hoàn tất", width: 15 },
    { header: "Ngày nhóm nhận lại", width: 14 },
    { header: "Nội dung sửa", width: 30 },
    { header: "Kết quả", width: 26 },
    { header: "Chi phí", width: 16 },
    { header: "Trạng thái", width: 20 },
    { header: "Người tiếp nhận", width: 20 },
    { header: "Người hoàn tất", width: 20 },
    { header: "Ngày chờ tiếp nhận", width: 12 },
    { header: "Ngày sửa", width: 10 },
    { header: "Tổng số ngày", width: 12 },
  ]);
  const DATE_COLUMNS = [10, 11, 14, 15, 16];
  rows.forEach((row, index) => {
    const excelRow = addDataRow(sheet, [
      index + 1, row.code, row.equipmentCode, row.equipmentLegacyCode || "", row.equipmentName, row.ownerGroupName,
      row.reportedGroupName, row.reportedByName, row.issueDescription,
      dateCell(row.createdAt), dateCell(row.receivedAt), row.kind, row.vendor || "",
      dateCell(row.externalSentAt), dateCell(row.completedAt), dateCell(row.ownerConfirmedAt),
      row.workDescription || "", row.resultNotes || "", row.costValue ?? "", row.statusLabel,
      row.receivedByName || "", row.completedByName || "",
      row.waitDays ?? "", row.repairDays ?? "", row.totalDays ?? "",
    ] as Array<string | number>);
    for (const column of DATE_COLUMNS) {
      const cell = excelRow.getCell(column);
      cell.numFmt = DATE_FORMAT;
      cell.alignment = { vertical: "top", horizontal: "center" };
    }
    excelRow.getCell(19).numFmt = MONEY_FORMAT;
    for (const column of [23, 24, 25]) excelRow.getCell(column).alignment = { vertical: "top", horizontal: "right" };
  });
  finishSheet(sheet);

  // Dòng tổng thêm SAU khi đặt bộ lọc để bộ lọc không gồm dòng này.
  const total = rows.reduce((sum, row) => sum + (row.costValue ?? 0), 0);
  const totalRow = sheet.ws.addRow([]);
  totalRow.getCell(18).value = "Tổng chi phí (các phiếu đã nhập)";
  totalRow.getCell(18).alignment = { horizontal: "right" };
  totalRow.getCell(19).value = total;
  totalRow.getCell(19).numFmt = MONEY_FORMAT;
  totalRow.font = { bold: true };

  // --- Sheet 2: tổng hợp ---
  const summary = summarizeRepairs(rows);
  const tab = startSheet(workbook, used, "Tổng hợp", "TỔNG HỢP PHIẾU SỬA CHỮA", meta, [
    { header: "Nhóm số liệu", width: 26 },
    { header: "Mục", width: 40 },
    { header: "Số phiếu", width: 12 },
    { header: "Chi phí", width: 20 },
  ]);
  const addGroup = (title: string, lines: SummaryLine[], labelOf: (label: string) => string = (label) => label) => {
    lines.forEach((line, index) => {
      const excelRow = addDataRow(tab, [index === 0 ? title : "", labelOf(line.label), line.count, line.cost > 0 ? line.cost : ""] as Array<string | number>);
      excelRow.getCell(1).alignment = { vertical: "top", horizontal: "left" };
      excelRow.getCell(3).alignment = { vertical: "top", horizontal: "right" };
      excelRow.getCell(4).numFmt = MONEY_FORMAT;
    });
  };
  addGroup("Theo trạng thái", summary.byStatus);
  addGroup("Theo hình thức", summary.byKind);
  addGroup("Theo tháng báo hỏng", summary.byMonth, monthLabel);
  addGroup("Theo nhóm quản lý máy", summary.byGroup);
  const grand = addDataRow(tab, ["Tổng", "", summary.total.count, summary.total.cost] as Array<string | number>);
  grand.font = { bold: true };
  grand.getCell(1).alignment = { vertical: "top", horizontal: "left" };
  grand.getCell(3).alignment = { vertical: "top", horizontal: "right" };
  grand.getCell(4).numFmt = MONEY_FORMAT;
  finishSheet(tab);

  return toBytes(await workbook.xlsx.writeBuffer());
}
