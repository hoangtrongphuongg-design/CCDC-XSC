import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  ACTIVITY_ACTIONS,
  ADMIN_ONLY_ACTION_PREFIXES,
  MIRROR_ACTIONS,
  actionLabel,
  categoryOf,
  defaultExportRange,
  isAdminOnlyAction,
  isVisibleActivity,
  parseExportRange,
  toVnWallClock,
  vnDayEnd,
  vnDayStart,
} from "../src/lib/activity-log";
import { buildActivityWorkbook } from "../src/lib/export/activity-workbook";
import type { ActivityRow } from "../src/lib/activity-query";

test("mọi mã hành động ghi bởi src/actions đều có nhãn tiếng Việt trong từ điển", async () => {
  const dir = new URL("../src/actions/", import.meta.url);
  const found = new Set<string>();
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".ts")) continue;
    const text = await readFile(new URL(file, dir), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!/\baction:/.test(line)) continue;
      // Gồm cả dòng có điều kiện: action: cond ? "a.b" : "c.d"
      for (const match of line.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)) found.add(match[1]);
    }
  }
  assert.ok(found.size >= 45, `chỉ tìm thấy ${found.size} mã hành động, có thể regex quét sai`);
  const missing = [...found].filter((action) => !(action in ACTIVITY_ACTIONS));
  assert.deepEqual(missing, [], `thiếu nhãn cho: ${missing.join(", ")}`);
});

test("nhãn tiếng Việt, mã lạ vẫn hiển thị và rơi vào sheet Khác", () => {
  assert.equal(actionLabel("machine_loan.approve_and_handover"), "Duyệt và bàn giao máy");
  assert.equal(actionLabel("so.moi.chua.co"), "so.moi.chua.co");
  assert.equal(categoryOf("so.moi.chua.co"), "other");
  assert.equal(categoryOf("quick_loan.create"), "loan");
  assert.equal(categoryOf("machine_loan.close_irreparable"), "repair");
  assert.equal(categoryOf("tool_disposal.complete"), "disposal");
  assert.equal(categoryOf("equipment.update"), "ccdc");
});

test("bản sao theo máy luôn bị ẩn; sự kiện tài khoản/nhóm chỉ Admin thấy", () => {
  assert.deepEqual([...MIRROR_ACTIONS].sort(), [
    "equipment.import_create",
    "equipment.loan_completed",
    "equipment.loan_rejected",
    "equipment.loan_requested",
    "equipment.loan_started",
    "equipment.return_requested",
    "inventory.check",
  ]);
  for (const action of MIRROR_ACTIONS) {
    assert.equal(isVisibleActivity(action, true), false, `${action} phải ẩn cả với Admin`);
    assert.equal(isVisibleActivity(action, false), false);
  }
  assert.equal(isVisibleActivity("user.approve", false), false);
  assert.equal(isVisibleActivity("group.create", false), false);
  assert.equal(isVisibleActivity("user.approve", true), true);
  assert.equal(isVisibleActivity("machine_loan.create", false), true);
  assert.equal(isVisibleActivity("repair.create", false), true);

  // Quy tắc theo tiền tố (dùng ở truy vấn SQL) phải khớp quy tắc theo từ điển.
  for (const action of Object.keys(ACTIVITY_ACTIONS)) {
    const byPrefix = ADMIN_ONLY_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
    assert.equal(isAdminOnlyAction(action), byPrefix, action);
  }
});

test("ngày Việt Nam → mốc thời gian đúng, kể cả quanh nửa đêm", () => {
  assert.equal(vnDayStart("2026-11-12").toISOString(), "2026-11-11T17:00:00.000Z");
  assert.equal(vnDayEnd("2026-11-12").toISOString(), "2026-11-12T16:59:59.999Z");
  // 20:00 UTC ngày 30/11 đã là 03:00 ngày 1/12 theo giờ VN.
  assert.deepEqual(defaultExportRange(new Date("2026-11-30T20:00:00Z")), { from: "2026-12-01", to: "2026-12-01" });
  assert.deepEqual(defaultExportRange(new Date("2026-11-15T05:00:00Z")), { from: "2026-11-01", to: "2026-11-15" });
});

