import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildLoanWorkbook, buildTransferWorkbook } from "../src/lib/export/loan-workbook";
import {
  buildMachineLoanRows,
  buildQuickLoanRows,
  buildTransferRows,
  lateDays,
  loanExportFileName,
  summarizeLoans,
  summarizeTransfers,
  transferExportFileName,
  type RawMachineLoanExportRow,
  type RawQuickLoanExportRow,
  type RawTransferExportRow,
} from "../src/lib/loans-export";

const NOW = new Date("2026-11-13T05:00:00Z");

const machine: RawMachineLoanExportRow = {
  code: "PM-2026-0001", status: "on_loan", purpose: "Hàn khung", workLocation: "Xưởng 2", receiverName: "Bình",
  expectedReturnDate: "2026-11-10", handoverCondition: "Tốt", returnCondition: null, incidentNotes: null, rejectionReason: null,
  createdAt: new Date("2026-11-03T03:00:00Z"), approvedAt: new Date("2026-11-03T04:00:00Z"), handedOverAt: new Date("2026-11-03T04:00:00Z"),
  receivedAt: new Date("2026-11-03T05:00:00Z"), returnRequestedAt: null, closedAt: null,
  equipmentCode: "WS-0001", equipmentLegacyCode: "MH-05", equipmentName: "Máy hàn MIG",
  ownerGroupName: "Nhóm Workshop", borrowerGroupName: "Nhóm Lò", requestedByName: "An", approvedByName: "Chi",
};
const quick: RawQuickLoanExportRow = {
  code: "CM-2026-0001", status: "completed", itemName: "Mũi khoan Ø12", specification: "HSS", unit: "cái", toolCode: "WS-VT-0001",
  quantityBorrowed: "5.00", returnedGood: "4.00", returnedDamaged: "1.00", lostQuantity: "0.00",
  lenderNote: null, borrowerNote: null, returnNote: "1 cái gãy",
  createdAt: new Date("2026-10-20T03:00:00Z"), approvedAt: new Date("2026-10-20T04:00:00Z"), receivedAt: new Date("2026-10-20T04:00:00Z"),
  expectedReturnAt: new Date("2026-10-25T10:00:00Z"), returnReportedAt: new Date("2026-10-27T03:00:00Z"), closedAt: new Date("2026-10-28T03:00:00Z"),
  sourceGroupName: "Nhóm Workshop", borrowerGroupName: "Nhóm Lò", requestedByName: "An", approvedByName: "Chi",
};
const transfer: RawTransferExportRow = {
  code: "DC-2026-0001", status: "completed", reason: "Chuyển nhóm quản lý", handoverCondition: "Tốt", rejectionReason: null,
  createdAt: new Date("2026-11-01T03:00:00Z"), counterpartAcceptedAt: new Date("2026-11-02T03:00:00Z"), wsApprovedAt: new Date("2026-11-03T03:00:00Z"),
  handedOverAt: new Date("2026-11-04T03:00:00Z"), receivedAt: new Date("2026-11-05T03:00:00Z"),
  equipmentCode: "WS-0002", equipmentLegacyCode: null, equipmentName: "Máy khoan từ",
  sourceGroupName: "Nhóm Workshop", targetGroupName: "Nhóm Lò", proposedByGroupName: "Nhóm Lò", proposedByName: "An",
};

test("số ngày trễ: đang giữ tính đến hôm nay, đã xong tính theo ngày hoàn tất, đúng hạn thì trống", () => {
  assert.equal(lateDays({ dueDate: "2026-11-10", holding: true, closedAt: null, now: NOW }), 3);
  assert.equal(lateDays({ dueDate: "2026-11-13", holding: true, closedAt: null, now: NOW }), null, "hôm nay là hạn chót chưa tính trễ");
  assert.equal(lateDays({ dueDate: "2026-11-10", holding: false, closedAt: new Date("2026-11-12T03:00:00Z"), now: NOW }), 2, "trả trễ 2 ngày");
  assert.equal(lateDays({ dueDate: "2026-11-10", holding: false, closedAt: new Date("2026-11-09T03:00:00Z"), now: NOW }), null);
  assert.equal(lateDays({ dueDate: "2026-11-10", holding: false, closedAt: null, now: NOW }), null, "phiếu bị từ chối / chưa đóng, không giữ máy");
  assert.equal(lateDays({ dueDate: null, holding: true, closedAt: null, now: NOW }), null);
});

test("dựng dòng mượn máy / mượn nhanh / điều chuyển", () => {
  const [m] = buildMachineLoanRows([machine], NOW);
  assert.equal(m.statusLabel, "Đang mượn");
  assert.equal(m.late, 3);

  const [q] = buildQuickLoanRows([quick], NOW);
  assert.equal(q.qtyBorrowed, 5);
  assert.equal(q.qtyGood, 4);
  assert.equal(q.qtyDamaged, 1);
  assert.equal(q.dueDate, "2026-10-25");
  assert.equal(q.late, 3, "hạn 25/10, hoàn tất 28/10 giờ VN");

  const [t] = buildTransferRows([transfer, { ...transfer, status: "pending_ws", receivedAt: null }], NOW);
  assert.equal(t.totalDays, 4);
  assert.equal(buildTransferRows([{ ...transfer, status: "pending_ws", receivedAt: null }], NOW)[0].totalDays, 12, "phiếu mở: đến hôm nay");
  assert.equal(buildTransferRows([{ ...transfer, status: "rejected", receivedAt: null }], NOW)[0].totalDays, null, "bị từ chối: không tính");
});

