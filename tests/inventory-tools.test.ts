import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { countToolFilters, filterToolRows, isToolQuarter, parseCountedQty, summarizeToolCounts, toolCountDiff, toolCountDrifted, toolCountState } from "../src/lib/inventory";
import { plan } from "../src/lib/inventory-schedule";
import { buildInventoryWorkbook } from "../src/lib/export/inventory-workbook";
import type { InventoryDetail } from "../src/lib/inventory-data";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("CCDC theo số lượng kiểm mỗi quý: chỉ kỳ tháng 1, 4, 7, 10", () => {
  for (const period of ["2027-01", "2026-04", "2026-07", "2026-10"]) assert.equal(isToolQuarter(period), true, period);
  for (const period of ["2026-11", "2026-12", "2026-02", "2026-03", "2026-05", "2026-06", "2026-08", "2026-09"]) assert.equal(isToolQuarter(period), false, period);
  assert.equal(isToolQuarter(null), false, "đợt mở tay không có kỳ");
  assert.equal(isToolQuarter("2026-1"), false);
  assert.equal(isToolQuarter("abc"), false);
});

test("đếm CCDC: đủ / thiếu / thừa / chưa đếm so với số hệ thống tại lúc đếm", () => {
  assert.equal(toolCountState({ counted: null, expected: 10 }), "pending");
  assert.equal(toolCountState({ counted: 10, expected: 10 }), "ok");
  assert.equal(toolCountState({ counted: 7, expected: 10 }), "short");
  assert.equal(toolCountState({ counted: 12, expected: 10 }), "over");
  assert.equal(toolCountDiff({ counted: 7, expected: 10 }), -3);
  assert.equal(toolCountDiff({ counted: 0.3, expected: 0.1 }), 0.2, "làm tròn 2 chữ số");
  assert.equal(toolCountDiff({ counted: null, expected: 5 }), null);
  const summary = summarizeToolCounts([
    { counted: 10, expected: 10 }, { counted: 7, expected: 10 }, { counted: 12, expected: 10 }, { counted: null, expected: null },
  ]);
  assert.deepEqual(summary, { total: 4, counted: 3, pending: 1, ok: 1, short: 1, over: 1, progress: 75 });
  assert.equal(summarizeToolCounts([]).progress, 100);
});

test("số đếm nhập vào: ≥ 0, tối đa 2 chữ số thập phân, chấp nhận dấu phẩy", () => {
  assert.deepEqual(parseCountedQty("5"), { ok: true, value: 5 });
  assert.deepEqual(parseCountedQty("0"), { ok: true, value: 0 });
  assert.deepEqual(parseCountedQty("2,5"), { ok: true, value: 2.5 });
  assert.equal(parseCountedQty("").ok, false);
  assert.equal(parseCountedQty("-1").ok, false);
  assert.equal(parseCountedQty("abc").ok, false);
  assert.equal(parseCountedQty("1.234").ok, false);
});

test("cờ includes_tools: đợt quý tự gắn, đợt TAY gắn khi tích; tích mà nhóm không có CCDC thì báo lỗi; nhận đợt chỉ bật thêm", async () => {
  const create = await source("src/lib/inventory-create.ts");
  assert.match(create, /includeTools\?: boolean/);
  assert.match(create, /const includesTools = \(isToolQuarter\(period\) \|\| Boolean\(input\.includeTools\)\) && hasTools;/);
  assert.match(create, /input\.includeTools && !hasTools\) throw new Error\(/, "tích mà không có CCDC thì báo rõ");
  assert.match(create, /\.values\(\{ code, groupId, title: input\.title, createdBy, period, includesTools \}\)/);
  assert.match(create, /!machines\.length && !includesTools/, "nhóm chỉ có CCDC vẫn mở được đợt kèm CCDC");
  const schedule = await source("src/lib/inventory-schedule-data.ts");
  assert.match(schedule, /includesTools: sql`\$\{inventorySessions\.includesTools\} or \$\{includesTools\}`/, "nhận đợt tay không ghi đè cờ về false");
  const actions = await source("src/actions/inventory.ts");
  assert.match(actions, /includeTools: formData\.get\("includeTools"\) === "on"/);
  const page = await source("src/app/(app)/inventory/page.tsx");
  assert.match(page, /name="includeTools" defaultChecked/);
});

