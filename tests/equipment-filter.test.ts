import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EMPTY_FILTERS,
  conditionGroupOf,
  countByCondition,
  equipmentTabOf,
  parseEquipmentTab,
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
  const params = new URLSearchParams({ q: "  máy hàn ", group: G1, condition: "major_damage", category: "CK_HAN_CAT" });
  assert.deepEqual(parseEquipmentFilters(params), { q: "máy hàn", group: G1, condition: "major_damage", category: "CK_HAN_CAT" });
  assert.deepEqual(parseEquipmentFilters({ group: "không-phải-uuid", condition: "x", category: "y", q: ["a", "b"] }), { ...EMPTY_FILTERS, q: "a" });
  assert.deepEqual(parseEquipmentFilters({ status: "repairing" }), EMPTY_FILTERS, "liên kết cũ có ?status= thì bỏ qua tham số này");
  assert.deepEqual(parseEquipmentFilters({}), EMPTY_FILTERS);
});

test("lọc máy: từng bộ lọc và kết hợp", () => {
  const row = { ownerGroupId: G1, condition: "major_damage", categoryCode: "CK_HAN_CAT" };
  assert.equal(matchesEquipmentFilters(row, EMPTY_FILTERS), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, group: G1 }), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, group: G2 }), false);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, condition: "good" }), false);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, category: "CK_HAN_CAT" }), true);
  assert.equal(matchesEquipmentFilters(row, { ...EMPTY_FILTERS, group: G1, condition: "major_damage", category: "KHAC" }), false, "kết hợp: một điều kiện sai là loại");
});

test("lọc Tình trạng theo NHÃN hiển thị: Hư hỏng gồm dữ liệu cũ minor_damage, Chưa đánh giá gồm limited / unknown", () => {
  assert.equal(conditionGroupOf("minor_damage"), "major_damage");
  assert.equal(conditionGroupOf("limited"), "awaiting_assessment");
  assert.equal(conditionGroupOf("unknown"), "awaiting_assessment");
  assert.equal(conditionGroupOf("good"), "good");
  const mk = (condition: string) => ({ ownerGroupId: G1, condition, categoryCode: "KHAC" });
  assert.equal(matchesEquipmentFilters(mk("minor_damage"), { ...EMPTY_FILTERS, condition: "major_damage" }), true);
  assert.equal(matchesEquipmentFilters(mk("unknown"), { ...EMPTY_FILTERS, condition: "awaiting_assessment" }), true);
  assert.equal(matchesEquipmentFilters(mk("major_damage"), { ...EMPTY_FILTERS, condition: "awaiting_assessment" }), false);
  assert.deepEqual(countByCondition([{ condition: "good" }, { condition: "good" }, { condition: "minor_damage" }, { condition: "major_damage" }, { condition: "limited" }]),
    { good: 2, major_damage: 2, awaiting_assessment: 1, irreparable: 0 });
});

test("CCDC theo số lượng chỉ lọc theo nhóm quản lý và nhóm thiết bị; lọc tình trạng thì ẩn bảng", () => {
  const tool = { groupId: G1, categoryCode: "KHAC" };
  assert.equal(matchesToolFilters(tool, { ...EMPTY_FILTERS, group: G1 }), true);
  assert.equal(matchesToolFilters(tool, { ...EMPTY_FILTERS, group: G2 }), false);
  assert.equal(matchesToolFilters(tool, { ...EMPTY_FILTERS, category: "CK_HAN_CAT" }), false);
  assert.equal(filtersHideTools({ ...EMPTY_FILTERS, condition: "good" }), true);
  assert.equal(filtersHideTools({ ...EMPTY_FILTERS, group: G1, category: "KHAC", q: "khoan" }), false);
});