test("tổng hợp mượn – trả và điều chuyển", () => {
  const machineRows = buildMachineLoanRows([machine, { ...machine, code: "PM-2", status: "completed", closedAt: new Date("2026-11-09T03:00:00Z") }], NOW);
  const quickRows = buildQuickLoanRows([quick], NOW);
  const sections = summarizeLoans(machineRows, quickRows);
  const section = (title: string) => sections.find((s) => s.title === title)!.lines.map((l) => [l.label, l.count]);
  assert.deepEqual(section("Theo loại phiếu"), [["Mượn máy (có mã)", 2], ["Mượn nhanh (CCDC lặt vặt)", 1]]);
  assert.deepEqual(section("Phiếu trễ hạn (đang giữ quá hạn hoặc trả trễ)"), [["Mượn máy", 1], ["Mượn nhanh", 1]]);
  assert.deepEqual(section("Theo nhóm cho mượn"), [["Nhóm Workshop", 3]]);
  assert.deepEqual(section("Theo tháng đề nghị"), [["10/2026", 1], ["11/2026", 2]]);

  const ts = summarizeTransfers(buildTransferRows([transfer, { ...transfer, code: "DC-2", status: "rejected", receivedAt: null }], NOW));
  assert.deepEqual(ts[0].lines.map((l) => [l.label, l.count]), [["Đã hoàn thành", 1], ["Từ chối", 1]]);
});

test("tên file", () => {
  assert.equal(loanExportFileName({ from: null, to: null }, NOW), "muon-tra-2026-11-13.xlsx");
  assert.equal(transferExportFileName({ from: "2026-11-01", to: null }, NOW), "dieu-chuyen-2026-11-01-den-nay-2026-11-13.xlsx");
});

async function load(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  return workbook;
}

test("file Excel Mượn – Trả: 3 sheet, ngày là ngày thật, số lượng là số", async () => {
  const bytes = await buildLoanWorkbook({
    generatedAt: NOW, exportedBy: "Quản lý", range: { from: null, to: null },
    machine: buildMachineLoanRows([machine], NOW), quick: buildQuickLoanRows([quick], NOW), truncated: false,
  });
  const workbook = await load(bytes);
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ["Mượn máy", "Mượn nhanh", "Tổng hợp"]);
  const m = workbook.getWorksheet("Mượn máy")!;
  assert.equal((m.getRow(4).values as unknown[])[12], "Ngày đề nghị");
  assert.ok(m.getRow(5).getCell(12).value instanceof Date);
  assert.ok(m.getRow(5).getCell(16).value instanceof Date, "hạn trả là ngày thật");
  assert.equal(m.getRow(5).getCell(20).value, 3, "số ngày trễ");
  const q = workbook.getWorksheet("Mượn nhanh")!;
  assert.equal(q.getRow(5).getCell(7).value, 5);
  assert.equal(q.getRow(5).getCell(9).value, 1);
});

test("file Excel Điều chuyển: 2 sheet, ngày là ngày thật, ô chưa có để trống", async () => {
  const bytes = await buildTransferWorkbook({
    generatedAt: NOW, exportedBy: "Quản lý", range: { from: "2026-11-01", to: "2026-11-30" },
    rows: buildTransferRows([transfer, { ...transfer, code: "DC-2", status: "pending_ws", counterpartAcceptedAt: null, wsApprovedAt: null, handedOverAt: null, receivedAt: null }], NOW), truncated: false,
  });
  const workbook = await load(bytes);
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ["Điều chuyển", "Tổng hợp"]);
  const sheet = workbook.getWorksheet("Điều chuyển")!;
  assert.ok(sheet.getRow(5).getCell(11).value instanceof Date);
  assert.ok(sheet.getRow(5).getCell(15).value instanceof Date, "ngày nhận máy");
  const empty = sheet.getRow(6).getCell(12).value;
  assert.ok(empty === null || empty === "", "chưa có ngày đồng ý thì để trống");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("route xuất: kiểm đăng nhập rồi chỉ Quản lý Xưởng/Admin (403) trước khi đọc dữ liệu; trang chỉ hiện thanh xuất cho họ", async () => {
  for (const [path, loader] of [["src/app/(app)/machine-loans/export/route.ts", "await loadLoansForExport"], ["src/app/(app)/transfers/export/route.ts", "await loadTransfersForExport"]] as const) {
    const route = await source(path);
    assert.match(route, /getActiveAuthOrNull\(\)/);
    assert.match(route, /!auth\.isWorkshopAdmin \|\| auth\.isReadOnlyViewer/);
    assert.match(route, /status: 403/);
    assert.ok(route.indexOf("status: 403") < route.indexOf(loader), `${path}: kiểm quyền trước khi đọc dữ liệu`);
  }
  assert.match(await source("src/app/(app)/machine-loans/page.tsx"), /auth\.isWorkshopAdmin && !auth\.isReadOnlyViewer \? <ExportBar action="\/machine-loans\/export"/);
  assert.match(await source("src/app/(app)/quick-loans/page.tsx"), /auth\.isWorkshopAdmin && !auth\.isReadOnlyViewer \? <ExportBar action="\/machine-loans\/export"/, "tab CCDC lặt vặt tải cùng file mượn – trả");
  assert.match(await source("src/app/(app)/transfers/page.tsx"), /auth\.isWorkshopAdmin && !auth\.isReadOnlyViewer \? <ExportBar action="\/transfers\/export"/);
});
