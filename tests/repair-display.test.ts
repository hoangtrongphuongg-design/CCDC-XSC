import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { equipmentStatusDisplay, repairStatusLabel } from "../src/lib/repair-display";

test("phiếu sửa: đang sửa tách nội bộ / thuê ngoài, bước khác dùng nhãn chung", () => {
  assert.equal(repairStatusLabel("repairing", "internal"), "Đang SC nội bộ");
  assert.equal(repairStatusLabel("repairing", null), "Đang SC nội bộ", "chưa ghi loại thì coi là nội bộ");
  assert.equal(repairStatusLabel("repairing", "external"), "Đang thuê ngoài sửa");
  assert.notEqual(repairStatusLabel("pending_acceptance", "external"), "Đang thuê ngoài sửa");
  assert.equal(repairStatusLabel("khong_co", null), "khong_co", "trạng thái lạ giữ nguyên");
});

test("máy đang sửa hiện nội bộ / thuê ngoài theo phiếu; trạng thái khác không bị đổi nhãn", () => {
  assert.equal(equipmentStatusDisplay("repairing", "internal"), "Đang SC nội bộ");
  assert.equal(equipmentStatusDisplay("repairing", "external"), "Đang thuê ngoài sửa");
  assert.equal(equipmentStatusDisplay("repairing", null), "Đang sửa chữa", "không có phiếu thì giữ nhãn chung");
  assert.equal(equipmentStatusDisplay("repairing"), "Đang sửa chữa");
  assert.equal(equipmentStatusDisplay("in_use_owner", "external"), "Sẵn sàng", "máy không phải đang sửa thì bỏ qua loại phiếu");
  assert.equal(equipmentStatusDisplay("wait_repair_confirm", "external"), "Chờ xác nhận sửa");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("tình trạng máy theo phiếu sửa: báo hỏng → Hư hỏng; sửa xong → Tốt; nhóm nhận lại → Sẵn sàng + Tốt", async () => {
  const actions = await source("src/actions/repairs.ts");
  const create = actions.slice(actions.indexOf("export async function createRepairAction"), actions.indexOf("export async function acceptRepairAction"));
  assert.match(create, /status: "wait_inspection", condition: "major_damage"/, "có phiếu báo hỏng thì tình trạng Hư hỏng ngay");
  assert.doesNotMatch(create, /awaiting_assessment/);
  const complete = actions.slice(actions.indexOf("export async function completeRepairAction"), actions.indexOf("export async function sendExternalRepairAction"));
  assert.match(complete, /status: "wait_repair_confirm", condition: "good"/);
  const confirm = actions.slice(actions.indexOf("export async function confirmRepairByOwnerAction"));
  assert.match(confirm, /status: "in_use_owner", condition: "good"/, "Đốc công nhận lại thì máy về Sẵn sàng + Tốt");
  assert.match(actions, /status: "wait_repair_confirm", condition: "irreparable"/);
});

test("các trang dùng chung nhãn sửa nội bộ / thuê ngoài lấy từ phiếu sửa đang mở", async () => {
  const data = await source("src/lib/equipment-data.ts");
  assert.match(data, /repairType: repairs\.repairType/);
  assert.match(await source("src/app/(app)/my-equipment/page.tsx"), /activeRepairType: repair\?\.repairType \|\| null/);
  assert.match(await source("src/components/equipment/equipment-workspace.tsx"), /equipmentStatusDisplay\(row\.status, row\.activeRepairStatus === "repairing" \? row\.activeRepairType : null\)/);
  const all = await source("src/app/(app)/equipment/page.tsx");
  assert.match(all, /equipmentStatusDisplay\(row\.status, repairTypeByEquipment\.get\(row\.id\)\)/);
  assert.match(await source("src/app/(app)/equipment/[id]/page.tsx"), /equipmentStatusDisplay\(machine\.status, activeRepairType\)/);
  assert.match(await source("src/lib/machine-profile-data.ts"), /repairStatusLabel\(r\.status, r\.repairType\)/);
  const repairs = await source("src/app/(app)/repairs/page.tsx");
  assert.match(repairs, /repairStatusLabel\(row\.status, row\.repairType\)/);
  assert.doesNotMatch(repairs, /Đang sửa ngoài|Đang sửa nội bộ/, "nhãn chỉ khai báo ở lib/repair-display.ts");
});
