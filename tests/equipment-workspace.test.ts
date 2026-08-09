import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Dụng cụ nhóm tôi có mã hiện hữu, cấp phát ban đầu và audit hiệu chỉnh Admin", async () => {
  const action = await source("src/actions/equipment.ts");
  assert.match(action, /legacyCode/);
  assert.match(action, /new_purchase/);
  assert.match(action, /equipment\.initial_allocation/);
  assert.match(action, /equipment\.admin_correction/);
  assert.match(action, /correctionReason/);
});

test("mã CCDC được cấp bằng counter DB và đồng bộ với mã đã tồn tại", async () => {
  const workflow = await source("src/lib/workflows.ts");
  assert.match(workflow, /workflow_counters/);
  assert.match(workflow, /greatest\(workflow_counters\.value \+ 1, excluded\.value\)/);
  assert.match(workflow, /return input\.mode === "individual"/);
});

test("giao diện có Lưu & thêm tiếp, sao chép và lịch sử", async () => {
  const ui = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(ui, /Lưu & thêm tiếp/);
  assert.match(ui, /Sao chép để tạo mới/);
  assert.match(ui, /Lịch sử/);
  assert.match(ui, /Mã hiện hữu \/ mã đã gán/);
});

test("migration chỉ bổ sung dữ liệu cho milestone CCDC", async () => {
  const sql = await source("database/update.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS legacy_code/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS origin_group_id/);
  assert.match(sql, /equipment_type_catalog/);
  assert.match(sql, /activity_logs ADD COLUMN IF NOT EXISTS actor_role/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
});
