/**
 * File Excel báo cáo điều hành: Quá hạn trả, Chi phí sửa chữa (theo tháng + theo nhóm), Máy nằm không.
 * Chi phí ghi dạng số (định dạng tiền) để người dùng cộng/lọc tiếp trong Excel.
 */
import { addDataRow, addHeading, finishSheet, newWorkbook, startSheet, toBytes } from "@/lib/export/workbook-kit";
import { vnDateTime } from "@/lib/export/equipment-export";
import { IDLE_DAYS, dmy } from "@/lib/reports";
import type { OperationsReport } from "@/lib/reports-data";

const MONEY_FORMAT = '#,##0" đ"';

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${m}/${year}`;
}

export async function buildReportWorkbook(input: { generatedAt: Date; exportedBy: string; report: OperationsReport }): Promise<Uint8Array> {
  const { report } = input;
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const meta = `Ngày xuất: ${vnDateTime(input.generatedAt)} · Người xuất: ${input.exportedBy}`;

  // --- Quá hạn trả ---
  const overdue = startSheet(workbook, used, "Quá hạn trả", "PHIẾU QUÁ HẠN TRẢ", `${meta} · Tính đến ${dmy(report.today)} · Tổng: ${report.overdue.length} phiếu`, [
    { header: "STT", width: 6 },
    { header: "Loại", width: 12 },
    { header: "Mã phiếu", width: 16 },
    { header: "Máy / CCDC", width: 40 },
    { header: "Nhóm mượn", width: 28 },
    { header: "Nhóm cho mượn", width: 28 },
    { header: "Hạn trả", width: 13 },
    { header: "Số ngày trễ", width: 12 },
  ]);
  report.overdue.forEach((row, index) => addDataRow(overdue, [index + 1, row.kind, row.code, row.label, row.borrowerGroup, row.ownerGroup, dmy(row.dueDate), row.daysLate]));
  finishSheet(overdue);

  // --- Chi phí sửa chữa ---
  const totalCost = report.repairByMonth.reduce((sum, row) => sum + row.total, 0);
  const totalTickets = report.repairByMonth.reduce((sum, row) => sum + row.count, 0);
  const repair = startSheet(workbook, used, "Chi phí sửa chữa", "CHI PHÍ SỬA CHỮA 12 THÁNG GẦN NHẤT", `${meta} · Tính theo ngày hoàn tất phiếu sửa · ${totalTickets} phiếu`, [
    { header: "STT", width: 6 },
    { header: "Tháng / Nhóm", width: 44 },
    { header: "Số phiếu hoàn tất", width: 18 },
    { header: "Chi phí", width: 20 },
  ]);
  addHeading(repair, "Theo tháng", "group");
  report.repairByMonth.forEach((row, index) => {
    const excelRow = addDataRow(repair, [index + 1, monthLabel(row.month), row.count, row.total]);
    excelRow.getCell(4).numFmt = MONEY_FORMAT;
  });
  const monthTotal = addDataRow(repair, ["", "Tổng", totalTickets, totalCost]);
  monthTotal.font = { bold: true };
  monthTotal.getCell(4).numFmt = MONEY_FORMAT;
  addHeading(repair, "Theo nhóm quản lý máy", "group");
  report.repairByGroup.forEach((row, index) => {
    const excelRow = addDataRow(repair, [index + 1, row.name, row.count, row.total]);
    excelRow.getCell(4).numFmt = MONEY_FORMAT;
  });
  finishSheet(repair);

  // --- Máy nằm không ---
  const idle = startSheet(workbook, used, "Máy nằm không", `MÁY NẰM KHÔNG TRÊN ${IDLE_DAYS} NGÀY`, `${meta} · Máy Sẵn sàng, không có phiếu mượn trong ${IDLE_DAYS} ngày · Tổng: ${report.idle.total} máy${report.idle.total > report.idle.rows.length ? ` (liệt kê ${report.idle.rows.length} máy lâu nhất)` : ""}`, [
    { header: "STT", width: 6 },
    { header: "Mã hệ thống", width: 16 },
    { header: "Tên CCDC", width: 40 },
    { header: "Nhóm quản lý", width: 28 },
    { header: "Tính từ", width: 13 },
    { header: "Số ngày nằm không", width: 18 },
    { header: "Ghi chú", width: 24 },
  ]);
  report.idle.rows.forEach((row, index) => addDataRow(idle, [index + 1, row.code, row.name, row.group, dmy(row.since), row.idleDays, row.neverBorrowed ? "Chưa từng cho mượn" : ""]));
  finishSheet(idle);

  return toBytes(await workbook.xlsx.writeBuffer());
}
