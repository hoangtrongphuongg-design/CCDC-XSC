import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildInventoryWorkbook } from "../src/lib/export/inventory-workbook";
import {
  canCheckInventory,
  canManageInventory,
  canOpenInventory,
  canViewInventory,
  classifyExpected,
  filterChecklist,
  sectionOf,
  summarizeInventory,
  type ChecklistItem,
  type InventorySubject,
} from "../src/lib/inventory";
import type { InventoryDetail } from "../src/lib/inventory-data";

const A = "group-a";
const B = "group-b";

function subject(over: Partial<InventorySubject> & { perms?: Array<[string, "viewer" | "operator" | "manager"]> } = {}): InventorySubject {
  const { perms = [], ...rest } = over;
  return { isAdmin: false, isWsManager: false, isReadOnlyViewer: false, permissions: perms.map(([groupId, level]) => ({ groupId, level })), ...rest };
}

test("mở đợt tay chỉ Quản lý Xưởng/Admin; Đốc công, Kỹ sư, Công nhân và Người xem thì không", () => {
  assert.equal(canOpenInventory(subject({ isWsManager: true })), true);
  assert.equal(canOpenInventory(subject({ isAdmin: true })), true);
  assert.equal(canOpenInventory(subject({ perms: [[A, "manager"]] })), false, "Đốc công không tự mở: đợt đã tự mở ngày 1");
  assert.equal(canOpenInventory(subject({ perms: [[A, "operator"]] })), false);
  assert.equal(canOpenInventory(subject({ perms: [[A, "viewer"]] })), false);
  assert.equal(canOpenInventory(subject({ isReadOnlyViewer: true, isAdmin: true })), false);
});

test("quyền kiểm kê: Đốc công đóng, mọi thành viên nhóm kiểm, vai trò toàn Xưởng xem; Người xem không ghi", () => {
  assert.equal(canManageInventory(subject({ perms: [[A, "manager"]] }), A), true);
  assert.equal(canManageInventory(subject({ perms: [[A, "operator"]] }), A), false, "Kỹ sư giám sát chưa được mở/đóng");
  assert.equal(canManageInventory(subject({ perms: [[A, "manager"]] }), B), false, "nhóm khác");
  assert.equal(canManageInventory(subject({ isWsManager: true }), B), true);
  assert.equal(canManageInventory(subject({ isAdmin: true }), A), true);

  assert.equal(canCheckInventory(subject({ perms: [[A, "viewer"]] }), A), true, "công nhân kỹ thuật cũng kiểm được");
  assert.equal(canCheckInventory(subject({ perms: [[A, "viewer"]] }), B), false);
  assert.equal(canCheckInventory(subject({ isAdmin: true }), B), true);

  const readOnly = subject({ isReadOnlyViewer: true, isAdmin: true, perms: [[A, "manager"]] });
  assert.equal(canManageInventory(readOnly, A), false);
  assert.equal(canCheckInventory(readOnly, A), false);
  assert.equal(canViewInventory(readOnly, B), true, "Người xem toàn xưởng được xem");
  assert.equal(canViewInventory(subject({ perms: [[A, "viewer"]] }), B), false);
  assert.equal(canViewInventory(subject({ perms: [[A, "viewer"]] }), A), true);
  assert.equal(canViewInventory(subject(), A), false);
});

test("classifyExpected: cho mượn / đang sửa / điều chuyển là nơi khác; máy mượn về cần kiểm tại nhóm", () => {
  const name = (id: string) => (id === A ? "Nhóm A" : "Nhóm B");
  assert.deepEqual(classifyExpected({ groupId: A, ownerGroupId: A, heldByGroupId: null, status: "in_use_owner" }, name), { offsite: false, note: null });
  assert.deepEqual(classifyExpected({ groupId: A, ownerGroupId: A, heldByGroupId: B, status: "on_loan" }, name), { offsite: true, note: "Đang cho Nhóm B mượn" });
  assert.deepEqual(classifyExpected({ groupId: A, ownerGroupId: A, heldByGroupId: null, status: "repairing" }, name), { offsite: true, note: "Đang sửa chữa" });
  assert.deepEqual(classifyExpected({ groupId: A, ownerGroupId: A, heldByGroupId: null, status: "wait_handover" }, name), { offsite: true, note: "Đang điều chuyển" });
  assert.deepEqual(classifyExpected({ groupId: A, ownerGroupId: A, heldByGroupId: null, status: "wait_disposal" }, name), { offsite: false, note: "Chờ thanh lý" });
  assert.deepEqual(classifyExpected({ groupId: A, ownerGroupId: B, heldByGroupId: A, status: "on_loan" }, name), { offsite: false, note: "Mượn của Nhóm B" });
  assert.equal(classifyExpected({ groupId: A, ownerGroupId: A, heldByGroupId: A, status: "in_use_owner" }, name).offsite, false);
});