test("kỳ quý: nhóm chỉ có CCDC (chưa có máy) vẫn có đợt; kỳ thường thì không", () => {
  const groups = [{ groupId: "a", machineCount: 0, toolCount: 5 }, { groupId: "b", machineCount: 0, toolCount: 0 }, { groupId: "c", machineCount: 3, toolCount: 0 }];
  const summarize = (today: string) => plan({ today, groups, sessions: [] }).map((x) => `${x.type}:${x.groupId}`);
  assert.deepEqual(summarize("2027-01-01"), ["create:a", "create:c"], "tháng 1: nhóm a (chỉ CCDC) và c (có máy)");
  assert.deepEqual(summarize("2026-11-01"), ["create:c"], "tháng 11: chỉ nhóm có máy");
  assert.deepEqual(plan({ today: "2027-01-01", groups: [{ groupId: "a", machineCount: 0 }], sessions: [] }), [], "không truyền toolCount thì như cũ");
});

test("số CCDC chưa đếm tính bằng NOT EXISTS (không phải phép trừ) và dùng chung ở mọi nơi", async () => {
  const helper = await source("src/lib/inventory-tool-pending.ts");
  assert.match(helper, /not exists \(select 1 from inventory_tool_counts c where c\.session_id = /);
  assert.match(await source("src/actions/inventory.ts"), /countUncountedTools\(tx, sessionId, session\.groupId\)/);
  const schedule = await source("src/lib/inventory-schedule-data.ts");
  assert.match(schedule, /countUncountedTools\(tx, sessionId, updated\.groupId\)/);
  assert.match(schedule, /toolsUnchecked/);
  assert.match(await source("src/lib/my-tasks-data.ts"), /not exists \(select 1 from inventory_tool_counts c where c\.session_id = /);
  assert.doesNotMatch(await source("src/lib/my-tasks-data.ts"), /greatest\(\(select count/);
  assert.match(await source("src/lib/inventory-data.ts"), /toolCounted/);
});

test("lọc / tìm CCDC theo số lượng và cảnh báo số hệ thống đổi sau khi đếm", () => {
  const rows = [
    { code: "A-VT-0001", name: "Mũi khoan Ø12", specification: "HSS", counted: null, expected: null },
    { code: null, name: "Taro M20", specification: "Thép", counted: 5, expected: 5 },
    { code: "A-VT-0003", name: "Cờ lê 24", specification: null, counted: 3, expected: 6 },
    { code: "A-VT-0004", name: "Kìm", specification: null, counted: 9, expected: 7 },
  ];
  assert.deepEqual(countToolFilters(rows), { pending: 1, short: 1, ok: 1, over: 1, all: 4 });
  assert.deepEqual(filterToolRows(rows, "pending", "").map((r) => r.name), ["Mũi khoan Ø12"]);
  assert.deepEqual(filterToolRows(rows, "short", "").map((r) => r.name), ["Cờ lê 24"]);
  assert.deepEqual(filterToolRows(rows, "all", "mui khoan hss").map((r) => r.name), ["Mũi khoan Ø12"], "không dấu, nhiều từ");
  assert.deepEqual(filterToolRows(rows, "all", "vt-0003").map((r) => r.name), ["Cờ lê 24"], "tìm theo mã");
  assert.deepEqual(filterToolRows(rows, "ok", "khoan"), [], "tab và từ khóa cùng áp");
  assert.equal(toolCountDrifted({ counted: 5, expected: 5, onHand: 5 }), false);
  assert.equal(toolCountDrifted({ counted: 5, expected: 5, onHand: 3 }), true, "tồn đổi sau khi đếm");
  assert.equal(toolCountDrifted({ counted: null, expected: null, onHand: 3 }), false, "chưa đếm thì không cảnh báo");
  assert.equal(parseCountedQty("1000001").ok, false, "chặn nhập nhầm quá lớn");
  assert.equal(parseCountedQty("1000000").ok, true);
});

test("khối đếm có tab lọc, ô tìm, Enter nhảy ô kế tiếp, hiện người đếm và cảnh báo lệch; Excel có cột người đếm", async () => {
  const ui = await source("src/components/inventory/inventory-tool-counts.tsx");
  assert.match(ui, /filterToolRows\(rows, filter, query\)/);
  assert.match(ui, /toolCountDrifted\(row\)/);
  assert.match(ui, /Đếm bởi \{row\.checkedByName/);
  assert.match(ui, /event\.key === "Enter"/);
  assert.match(ui, /inputMode="decimal"/);
  assert.match(await source("src/lib/export/inventory-workbook.ts"), /header: "Người đếm"/);
});

test("ghi số đếm: khóa dòng đợt, chỉ đợt đang mở có cờ, CCDC thuộc nhóm, hoàn tác = xóa; ghi nhật ký mirror", async () => {
  const code = await source("src/actions/inventory.ts");
  const start = code.indexOf("export async function countInventoryToolAction");
  const body = code.slice(start, code.indexOf("export async function markInventoryFromProfileAction"));
  assert.match(body, /canCheckInventory\(auth, session\.groupId\)/);
  assert.match(body, /!session\.includesTools/);
  assert.match(body, /\.for\("update"\)/);
  assert.match(body, /eq\(toolCatalog\.groupId, session\.groupId\)/);
  assert.match(body, /onConflictDoUpdate/);
  assert.match(body, /tx\.delete\(inventoryToolCounts\)/);
  assert.match(body, /action: "inventory\.count_tool"/);
  assert.match(code, /CCDC số lượng: \$\{tools\.ok\} đủ/, "dòng đóng đợt có tóm tắt CCDC");
});

test("trang kiểm kê: khối CCDC theo số lượng chỉ khi đợt có cờ; Báo mất ở máy 'Không thấy' và CCDC thiếu", async () => {
  const page = await source("src/app/(app)/inventory/[id]/page.tsx");
  assert.match(page, /session\.includesTools \? \(/);
  assert.match(page, /<InventoryToolCounts/);
  const list = await source("src/components/inventory/inventory-checklist.tsx");
  assert.match(list, /item\.result === "missing" && !item\.lossStatus && canReportLoss/);
  assert.match(list, /action=\{submitLoss\}/);
  const tools = await source("src/components/inventory/inventory-tool-counts.tsx");
  assert.match(tools, /state === "short" && canReportLoss && !row\.lossStatus/);
  assert.match(tools, /action=\{submitToolLoss\}/);
  assert.match(tools, /name="sourceSessionId"/);
});

test("việc chờ Đốc công gồm cả CCDC số lượng chưa đếm", async () => {
  const tasks = await source("src/lib/my-tasks.ts");
  assert.match(tasks, /row\.pending \+ toolPending <= 0/);
  assert.match(await source("src/lib/my-tasks-data.ts"), /inventory_tool_counts/);
});

test("biên bản Excel: có sheet 'CCDC theo số lượng' khi đợt có cờ, kèm đếm / chênh lệch / báo mất", async () => {
  const detail: InventoryDetail = {
    session: { id: "s", code: "KK-2027-0001", title: null, groupId: "g", groupName: "Nhóm A", status: "closed", createdAt: new Date("2027-01-01T01:00:00Z"), closedAt: new Date("2027-01-16T01:00:00Z"), createdByName: "Hệ thống", closedByName: "Hệ thống (tự đóng)", period: "2027-01", autoClosed: true, includesTools: true },
    items: [],
    tools: [
      { toolId: "t1", code: "A-VT-0001", name: "Mũi khoan Ø12", specification: "HSS", unit: "cái", onHand: 10, counted: 7, expected: 10, note: null, checkedByName: "Hùng", checkedAt: new Date("2027-01-10T03:00:00Z"), lossQuantity: 3, lossStatus: "pending_ws" },
      { toolId: "t2", code: null, name: "Taro M20", specification: null, unit: "cái", onHand: 5, counted: null, expected: null, note: null, checkedByName: null, checkedAt: null, lossQuantity: null, lossStatus: null },
    ],
    canManage: true,
    canCheck: false,
    canReportLoss: false,
  };
  const bytes = await buildInventoryWorkbook({ generatedAt: new Date("2027-01-16T03:00:00Z"), exportedBy: "Admin", detail });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet("CCDC theo số lượng");
  assert.ok(ws, "thiếu sheet CCDC theo số lượng");
  assert.match(String(ws.getCell(2, 1).value), /1 thiếu/);
  const rows: string[][] = [];
  ws.eachRow((row, n) => { if (n > 4) rows.push([1, 2, 3, 6, 7, 8, 9, 10].map((c) => String(row.getCell(c).value ?? ""))); });
  assert.deepEqual(rows[0], ["1", "A-VT-0001", "Mũi khoan Ø12", "10", "7", "-3", "Thiếu", "3 cái — chờ duyệt"]);
  assert.equal(rows[1][6], "Chưa đếm");
});
