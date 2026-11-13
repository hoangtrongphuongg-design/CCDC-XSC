import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildRepairWorkbook } from "../src/lib/export/repair-workbook";
import {
  buildRepairRows,
  daysBetween,
  parseRepairRange,
  repairExportFileName,
  repairKind,
  summarizeRepairs,
  type RawRepairExportRow,
} from "../src/lib/repairs-export";

const base: RawRepairExportRow = {
  code: "SC-2026-0001", status: "completed", repairType: "internal", vendor: null, issueDescription: "Không chạy",
  workDescription: null, resultNotes: null, cost: "0", createdAt: new Date("2026-11-03T03:00:00Z"), receivedAt: null,
  completedAt: null, ownerConfirmedAt: null, externalSentAt: null, equipmentCode: "WS-0001", equipmentLegacyCode: null,
  equipmentName: "Máy hàn", ownerGroupName: "Nhóm A", reportedGroupName: "Nhóm A", reportedByName: "An", receivedByName: null, completedByName: null,
};
const NOW = new Date("2026-11-13T05:00:00Z");

test("khoảng ngày: để trống = toàn bộ, ngày sai bị bỏ qua, đảo lại nếu from > to", () => {
  assert.deepEqual(parseRepairRange("", null), { from: null, to: null, fromAt: null, toAt: null });
  assert.equal(parseRepairRange("abc", "2026-02-31").from, null);
  const swapped = parseRepairRange("2026-11-10", "2026-11-01");
  assert.deepEqual([swapped.from, swapped.to], ["2026-11-01", "2026-11-10"]);
  assert.equal(swapped.fromAt?.toISOString(), "2026-10-31T17:00:00.000Z", "đầu ngày giờ VN");
  assert.equal(parseRepairRange(null, "2026-11-10").fromAt, null, "chỉ có đến ngày");
});

test("số ngày tính theo ngày giờ VN, không âm", () => {
  assert.equal(daysBetween(new Date("2026-11-03T16:59:00Z"), new Date("2026-11-03T17:01:00Z")), 1, "qua nửa đêm giờ VN");
  assert.equal(daysBetween(new Date("2026-11-03T03:00:00Z"), new Date("2026-11-03T10:00:00Z")), 0);
  assert.equal(daysBetween(new Date("2026-11-12T03:00:00Z"), new Date("2026-11-03T03:00:00Z")), 0, "không âm");
  assert.equal(daysBetween(new Date("2026-10-30T03:00:00Z"), new Date("2026-11-13T03:00:00Z")), 14);
});

test("hình thức, chi phí chỉ hiện khi đã nhập, số ngày theo từng giai đoạn", () => {
  assert.equal(repairKind({ repairType: null, receivedAt: null }), "Chưa tiếp nhận");
  assert.equal(repairKind({ repairType: "internal", receivedAt: new Date() }), "Nội bộ");
  assert.equal(repairKind({ repairType: "external", receivedAt: new Date() }), "Thuê ngoài");

  const rows = buildRepairRows([
    { ...base, status: "pending_acceptance", repairType: null }, // chưa tiếp nhận
    { ...base, code: "SC-2", status: "completed", repairType: "external", vendor: "Cty A", cost: "3500000",
      receivedAt: new Date("2026-11-04T03:00:00Z"), externalSentAt: new Date("2026-11-05T03:00:00Z"),
      completedAt: new Date("2026-11-12T03:00:00Z"), ownerConfirmedAt: new Date("2026-11-13T03:00:00Z") },
    { ...base, code: "SC-3", status: "irreparable", repairType: "external", cost: "800000",
      receivedAt: new Date("2026-11-04T03:00:00Z"), completedAt: new Date("2026-11-12T03:00:00Z") },
  ], NOW);

  assert.equal(rows[0].kind, "Chưa tiếp nhận");
  assert.equal(rows[0].statusLabel, "Chờ tiếp nhận");
  assert.equal(rows[0].costValue, null, "0 = chưa nhập → để trống");
  assert.equal(rows[0].waitDays, 10, "đang chờ: tính đến hôm nay");
  assert.equal(rows[0].repairDays, null);
  assert.equal(rows[0].totalDays, 10);

  assert.equal(rows[1].costValue, 3500000);
  assert.equal(rows[1].waitDays, 1);
  assert.equal(rows[1].repairDays, 8);
  assert.equal(rows[1].totalDays, 10, "đến ngày nhóm nhận lại");

  assert.equal(rows[2].totalDays, 9, "phiếu đã đóng không có ngày nhận lại: đến ngày hoàn tất");
});