const item = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  equipmentId: "e", code: "CBL-0001", legacyCode: null, name: "Máy hàn", type: "Máy hàn que", expectedNote: null,
  result: null, offsite: false, unexpected: false, ...over,
});

test("sectionOf / summarizeInventory: tiến độ chỉ tính máy cần tìm tại nhóm", () => {
  assert.equal(sectionOf(item()), "pending");
  assert.equal(sectionOf(item({ offsite: true })), "offsite");
  assert.equal(sectionOf(item({ offsite: true, result: "found" })), "found", "máy ở nơi khác nhưng đã xác nhận có mặt");
  assert.equal(sectionOf(item({ result: "missing" })), "missing");
  assert.equal(sectionOf(item({ unexpected: true, result: "found" })), "unexpected");

  const summary = summarizeInventory([
    item({ result: "found" }),
    item({ result: "found" }),
    item({ result: "missing" }),
    item(),
    item({ offsite: true }),
    item({ unexpected: true, result: "found" }),
  ]);
  assert.deepEqual(summary, { total: 6, onsite: 4, checkedOnsite: 3, found: 3, missing: 1, pending: 1, offsitePending: 1, unexpected: 1, progress: 75 });
  assert.equal(summarizeInventory([]).progress, 100);
  assert.equal(summarizeInventory([item({ offsite: true })]).progress, 100, "chỉ có máy ở nơi khác thì không còn gì cần tìm");
});

test("filterChecklist: theo tab và từ khóa không dấu", () => {
  const items = [
    item({ equipmentId: "1", code: "CBL-0001", name: "Máy hàn Jasic", legacyCode: "T-12" }),
    item({ equipmentId: "2", code: "CBL-0002", name: "Máy mài góc", result: "found" }),
    item({ equipmentId: "3", code: "CBL-0003", name: "Palang xích", result: "missing" }),
    item({ equipmentId: "4", code: "CBL-0004", name: "Máy khoan", offsite: true, expectedNote: "Đang cho Nhóm B mượn" }),
    item({ equipmentId: "5", code: "NBS-0009", name: "Bộ nguồn", unexpected: true, result: "found" }),
  ];
  const ids = (list: ChecklistItem[]) => list.map((i) => i.equipmentId);
  assert.deepEqual(ids(filterChecklist(items, "pending", "")), ["1"]);
  assert.deepEqual(ids(filterChecklist(items, "found", "")), ["2"]);
  assert.deepEqual(ids(filterChecklist(items, "missing", "")), ["3"]);
  assert.deepEqual(ids(filterChecklist(items, "offsite", "")), ["4"]);
  assert.deepEqual(ids(filterChecklist(items, "unexpected", "")), ["5"]);
  assert.equal(filterChecklist(items, "all", "").length, 5);
  assert.deepEqual(ids(filterChecklist(items, "all", "may han jasic")), ["1"], "không dấu, nhiều từ");
  assert.deepEqual(ids(filterChecklist(items, "all", "t-12")), ["1"], "tìm theo tem nhôm");
  assert.deepEqual(ids(filterChecklist(items, "all", "nhom b muon")), ["4"], "tìm trong ghi chú");
  assert.deepEqual(ids(filterChecklist(items, "pending", "palang")), [], "tab và từ khóa cùng áp");
});

