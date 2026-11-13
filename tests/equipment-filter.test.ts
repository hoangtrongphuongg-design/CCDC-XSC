import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EMPTY_FILTERS,
  IN_PROCESS,
  buildFilterHref,
  describeFilters,
  filtersHideTools,
  hasActiveFilters,
  matchesEquipmentFilters,
  matchesToolFilters,
  parseEquipmentFilters,
} from "../src/lib/equipment-filter";

const G1 = "3f2b1c0e-8a4d-4c6e-9b1a-0d2e5f7a9c11";
const G2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("đọc bộ lọc từ địa chỉ: giá trị lạ bị bỏ, hỗ trợ cả URLSearchParams và đối tượng", () => {
  const params = new URLSearchParams({ q: "  máy hàn ", group: G1, status: "repairing", condition: "major_damage", category: "CK_HAN_CAT" });
  assert.deepEqual(parseEquipmentFilters(params), { q: "máy hàn", group: G1, status: "repairing", condition: "major_damage", category: "CK_HAN_CAT" });
  assert.deepEqual(parseEquipmentFilters({ group: "không-phải-uuid", status: "bậy", condition: "x", category: "y", q: ["a", "b"] }), { ...EMPTY_FILTERS, q: "a" });
  assert.equal(parseEquipmentFilters({ status: IN_PROCESS }).status, IN_PROCESS);
  assert.deepEqual(parseEquipmentFilters({}), EMPTY_FILTERS);
});

test("lọc máy: từng bộ lọc và kết hợp", () => {
  const row = { ownerGroupId: G1, status: "repairing", condition: "major_damage", categoryCode: "CK_HAN_CAT" };
  assert.equal(matchesEquipmentFilters(row, EMPTY_FILTERS), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, group: G1 }), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, group: G2 }), false);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, status: "repairing" }), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, status: "on_loan" }), false);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, condition: "good" }), false);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, category: "CK_HAN_CAT" }), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, group: G1, status: "repairing", condition: "major_damage", category: "KHAC" }), false, "kết hợp: một điều kiện sai là loại");
});

test("Đang trong quy trình = mọi trạng thái trừ Sẵn sàng và Kho thanh lý (khớp ô thống kê)", () => {
  const f = { ...EMPTY_FILTERS, status: IN_PROCESS };
  const mk = (status: string) => ({ ownerGroupId: G1, status, condition: "good", categoryCode: "KHAC" });
  for (const status of ["on_loan", "repairing", "wait_inspection", "wait_disposal", "wait_handover", "return_requested", "wait_repair_confirm", "inactive"]) {
    assert.equal(matchesEquipmentFilters(mk(status), f), true, status);
  }
  for (const status of ["in_use_owner", "disposal_warehouse"]) assert.equal(matchesEquipmentFilters(mk(status), f), false, status);
});

test("CCDC theo số lượng chỉ lọc theo nhóm quản lý và nhóm thiết bị; lọc trạng thái / tình trạng thì ẩn bảng", () => {
  const tool = { groupId: G1, categoryCode: "KHAC" };
  assert.equal(matchesToolFilters(tool, { ...EMPTY_FILTERS, group: G1 }), true);
  assert.equal(matchesToolFilters(tool, { ...EMPTY_FILTERS, group: G2 }), false);
  assert.equal(matchesToolFilters(tool, { ...EMPTY_FILTERS, category: "CK_HAN_CAT" }), false);
  assert.equal(filtersHideTools({ ...EMPTY_FILTERS, status: "repairing" }), true);
  assert.equal(filtersHideTools({ ...EMPTY_FILTERS, condition: "good" }), true);
  assert.equal(filtersHideTools({ ...EMPTY_FILTERS, group: G1, category: "KHAC", q: "khoan" }), false);
});

test("mô tả lọc, liên kết bỏ từng bộ lọc và liên kết xuất", () => {
  const filters = { q: "hàn", group: G1, status: IN_PROCESS, condition: "major_damage", category: "CK_HAN_CAT" };
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, q: "a" }), true);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, q: "a" }, false), false, "ô tìm không tính khi includeSearch = false");
  const labels = describeFilters(filters, { groupName: () => "Nhóm Workshop" }).map((item) => item.text);
  assert.deepEqual(labels.slice(0, 4), ["Từ khóa “hàn”", "Nhóm: Nhóm Workshop", "Trạng thái: Đang trong quy trình", "Tình trạng: Hư hỏng"]);
  assert.equal(labels.length, 5);
  assert.match(labels[4], /^Nhóm thiết bị: .+/);
  assert.equal(buildFilterHref("/equipment", EMPTY_FILTERS), "/equipment");
  assert.equal(buildFilterHref("/equipment/export", { ...EMPTY_FILTERS, group: G1, status: "repairing" }), `/equipment/export?group=${G1}&status=repairing`);
  assert.equal(buildFilterHref("/equipment", filters, { omit: "status" }).includes("status="), false, "thẻ ✕ bỏ đúng một bộ lọc");
  assert.equal(buildFilterHref("/equipment", filters, { omit: "status" }).includes(`group=${G1}`), true);
  assert.equal(buildFilterHref("/equipment", EMPTY_FILTERS, { override: { status: "in_use_owner" } }), "/equipment?status=in_use_owner");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("trang và file Excel dùng chung bộ lọc; bảng CCDC theo số lượng ẩn khi lọc trạng thái / tình trạng; ô thống kê bấm được", async () => {
  const page = await source("src/app/(app)/equipment/page.tsx");
  assert.match(page, /parseEquipmentFilters\(await searchParams\)/);
  assert.match(page, /matchesEquipmentFilters\(row, filters\)/);
  assert.match(page, /hideTools \? \[\] : toolRows\.filter\(\(tool\) => matchesToolFilters\(tool, filters\)\)/);
  assert.match(page, /action="\/equipment" method="get"/);
  assert.match(page, /<section className="equipment-filter-panel"/, "khung lọc bung sẵn");
  assert.doesNotMatch(page, /<details className="equipment-filter-panel"/, "không còn gập");
  assert.match(await source("src/app/ui-current.css"), /\.equipment-filter-panel \{[^}]*border: 2px solid #F08C1A/, "viền cam");
  assert.match(page, /className=\{`stat-card-link/);
  assert.match(page, /buildFilterHref\("\/equipment\/export", filters\)/, "nút Xuất Excel đi theo bộ lọc");
  const route = await source("src/app/(app)/equipment/export/route.ts");
  assert.match(route, /parseEquipmentFilters\(new URL\(request\.url\)\.searchParams\)/);
  assert.match(route, /matchesEquipmentFilters\(/);
  assert.match(route, /filtersHideTools\(filters\)/);
});