test("tổng hợp theo trạng thái / hình thức / tháng / nhóm, chi phí chỉ cộng ô đã nhập", () => {
  const rows = buildRepairRows([
    { ...base, status: "completed", repairType: "internal", cost: "450000", receivedAt: base.createdAt, completedAt: base.createdAt },
    { ...base, code: "SC-2", status: "repairing", repairType: "external", cost: "0", receivedAt: base.createdAt, ownerGroupName: "Nhóm B" },
    { ...base, code: "SC-3", status: "pending_acceptance", repairType: null, createdAt: new Date("2026-10-20T03:00:00Z") },
  ], NOW);
  const summary = summarizeRepairs(rows);
  assert.deepEqual(summary.total, { count: 3, cost: 450000 });
  assert.deepEqual(summary.byStatus.map((line) => line.label), ["Chờ tiếp nhận", "Đang thuê ngoài sửa", "Đã hoàn thành"]);
  assert.deepEqual(summary.byKind.map((line) => [line.label, line.count]), [["Nội bộ", 1], ["Thuê ngoài", 1], ["Chưa tiếp nhận", 1]]);
  assert.deepEqual(summary.byMonth.map((line) => [line.label, line.count]), [["2026-10", 1], ["2026-11", 2]]);
  assert.deepEqual(summary.byGroup.map((line) => [line.label, line.count, line.cost]), [["Nhóm A", 2, 450000], ["Nhóm B", 1, 0]]);
});

test("tên file", () => {
  assert.equal(repairExportFileName({ from: null, to: null }, NOW), "phieu-sua-chua-2026-11-13.xlsx");
  assert.equal(repairExportFileName({ from: "2026-11-01", to: "2026-11-10" }, NOW), "phieu-sua-chua-2026-11-01-den-2026-11-10-2026-11-13.xlsx");
});

test("file Excel: 2 sheet, ngày là ngày thật, chi phí là số hoặc trống, có dòng tổng", async () => {
  const rows = buildRepairRows([
    { ...base, code: "SC-2", status: "completed", repairType: "external", vendor: "Cty A", cost: "3500000",
      receivedAt: new Date("2026-11-04T03:00:00Z"), externalSentAt: new Date("2026-11-05T03:00:00Z"),
      completedAt: new Date("2026-11-12T03:00:00Z"), ownerConfirmedAt: new Date("2026-11-13T03:00:00Z") },
    { ...base, status: "pending_acceptance", repairType: null },
  ], NOW);
  const bytes = await buildRepairWorkbook({ generatedAt: NOW, exportedBy: "Quản lý", range: { from: null, to: null }, rows, truncated: false });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Phiếu sửa chữa", "Tổng hợp"]);
  const sheet = workbook.getWorksheet("Phiếu sửa chữa")!;
  const header = sheet.getRow(4).values as unknown[];
  assert.equal(header[10], "Ngày báo hỏng");
  assert.equal(header[14], "Ngày gửi thuê ngoài");
  assert.equal(header[19], "Chi phí");
  const first = sheet.getRow(5);
  assert.ok(first.getCell(10).value instanceof Date, "ngày báo hỏng là ngày thật");
  assert.equal(first.getCell(14).value instanceof Date, true, "ngày gửi thuê ngoài");
  assert.equal(first.getCell(19).value, 3500000);
  const second = sheet.getRow(6);
  assert.ok(second.getCell(19).value === null || second.getCell(19).value === "", "chưa nhập chi phí thì để trống");
  assert.equal(second.getCell(11).value === null || second.getCell(11).value === "", true, "chưa tiếp nhận thì ô ngày tiếp nhận trống");
  const totalRow = sheet.getRow(7);
  assert.equal(totalRow.getCell(19).value, 3500000);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("route xuất: kiểm đăng nhập rồi chỉ Quản lý Xưởng/Admin (403), trang chỉ hiện form cho họ", async () => {
  const route = await source("src/app/(app)/repairs/export/route.ts");
  assert.match(route, /getActiveAuthOrNull\(\)/);
  assert.match(route, /redirectToLogin\(request\)/);
  assert.match(route, /!auth\.isWorkshopAdmin \|\| auth\.isReadOnlyViewer/);
  assert.match(route, /status: 403/);
  assert.ok(route.indexOf("redirectToLogin") < route.indexOf("status: 403") && route.indexOf("status: 403") < route.indexOf("await loadRepairsForExport"), "kiểm quyền trước khi đọc dữ liệu");
  const page = await source("src/app/(app)/repairs/page.tsx");
  assert.match(page, /auth\.isWorkshopAdmin && !auth\.isReadOnlyViewer \? \(/);
  assert.match(page, /action="\/repairs\/export" method="get"/);
  const data = await source("src/lib/repairs-export-data.ts");
  assert.match(data, /eq\(activityLogs\.action, "repair\.external"\)/, "ngày gửi thuê ngoài lấy từ nhật ký");
});