test("biên bản Excel: tóm tắt ở đầu, các mục theo thứ tự cần chú ý", async () => {
  const detail: InventoryDetail = {
    session: { id: "s", code: "KK-2026-0001", title: "Cuối quý 4", groupId: A, groupName: "Nhóm A", status: "closed", createdAt: new Date("2026-11-01T01:00:00Z"), closedAt: new Date("2026-11-02T01:00:00Z"), createdByName: "Lan", closedByName: "Minh", period: null, autoClosed: false, includesTools: false },
    items: [
      { ...item({ equipmentId: "1", code: "A-1", name: "Máy có mặt", result: "found" }), note: null, checkedByName: "Hùng", checkedAt: new Date("2026-11-01T02:00:00Z"), lossStatus: null },
      { ...item({ equipmentId: "2", code: "A-2", name: "Máy không thấy", result: "missing" }), note: "Hỏi tổ trưởng", checkedByName: "Hùng", checkedAt: new Date("2026-11-01T03:00:00Z"), lossStatus: null },
      { ...item({ equipmentId: "3", code: "A-3", name: "Máy chưa kiểm" }), note: null, checkedByName: null, checkedAt: null, lossStatus: null },
      { ...item({ equipmentId: "4", code: "A-4", name: "Máy thừa", unexpected: true, result: "found" }), note: null, checkedByName: "Hùng", checkedAt: new Date("2026-11-01T04:00:00Z"), lossStatus: null },
      { ...item({ equipmentId: "5", code: "A-5", name: "Máy nơi khác", offsite: true, expectedNote: "Đang cho Nhóm B mượn" }), note: null, checkedByName: null, checkedAt: null, lossStatus: null },
    ],
    tools: [],
    canManage: true,
    canCheck: false,
    canReportLoss: false,
  };
  const bytes = await buildInventoryWorkbook({ generatedAt: new Date("2026-11-12T03:00:00Z"), exportedBy: "Admin", detail });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const ws = wb.getWorksheet("Biên bản kiểm kê")!;
  assert.match(String(ws.getCell(1, 1).value), /KK-2026-0001/);
  assert.match(String(ws.getCell(2, 1).value), /1 không thấy/);
  const headings: string[] = [];
  const codes: string[] = [];
  ws.eachRow((row, n) => {
    if (n <= 4) return;
    const first = String(row.getCell(1).value ?? "");
    if (/\(\d+\)$/.test(first)) headings.push(first);
    else codes.push(String(row.getCell(2).value));
  });
  assert.deepEqual(headings, ["Không thấy (1)", "Chưa kiểm (1)", "Thừa (không có trong danh sách) (1)", "Đang ở nơi khác (chưa xác nhận) (1)", "Có mặt (1)"]);
  assert.deepEqual(codes, ["A-2", "A-3", "A-4", "A-5", "A-1"]);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("schema, update.sql và current_schema.sql khớp nhau cho hai bảng kiểm kê", async () => {
  const schema = await source("src/lib/db/schema.ts");
  assert.match(schema, /pgTable\(\s*"inventory_sessions"/);
  assert.match(schema, /pgTable\(\s*"inventory_items"/);
  for (const file of ["database/update.sql", "database/current_schema.sql"]) {
    const sql = await source(file);
    assert.match(sql, /CREATE TYPE inventory_status AS ENUM \('open','closed'\)/, file);
    assert.match(sql, /CREATE TYPE inventory_result AS ENUM \('found','missing'\)/, file);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS inventory_sessions/, file);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS inventory_items/, file);
    assert.match(sql, /inventory_items_session_equipment_unique/, file);
  }
});

test("thao tác kiểm kê: đúng quyền, khóa khi đã đóng, tối ưu cho điện thoại, hồ sơ máy không vỡ khi thiếu bảng", async () => {
  const action = await source("src/actions/inventory.ts");
  assert.match(action, /canOpenInventory\(auth\)/, "mở đợt tay chỉ Quản lý Xưởng/Admin");
  assert.match(action, /canManageInventory\(auth, session\.groupId\)/, "đóng đợt cần Đốc công trở lên");
  assert.match(action, /canCheckInventory\(auth, session\.groupId\)/);
  assert.match(action, /\.for\("update"\)/, "khóa dòng đợt khi ghi kết quả");
  assert.match(action, /eq\(inventorySessions\.status, "open"\)/, "đóng đợt giữ mẫu UPDATE ... WHERE status");
  assert.match(action, /addIfMissing: false/, "danh sách trong đợt không tự thêm máy lạ");
  assert.match(action, /addIfMissing: true/, "hồ sơ máy (quét QR) được thêm máy thừa");
  assert.match(action, /createInventorySession\(/, "mở đợt đi qua hàm dùng chung với đợt tự động");
  assert.match(await source("src/lib/inventory-create.ts"), /nextWorkflowCode\(tx, "KK"\)/);
  const data = await source("src/lib/inventory-data.ts");
  assert.match(data, /catch \(error\)[\s\S]*return \[\]/, "thiếu bảng kiểm kê thì hồ sơ máy vẫn hiện");
  assert.match(await source("src/app/(app)/equipment/[id]/page.tsx"), /loadInventoryPromptsForMachine\(/);
  assert.match(await source("src/components/sidebar.tsx"), /"\/inventory", "Kiểm kê"/);
  assert.match(await source("src/components/mobile-nav.tsx"), /href="\/inventory"/);
  assert.match(await source("src/app/(app)/inventory/[id]/export/route.ts"), /loadInventoryDetail\(auth, id\)/);
});
