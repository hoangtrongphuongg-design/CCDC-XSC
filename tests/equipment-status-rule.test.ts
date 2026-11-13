import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isReadyCondition, statusForCondition } from "../src/lib/equipment-status-rule";

test("Sẵn sàng chỉ khi tình trạng Tốt", () => {
  assert.equal(isReadyCondition("good"), true);
  for (const condition of ["major_damage", "awaiting_assessment", "irreparable", "limited", "minor_damage", "unknown"]) {
    assert.equal(isReadyCondition(condition), false, condition);
  }
});

test("Sẵn sàng + tình trạng không Tốt → Chờ kiểm tra; trạng thái khác giữ nguyên", () => {
  assert.equal(statusForCondition("in_use_owner", "good"), "in_use_owner");
  assert.equal(statusForCondition("in_use_owner", "major_damage"), "wait_inspection");
  assert.equal(statusForCondition("in_use_owner", "awaiting_assessment"), "wait_inspection");
  assert.equal(statusForCondition("in_use_owner", "irreparable"), "wait_inspection");
  for (const status of ["wait_inspection", "inactive", "on_loan", "repairing", "wait_disposal", "disposal_warehouse", "wait_handover", "return_requested", "wait_repair_confirm"]) {
    assert.equal(statusForCondition(status, "major_damage"), status, `${status} do quy trình/nhập tay điều khiển, không bị đổi`);
  }
  assert.equal(statusForCondition("wait_inspection", "good"), "wait_inspection", "đổi về Tốt không tự bật Sẵn sàng");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("mọi đường ghi tình trạng / trạng thái đều áp quy tắc; form khóa Sẵn sàng khi tình trạng không Tốt", async () => {
  assert.match(await source("src/lib/equipment-create.ts"), /statusForCondition\("in_use_owner", fields\.condition\)/, "thêm máy + nhập Excel");
  const actions = await source("src/actions/equipment.ts");
  const save = actions.slice(actions.indexOf("export async function saveEquipmentRecordAction"), actions.indexOf("export async function updateEquipmentConditionAction"));
  assert.match(save, /statusForCondition\(nextManualStatus \?\? locked\.status, data\.condition\)/, "sửa máy");
  const condition = actions.slice(actions.indexOf("export async function updateEquipmentConditionAction"), actions.indexOf("export async function createQuantityToolAction"));
  assert.match(condition, /statusForCondition\(locked\.status, condition\)/, "đổi tình trạng riêng");
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /disabled=\{value === "in_use_owner" && !isReadyCondition\(condition\)\}/);
  assert.match(workspace, /setStatus\("wait_inspection"\)/);
});
