import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildReportWorkbook } from "../src/lib/export/report-workbook";
import {
  buildOverdueRows,
  dayDiff,
  formatVnd,
  idleMachines,
  lastMonths,
  monthsWindowStart,
  repairCostByGroup,
  repairCostByMonth,
  vnMonthKey,
} from "../src/lib/reports";
import type { OperationsReport } from "../src/lib/reports-data";

const NAMES = new Map([["a", "Nhóm A"], ["b", "Nhóm B"]]);
const NOW = new Date("2026-11-12T03:00:00Z"); // 10h sáng 12/11/2026 giờ VN

test("dayDiff / lastMonths / monthsWindowStart theo giờ Việt Nam", () => {
  assert.equal(dayDiff("2026-11-01", "2026-11-12"), 11);
  assert.equal(dayDiff("2026-12-31", "2027-01-02"), 2);
  assert.equal(dayDiff("2026-11-12", "2026-11-12"), 0);
  const months = lastMonths(NOW);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2025-12");
  assert.equal(months[11], "2026-11");
  assert.equal(lastMonths(new Date("2026-02-10T00:00:00Z"), 3).join(","), "2025-12,2026-01,2026-02", "qua đầu năm");
  // 16h UTC ngày 30/11 đã là 23h VN (vẫn tháng 11); 18h UTC là 1h ngày 1/12 VN.
  assert.equal(vnMonthKey(new Date("2026-11-30T16:00:00Z")), "2026-11");
  assert.equal(vnMonthKey(new Date("2026-11-30T18:00:00Z")), "2026-12");
  assert.equal(monthsWindowStart(NOW).toISOString(), "2025-11-30T17:00:00.000Z", "0h ngày 1/12/2025 giờ VN");
  assert.equal(formatVnd(1234567.4), "1.234.567 đ");
});

test("quá hạn trả: chỉ phiếu nhóm mượn còn giữ và quá hạn; trễ nhiều nhất lên đầu", () => {
  const rows = buildOverdueRows({
    today: "2026-11-12",
    groupNames: NAMES,
    loans: [
      { code: "PM-1", label: "Máy A (CBL-1)", status: "on_loan", ownerGroupId: "a", borrowerGroupId: "b", expectedReturnDate: "2026-11-02" },
      { code: "PM-2", label: "Máy B (CBL-2)", status: "incident", ownerGroupId: "a", borrowerGroupId: "b", expectedReturnDate: "2026-10-12" },
      { code: "PM-3", label: "Máy C", status: "on_loan", ownerGroupId: "a", borrowerGroupId: "b", expectedReturnDate: "2026-11-12" },       // đúng hạn hôm nay
      { code: "PM-4", label: "Máy D", status: "return_requested", ownerGroupId: "a", borrowerGroupId: "b", expectedReturnDate: "2026-09-01" }, // đã báo trả
      { code: "PM-5", label: "Máy E", status: "pending_owner", ownerGroupId: "a", borrowerGroupId: "b", expectedReturnDate: "2026-09-01" },   // chưa giao
    ],
    quickLoans: [
      { code: "CM-1", label: "Cờ lê × 2 cái", status: "borrowed", sourceGroupId: "a", borrowerGroupId: "b", expectedReturnAt: new Date("2026-11-09T03:00:00Z") },
      { code: "CM-2", label: "Búa", status: "borrowed", sourceGroupId: "a", borrowerGroupId: "b", expectedReturnAt: null },
      { code: "CM-3", label: "Kìm", status: "return_reported", sourceGroupId: "a", borrowerGroupId: "b", expectedReturnAt: new Date("2026-01-01T00:00:00Z") },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.code, r.daysLate]), [["PM-2", 31], ["PM-1", 10], ["CM-1", 3]]);
  assert.equal(rows[0].borrowerGroup, "Nhóm B");
  assert.equal(rows[0].ownerGroup, "Nhóm A");
  assert.equal(rows[2].kind, "Mượn nhanh");
});

