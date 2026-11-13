import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canChangeIdentity,
  changedIdentityFields,
  foldIdentityText,
  legacyConflictMessage,
  normalizeLegacyCode,
} from "../src/lib/equipment-identity";

const before = { name: "Máy hàn MIG Panasonic", equipmentType: "Máy hàn MIG/MAG", categoryCode: "CK_HAN_CAT" };

test("danh tính: đổi Tên / Nhóm thiết bị / Loại được nhận ra; chỉ khác hoa-thường hay khoảng trắng thì không tính là đổi", () => {
  assert.deepEqual(changedIdentityFields(before, { ...before }), []);
  assert.deepEqual(changedIdentityFields(before, { ...before, name: "  máy  hàn mig panasonic " }), [], "hoa/thường + khoảng trắng");
  assert.deepEqual(changedIdentityFields(before, { ...before, name: "Máy khoan từ" }), ["Tên"]);
  assert.deepEqual(changedIdentityFields(before, { ...before, categoryCode: "KHAC" }), ["Nhóm thiết bị"]);
  assert.deepEqual(changedIdentityFields(before, { ...before, equipmentType: "Máy cắt plasma" }), ["Loại"]);
  assert.deepEqual(changedIdentityFields(before, { name: "Pa lăng", equipmentType: "Pa lăng xích", categoryCode: "KHAC" }), ["Tên", "Nhóm thiết bị", "Loại"]);
  assert.notEqual(foldIdentityText("Máy hàn"), foldIdentityText("May han"), "vẫn phân biệt dấu");
});

test("chỉ Quản lý Xưởng / Admin đổi được danh tính; Người xem thì không kể cả cờ Admin", () => {
  const none = { isAdmin: false, isWsManager: false, isReadOnlyViewer: false };
  assert.equal(canChangeIdentity({ ...none, isAdmin: true }), true);
  assert.equal(canChangeIdentity({ ...none, isWsManager: true }), true);
  assert.equal(canChangeIdentity(none), false, "Đốc công / Kỹ sư / Công nhân");
  assert.equal(canChangeIdentity({ ...none, isAdmin: true, isReadOnlyViewer: true }), false);
});

test("tem nhôm: so khớp không phân biệt hoa/thường và khoảng trắng; tem của máy đã thanh lý có thông báo riêng", () => {
  assert.equal(normalizeLegacyCode("  MH-05 "), "mh-05");
  assert.equal(normalizeLegacyCode("mh  05"), normalizeLegacyCode("MH 05"));
  assert.equal(normalizeLegacyCode(null), "");
  assert.match(legacyConflictMessage("MH-05", { code: "NBS-0003", status: "disposal_warehouse" }), /đã thanh lý NBS-0003, không dùng lại/);
  assert.match(legacyConflictMessage("MH-05", { code: "NBS-0003", status: "disposal_warehouse" }), /Quản lý Xưởng xóa tem/);
  assert.match(legacyConflictMessage("MH-05", { code: "NBS-0004", status: "in_use_owner" }), /đang gắn cho máy NBS-0004/);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("backend máy có mã: chặn đổi danh tính với người thường, Admin phải có lý do, tem nhôm trùng bị chặn cứng", async () => {
  const actions = await source("src/actions/equipment.ts");
  const save = actions.slice(actions.indexOf("export async function saveEquipmentRecordAction"), actions.indexOf("export async function updateEquipmentConditionAction"));
  assert.match(save, /changedIdentityFields\(before, data\)/);
  assert.match(save, /changedIdentity\.length && !canChangeIdentity\(auth\)/, "người thường bị từ chối ở máy chủ");
  assert.match(save, /const changedSensitive = changedIdentity\.length > 0/, "Admin đổi danh tính thì bắt buộc correctionReason");
  assert.match(save, /assertLegacyCodeFree\(data\.legacyCode \?\? "", before\.id\)/, "sửa: chỉ kiểm khi tem đổi");
  assert.match(save, /if \(data\.legacyCode\) await assertLegacyCodeFree\(data\.legacyCode\)/, "thêm mới luôn kiểm tem");
  assert.doesNotMatch(save, /findDuplicateWarning\(\{[^}]*legacyCode/, "tem không còn là cảnh báo 'vẫn lưu'");
});

test("CCDC theo số lượng: Tên + Nhóm thiết bị khóa với người thường, đổi phải có lý do và ghi nhật ký", async () => {
  const actions = await source("src/actions/equipment.ts");
  const update = actions.slice(actions.indexOf("export async function updateQuantityToolAction"), actions.indexOf("export async function adjustToolQuantityAction"));
  assert.match(update, /!canChangeIdentity\(auth\)/);
  assert.match(update, /identityReason\.length < 5/);
  assert.match(update, /reason: changedIdentity\.length \? identityReason : null/);
  const dialog = await source("src/components/equipment/tool-dialogs.tsx");
  assert.match(dialog, /readOnly=\{!canChangeIdentity\}/);
  assert.match(dialog, /name="identityReason"/);
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /canChangeIdentity=\{isWorkshopAdmin && !isReadOnlyViewer\}/);
});

test("form sửa máy: ô Tên / Nhóm thiết bị / Loại chỉ đọc cho người thường nhưng vẫn gửi giá trị cũ", async () => {
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /const identityLocked = isEditing && !isWorkshopAdmin;/);
  assert.match(workspace, /readOnly=\{identityLocked\}/);
  assert.match(workspace, /\{identityLocked \? <input type="hidden" name="categoryCode" value=\{categoryCode\} \/> : null\}/);
  assert.match(workspace, /disabled=\{identityLocked\}/);
});
