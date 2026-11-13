import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canDeleteRecord, hasDeletePermission } from "../src/lib/delete-rule";

const base = { isReadOnlyViewer: false, isWorkshopAdmin: false };

test("quyền xóa: Kỹ sư giám sát trở lên của nhóm quản lý; Quản lý Xưởng / Admin mọi nhóm; còn lại không", () => {
  assert.equal(hasDeletePermission({ ...base, level: "operator" }), true, "Kỹ sư giám sát nhóm mình");
  assert.equal(hasDeletePermission({ ...base, level: "manager" }), true, "Đốc công nhóm mình");
  assert.equal(hasDeletePermission({ ...base, level: "viewer" }), false, "Công nhân kỹ thuật");
  assert.equal(hasDeletePermission({ ...base, level: null }), false, "nhóm khác / không thuộc nhóm");
  assert.equal(hasDeletePermission({ ...base, isWorkshopAdmin: true, level: null }), true, "Quản lý Xưởng / Admin mọi nhóm");
  assert.equal(hasDeletePermission({ isReadOnlyViewer: true, isWorkshopAdmin: false, level: "manager" }), false, "Người xem");
  assert.equal(hasDeletePermission({ isReadOnlyViewer: true, isWorkshopAdmin: true, level: "manager" }), false, "Người xem kể cả mang cờ Admin");
});

test("đã có lịch sử (mượn – trả, kiểm kê…) thì không ai xóa được, kể cả Quản lý Xưởng / Admin", () => {
  for (const input of [
    { ...base, level: "operator" as const },
    { ...base, level: "manager" as const },
    { ...base, isWorkshopAdmin: true, level: null },
  ]) {
    assert.equal(canDeleteRecord({ ...input, hasHistory: false }), true);
    assert.equal(canDeleteRecord({ ...input, hasHistory: true }), false);
  }
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Server Action xóa: kiểm quyền, khóa dòng, kiểm lịch sử TRONG transaction trước khi xóa, ghi nhật ký ảnh chụp", async () => {
  const actions = await source("src/actions/equipment.ts");
  const machine = actions.slice(actions.indexOf("export async function deleteEquipmentAction"), actions.indexOf("export async function deleteToolAction"));
  const tool = actions.slice(actions.indexOf("export async function deleteToolAction"));
  assert.match(machine, /hasDeletePermission\(/);
  assert.match(machine, /await lockEquipment\(tx, equipmentId\);\s*if \(await equipmentHasHistory\(equipmentId, tx\)\) throw/);
  assert.ok(machine.indexOf("equipmentHasHistory") < machine.indexOf("tx.delete(equipment)"), "kiểm lịch sử trước khi xóa");
  assert.match(machine, /action: "equipment\.delete"/);
  assert.match(machine, /beforeData: item/);
  assert.match(machine, /isForeignKeyViolation\(error\)/);
  assert.match(tool, /hasDeletePermission\(/);
  assert.match(tool, /\.for\("update"\)/);
  assert.ok(tool.indexOf("toolHasHistory") < tool.indexOf("tx.delete(toolCatalog)"));
  assert.match(tool, /action: "tool_catalog\.delete"/);
  const log = await source("src/lib/activity-log.ts");
  assert.match(log, /"equipment\.delete": \{ label: "Xóa hồ sơ tạo nhầm", category: "ccdc" \}/);
  assert.match(log, /"tool_catalog\.delete"/);
});

test("lịch sử: máy tính cả dòng kiểm kê; CCDC tính mượn nhanh + thanh lý", async () => {
  const history = await source("src/lib/record-history.ts");
  for (const table of ["machineLoans", "transfers", "repairs", "disposals", "inventoryItems"]) assert.match(history, new RegExp(`from\\(${table}\\)`));
  for (const table of ["quickLoans", "toolDisposals"]) assert.match(history, new RegExp(`from\\(${table}\\)`));
});

test("giao diện: nút Xóa chỉ hiện khi canDeleteRecord đúng, kèm hộp thoại xác nhận; cờ hasHistory đi từ server", async () => {
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /canDeleteRecord\(\{ isReadOnlyViewer, isWorkshopAdmin, level: levelAt\(row\.ownerGroupId\), hasHistory: row\.hasHistory \}\)/);
  assert.match(workspace, /canDelete=\{machineCanDelete\(detailRecord\)\}/);
  assert.match(workspace, /toolCanDelete\(tool\) \?/);
  assert.match(workspace, /<DeleteRecordDialog/);
  assert.match(await source("src/app/(app)/my-equipment/page.tsx"), /hasHistory: historyIds\.has\(row\.id\)/);
  assert.match(await source("src/lib/equipment-data.ts"), /hasHistory: withHistory\.has\(row\.id\)/);
});