test("chi phí sửa chữa: gom theo tháng VN (đủ 12 tháng), bỏ ngoài cửa sổ và phiếu chưa hoàn tất", () => {
  const repairs = [
    { completedAt: new Date("2026-11-05T03:00:00Z"), cost: "1500000.00", ownerGroupId: "a" },
    { completedAt: new Date("2026-11-30T18:00:00Z"), cost: "200000", ownerGroupId: "b" },   // 1h ngày 1/12 VN → tháng 12/2026: ngoài cửa sổ
    { completedAt: new Date("2026-10-31T17:30:00Z"), cost: "300000", ownerGroupId: "a" },   // 0h30 ngày 1/11 VN → tháng 11
    { completedAt: new Date("2026-03-10T03:00:00Z"), cost: "700000", ownerGroupId: "b" },
    { completedAt: new Date("2025-11-20T03:00:00Z"), cost: "999999", ownerGroupId: "b" },   // trước cửa sổ
    { completedAt: null, cost: "5000000", ownerGroupId: "a" },                                // chưa hoàn tất
    { completedAt: new Date("2026-03-11T03:00:00Z"), cost: null, ownerGroupId: "b" },       // không có chi phí vẫn tính 1 phiếu
  ];
  const byMonth = repairCostByMonth(repairs, NOW);
  assert.equal(byMonth.length, 12);
  assert.deepEqual(byMonth.find((m) => m.month === "2026-11"), { month: "2026-11", count: 2, total: 1_800_000 });
  assert.deepEqual(byMonth.find((m) => m.month === "2026-03"), { month: "2026-03", count: 2, total: 700_000 });
  assert.deepEqual(byMonth.find((m) => m.month === "2026-01"), { month: "2026-01", count: 0, total: 0 }, "tháng trống vẫn có dòng");
  assert.equal(byMonth.reduce((s, m) => s + m.count, 0), 4);

  const byGroup = repairCostByGroup(repairs, NAMES, NOW);
  assert.deepEqual(byGroup.map((g) => [g.name, g.count, g.total]), [["Nhóm A", 2, 1_800_000], ["Nhóm B", 2, 700_000]]);
});

test("máy nằm không: từ lần mượn gần nhất (chưa mượn thì từ ngày ghi nhận), cắt theo giới hạn, lâu nhất lên đầu", () => {
  const rows = [
    { id: "1", code: "A-1", name: "Máy 1", ownerGroupId: "a", recordedDate: "2020-01-01", lastLoanAt: new Date("2026-01-01T03:00:00Z") },  // 315 ngày
    { id: "2", code: "A-2", name: "Máy 2", ownerGroupId: "a", recordedDate: "2020-01-01", lastLoanAt: new Date("2026-10-01T03:00:00Z") },  // 42 ngày → không
    { id: "3", code: "B-1", name: "Máy 3", ownerGroupId: "b", recordedDate: "2025-01-01", lastLoanAt: null },                                // chưa mượn, 680 ngày
    { id: "4", code: "B-2", name: "Máy 4", ownerGroupId: "b", recordedDate: "2026-09-01", lastLoanAt: null },                                // mới ghi nhận → không
    { id: "5", code: "B-3", name: "Máy 5", ownerGroupId: "b", recordedDate: "2026-05-16", lastLoanAt: null },                                // đúng 180 ngày → có
  ];
  const result = idleMachines(rows, NAMES, "2026-11-12");
  assert.equal(result.total, 3);
  assert.deepEqual(result.rows.map((r) => [r.code, r.idleDays, r.neverBorrowed]), [["B-1", 680, true], ["A-1", 315, false], ["B-3", 180, true]]);
  assert.equal(result.rows[0].group, "Nhóm B");
  const limited = idleMachines(rows, NAMES, "2026-11-12", 180, 2);
  assert.equal(limited.rows.length, 2);
  assert.equal(limited.total, 3, "tổng vẫn đếm đủ khi cắt danh sách");
});

test("file Excel báo cáo: ba sheet, chi phí ghi dạng số", async () => {
  const report: OperationsReport = {
    today: "2026-11-12",
    overdue: [{ kind: "Mượn máy", code: "PM-1", label: "Máy A", borrowerGroup: "Nhóm B", ownerGroup: "Nhóm A", dueDate: "2026-11-02", daysLate: 10 }],
    repairByMonth: repairCostByMonth([{ completedAt: new Date("2026-11-05T03:00:00Z"), cost: "1500000", ownerGroupId: "a" }], NOW),
    repairByGroup: repairCostByGroup([{ completedAt: new Date("2026-11-05T03:00:00Z"), cost: "1500000", ownerGroupId: "a" }], NAMES, NOW),
    idle: { rows: [{ code: "A-1", name: "Máy 1", group: "Nhóm A", since: "2026-01-01", idleDays: 315, neverBorrowed: false }], total: 1 },
  };
  const bytes = await buildReportWorkbook({ generatedAt: NOW, exportedBy: "Admin", report });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Quá hạn trả", "Chi phí sửa chữa", "Máy nằm không"]);
  const cost = wb.getWorksheet("Chi phí sửa chữa")!;
  const numbers: number[] = [];
  cost.eachRow((row) => { const v = row.getCell(4).value; if (typeof v === "number") numbers.push(v); });
  assert.ok(numbers.includes(1_500_000), "chi phí là số, không phải chữ");
  assert.equal(String(wb.getWorksheet("Quá hạn trả")!.getCell(5, 3).value), "PM-1");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("trang và file báo cáo chỉ cho vai trò xem toàn Xưởng, dùng chung một nguồn số liệu", async () => {
  assert.match(await source("src/app/(app)/reports/page.tsx"), /requireWholeWorkshopView\(\)/);
  assert.match(await source("src/app/(app)/reports/page.tsx"), /loadOperationsReport\(\)/);
  const route = await source("src/app/(app)/reports/export/route.ts");
  assert.match(route, /canViewWholeWorkshop\(auth\)/);
  assert.match(route, /loadOperationsReport\(/);
});