test("khoảng ngày xuất: sai/thiếu → mặc định, đảo ngược → tự đảo", () => {
  const now = new Date("2026-11-15T05:00:00Z");
  assert.deepEqual(parseExportRange(null, null, now), { from: "2026-11-01", to: "2026-11-15", fromAt: vnDayStart("2026-11-01"), toAt: vnDayEnd("2026-11-15") });
  assert.equal(parseExportRange("abc", "2026-02-31", now).from, "2026-11-01");
  assert.equal(parseExportRange("2026-11-10", "xyz", now).to, "2026-11-15");
  const swapped = parseExportRange("2026-11-20", "2026-11-05", now);
  assert.equal(swapped.from, "2026-11-05");
  assert.equal(swapped.to, "2026-11-20");
});

test("giờ treo tường VN cho ô Excel", () => {
  assert.equal(toVnWallClock(new Date("2026-11-11T05:00:00Z")).toISOString(), "2026-11-11T12:00:00.000Z");
});

function row(action: string, overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    createdAt: new Date("2026-11-11T05:30:00Z"),
    actor: "Nguyễn Văn A",
    groupName: "Bảo trì cơ - Nhóm CBL",
    action,
    description: `Mô tả ${action}`,
    reason: null,
    ...overrides,
  };
}

async function readBack(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return workbook;
}

test("Excel lịch sử: mỗi nghiệp vụ một sheet theo thứ tự, chỉ có tên người, giờ VN", async () => {
  const bytes = await buildActivityWorkbook({
    generatedAt: new Date("2026-11-11T08:00:00Z"),
    exportedBy: "Hoàng Trọng Phương",
    fromIso: "2026-11-01",
    toIso: "2026-11-11",
    truncated: false,
    rows: [
      row("repair.create"),
      row("quick_loan.create", { reason: "cần gấp" }),
      row("machine_loan.create"),
      row("transfer.create"),
      row("equipment.update"),
      row("user.approve"),
      row("so.moi.chua.co"),
    ],
  });
  const workbook = await readBack(bytes);

  assert.deepEqual(workbook.worksheets.map((ws) => ws.name), ["Cho mượn", "Điều chuyển", "Sửa chữa", "CCDC", "Tài khoản & nhóm", "Khác"]);

  const loan = workbook.getWorksheet("Cho mượn")!;
  assert.match(String(loan.getCell("A1").value), /LỊCH SỬ HOẠT ĐỘNG – CHO MƯỢN/);
  assert.match(String(loan.getCell("A2").value), /Từ 01\/11\/2026 đến 11\/11\/2026/);
  const header = Array.from({ length: 7 }, (_, i) => String(loan.getRow(4).getCell(i + 1).value));
  assert.deepEqual(header, ["Thời gian", "Người thực hiện", "Nhóm", "Loại", "Hành động", "Nội dung", "Lý do"]);
  assert.ok(!header.some((value) => /danh bộ/i.test(value)), "không có cột số danh bộ");

  // Sheet Cho mượn có đủ 2 dòng: Mượn nhanh trước (theo thứ tự nhận), kèm cột Loại.
  const kinds: string[] = [];
  loan.eachRow((r, n) => { if (n > 4) kinds.push(String(r.getCell(4).value)); });
  assert.deepEqual(kinds, ["Mượn nhanh", "Mượn máy"]);

  // Giờ: 05:30 UTC = 12:30 giờ VN, là giá trị ngày giờ thật.
  const time = loan.getRow(5).getCell(1).value as Date;
  assert.ok(time instanceof Date);
  assert.equal(time.toISOString(), "2026-11-11T12:30:00.000Z");

  const repair = workbook.getWorksheet("Sửa chữa")!;
  assert.equal(repair.getRow(4).getCell(4).value, "Hành động", "sheet không phải Cho mượn không có cột Loại");
  assert.equal(repair.getRow(5).getCell(4).value, "Báo hỏng / đề nghị sửa chữa");
});

test("Excel lịch sử: không có dữ liệu vẫn ra file hợp lệ 1 sheet", async () => {
  const bytes = await buildActivityWorkbook({
    generatedAt: new Date("2026-11-11T08:00:00Z"),
    exportedBy: "A",
    fromIso: "2026-11-01",
    toIso: "2026-11-02",
    truncated: false,
    rows: [],
  });
  const workbook = await readBack(bytes);
  assert.deepEqual(workbook.worksheets.map((ws) => ws.name), ["Lịch sử"]);
  assert.match(String(workbook.getWorksheet("Lịch sử")!.getCell("A2").value), /Không có hoạt động/);
});