test("mô tả lọc, liên kết bỏ từng bộ lọc và liên kết xuất", () => {
  const filters = { q: "hàn", group: G1, condition: "major_damage", category: "CK_HAN_CAT" };
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, q: "a" }), true);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, q: "a" }, false), false, "ô tìm không tính khi includeSearch = false");
  const labels = describeFilters(filters, { groupName: () => "Nhóm Workshop" }).map((item) => item.text);
  assert.deepEqual(labels.slice(0, 3), ["Từ khóa “hàn”", "Nhóm: Nhóm Workshop", "Tình trạng: Hư hỏng"]);
  assert.equal(labels.length, 4);
  assert.match(labels[3], /^Nhóm thiết bị: .+/);
  assert.equal(buildFilterHref("/equipment", EMPTY_FILTERS), "/equipment");
  assert.equal(buildFilterHref("/equipment/export", { ...EMPTY_FILTERS, group: G1, condition: "good" }), `/equipment/export?group=${G1}&condition=good`);
  assert.equal(buildFilterHref("/equipment", filters, { omit: "condition" }).includes("condition="), false, "thẻ ✕ bỏ đúng một bộ lọc");
  assert.equal(buildFilterHref("/equipment", filters, { omit: "condition" }).includes(`group=${G1}`), true);
  assert.equal(buildFilterHref("/equipment", EMPTY_FILTERS, { override: { condition: "good" } }), "/equipment?condition=good");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("trang và file Excel dùng chung bộ lọc; bảng CCDC theo số lượng ẩn khi lọc tình trạng; không còn ô lọc Trạng thái; một cột Trạng thái, phân trang, tab", async () => {
  const page = await source("src/app/(app)/equipment/page.tsx");
  assert.match(page, /parseEquipmentFilters\(rawParams\)/);
  assert.match(page, /matchesEquipmentFilters\(row, f\)/);
  assert.match(page, /hideTools \? \[\] : toolRows\.filter\(\(tool\) => matchesToolFilters\(tool, filters\)\)/);
  assert.match(page, /action="\/equipment" method="get"/);
  assert.match(page, /<section className="equipment-filter-panel"/, "khung lọc bung sẵn");
  assert.doesNotMatch(page, /equipment-global-search/, "ô tìm kiếm đã có ở thanh trên nên trang không lặp lại");
  const filterForm = page.slice(page.indexOf('<form className="equipment-filter-bar"'), page.indexOf("</form>", page.indexOf('<form className="equipment-filter-bar"')));
  assert.doesNotMatch(filterForm, /<input name="q"/, "khung lọc không còn ô tìm chữ");
  assert.match(filterForm, /Xuất Excel/, "nút Xuất Excel nằm trong khung lọc");
  const header = page.slice(page.indexOf("<PageHeader"), page.indexOf("/>", page.indexOf("<PageHeader")));
  assert.doesNotMatch(header, /Xuất Excel/, "đầu trang không còn nút Xuất Excel");
  assert.doesNotMatch(page, /<details className="equipment-filter-panel"/, "không còn gập");
  assert.match(await source("src/app/ui-current.css"), /\.equipment-filter-panel \{[^}]*border: 2px solid #F08C1A/, "viền cam");
  assert.doesNotMatch(page, /name="status"/, "đã bỏ ô lọc Trạng thái");
  assert.doesNotMatch(page, /stat-card-link|StatCard/, "đã bỏ ô thống kê lọc theo trạng thái");
  assert.match(page, /<EquipmentTabs/, "CCDC theo số lượng là tab");
  assert.match(page, /<Pager info=\{paging\}/, "phân trang");
  assert.match(page, /headers=\{\["Mã hệ thống", "Tem nhôm", "Tên máy", "Nhóm quản lý", "Nhóm đang dùng", "Vị trí", "Trạng thái"\]\}/, "một cột Trạng thái");
  assert.match(page, /conditionGroupOf\(row\.condition\) !== "good"/, "tình trạng chỉ hiện thêm khi không tốt");
  assert.match(page, /buildFilterHref\("\/equipment\/export", filters\)/, "nút Xuất Excel đi theo bộ lọc");
  const route = await source("src/app/(app)/equipment/export/route.ts");
  assert.match(route, /parseEquipmentFilters\(searchParams\)/);
  assert.match(route, /matchesEquipmentFilters\(/);
  assert.match(route, /filtersHideTools\(filters\)/);
});

test("máy thanh lý / đã mất sang tab riêng; mọi trạng thái đều thuộc đúng một danh sách", async () => {
  const { EQUIPMENT_STATUS_LABELS } = await import("../src/lib/constants");
  assert.equal(equipmentTabOf("wait_disposal"), "disposal", "đã tạo phiếu thanh lý");
  assert.equal(equipmentTabOf("disposal_warehouse"), "disposal", "trong Kho thanh lý");
  assert.equal(equipmentTabOf("lost"), "lost");
  for (const status of Object.keys(EQUIPMENT_STATUS_LABELS)) {
    const expected = status === "wait_disposal" || status === "disposal_warehouse" ? "disposal" : status === "lost" ? "lost" : "machines";
    assert.equal(equipmentTabOf(status), expected, status);
  }
  for (const status of ["in_use_owner", "on_loan", "return_requested", "wait_handover", "wait_inspection", "repairing", "wait_repair_confirm", "inactive"]) {
    assert.equal(equipmentTabOf(status), "machines", `${status} ở lại danh sách chính`);
  }
  assert.equal(parseEquipmentTab("lost"), "lost");
  assert.equal(parseEquipmentTab(["disposal", "x"]), "disposal");
  assert.equal(parseEquipmentTab("tools"), "tools");
  assert.equal(parseEquipmentTab("bậy"), "machines");
  assert.equal(parseEquipmentTab(undefined), "machines");
});

test("trang và Excel: danh sách chính không còn máy thanh lý / đã mất; bốn tab; xuất theo tab", async () => {
  const page = await source("src/app/(app)/equipment/page.tsx");
  assert.match(page, /equipmentTabOf\(row\.status\) === "machines"/);
  assert.match(page, /equipmentTabOf\(row\.status\) === "disposal"/);
  assert.match(page, /equipmentTabOf\(row\.status\) === "lost"/);
  assert.match(page, /counts=\{\{ machines: /);
  const route = await source("src/app/(app)/equipment/export/route.ts");
  assert.match(route, /equipmentTabOf\(row\.status\) === listTab/);
  assert.match(route, /listTab !== "machines" \|\| filtersHideTools\(filters\)/, "tab thanh lý / mất không kèm CCDC số lượng");
  assert.match(await source("src/components/equipment-tabs.tsx"), /label: "Thanh lý"[\s\S]*label: "Đã mất"/);
});
