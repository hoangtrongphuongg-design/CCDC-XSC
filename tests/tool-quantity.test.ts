import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterTools, type ToolRow } from "../src/lib/tool-filter";
import { canAdjustToolQuantity, canEditTool, validateQuantityAdjustment, type ToolPermission } from "../src/lib/tool-permissions";

const A = "group-a";
const B = "group-b";

function tool(over: Partial<ToolRow> = {}): ToolRow {
  return {
    id: "t1", code: "NBS-VT-0001", name: "Mũi khoan Ø12", specification: "HSS Ø12", unit: "Cái", quantity: 10,
    categoryCode: "KHAC", equipmentType: "Mũi khoan Ø12", groupId: A, groupCode: "NBS", groupName: "Nhóm NBS",
    condition: "good", currentLocation: "Tủ số 2", notes: null, updatedAt: "2026-11-01T00:00:00.000Z", hasHistory: false,
    ...over,
  };
}

test("lọc CCDC theo số lượng: ô nhóm, nhóm thiết bị và ô tìm kiếm (không phân biệt hoa/thường)", () => {
  const rows = [
    tool(),
    tool({ id: "t2", code: "LO-VT-0002", name: "Taro M20", equipmentType: "Taro M20", specification: "M20", groupId: B, groupCode: "LO", groupName: "Nhóm Lò" }),
    tool({ id: "t3", code: null, name: "Đá mài 125", equipmentType: "Đá mài 125", specification: null, categoryCode: "CK_MAI" }),
  ];
  const ids = (list: ToolRow[]) => list.map((r) => r.id);
  assert.deepEqual(ids(filterTools(rows, { groupId: "all", search: "", categoryCode: "all" })), ["t1", "t2", "t3"]);
  assert.deepEqual(ids(filterTools(rows, { groupId: A, search: "", categoryCode: "all" })), ["t1", "t3"]);
  assert.deepEqual(ids(filterTools(rows, { groupId: "all", search: "TARO", categoryCode: "all" })), ["t2"]);
  assert.deepEqual(ids(filterTools(rows, { groupId: "all", search: "m20", categoryCode: "all" })), ["t2"], "tìm theo quy cách");
  assert.deepEqual(ids(filterTools(rows, { groupId: "all", search: "", categoryCode: "CK_MAI" })), ["t3"]);
  assert.deepEqual(ids(filterTools(rows, { groupId: B, search: "khoan", categoryCode: "all" })), [], "các bộ lọc cùng áp");
});

test("quyền: sửa thông tin từ Kỹ sư giám sát (operator), hiệu chỉnh số lượng từ Đốc công (manager)", () => {
  const perms = (level: ToolPermission["level"]): ToolPermission[] => [{ groupId: A, level }];
  assert.equal(canEditTool(perms("viewer"), A), false, "Công nhân kỹ thuật không sửa");
  assert.equal(canEditTool(perms("operator"), A), true);
  assert.equal(canEditTool(perms("manager"), A), true);
  assert.equal(canEditTool(perms("manager"), B), false, "nhóm khác thì không");
  assert.equal(canAdjustToolQuantity(perms("viewer"), A), false);
  assert.equal(canAdjustToolQuantity(perms("operator"), A), false, "Kỹ sư giám sát chưa được hiệu chỉnh số lượng");
  assert.equal(canAdjustToolQuantity(perms("manager"), A), true);
  assert.equal(canAdjustToolQuantity(perms("manager"), B), false);
  assert.equal(canEditTool([], A), false);
  // Admin / Quản lý Xưởng được cấp bậc manager ở mọi nhóm; Người xem toàn xưởng chỉ viewer.
  assert.equal(canAdjustToolQuantity([{ groupId: A, level: "manager" }, { groupId: B, level: "manager" }], B), true);
  assert.equal(canEditTool([{ groupId: A, level: "viewer" }, { groupId: B, level: "viewer" }], B), false);
});

test("hiệu chỉnh số lượng: số hữu hạn ≥ 0, khác số cũ, lý do tối thiểu 5 ký tự", () => {
  assert.deepEqual(validateQuantityAdjustment({ oldQty: 10, newQty: 8, reason: "  Kiểm kê   thiếu 2 cái " }), { ok: true, reason: "Kiểm kê thiếu 2 cái" });
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: 0, reason: "Hỏng hết rồi" }).ok, true, "về 0 là hợp lệ");
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: -1, reason: "Nhập sai số" }).ok, false);
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: Number.NaN, reason: "Nhập sai số" }).ok, false);
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: Number.POSITIVE_INFINITY, reason: "Nhập sai số" }).ok, false);
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: 10, reason: "Không đổi gì cả" }).ok, false, "trùng số cũ");
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: 10.004, reason: "Không đổi gì cả" }).ok, false, "làm tròn 2 số lẻ vẫn trùng");
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: 9, reason: "   " }).ok, false, "thiếu lý do");
  assert.equal(validateQuantityAdjustment({ oldQty: 10, newQty: 9, reason: "ab c" }).ok, false, "lý do quá ngắn");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Server Action CCDC theo số lượng: đúng bậc quyền, khóa dòng, chống ghi đè, có nhật ký", async () => {
  const actions = await source("src/actions/equipment.ts");
  const update = actions.slice(actions.indexOf("export async function updateQuantityToolAction"), actions.indexOf("export async function adjustToolQuantityAction"));
  const adjust = actions.slice(actions.indexOf("export async function adjustToolQuantityAction"));
  assert.match(update, /requireGroupPermission\(current\.groupId, "operator"\)/);
  assert.match(update, /\.for\("update"\)/);
  assert.match(update, /expectedUpdatedAt/, "chống ghi đè đồng thời theo updatedAt");
  assert.match(update, /action: "tool_catalog\.update"/);
  assert.doesNotMatch(update, /quantityOnHand|purchasePrice/, "sửa thông tin không đụng tới số lượng hay giá");
  assert.match(adjust, /requireGroupPermission\(current\.groupId, "manager"\)/);
  assert.match(adjust, /validateQuantityAdjustment\(/, "bắt buộc lý do");
  assert.match(adjust, /\.for\("update"\)/);
  assert.match(adjust, /eq\(toolCatalog\.quantityOnHand, locked\.quantityOnHand\)/, "chỉ ghi khi số lượng vẫn như lúc đọc");
  assert.match(adjust, /action: "tool_catalog\.adjust_quantity"/);
  assert.match(adjust, /Lý do:/);
});

test("trang Dụng cụ nhóm tôi truyền toolRows; bảng CCDC theo số lượng có nút theo quyền và chỉ ẩn khi lọc riêng cho máy có mã", async () => {
  const page = await source("src/app/(app)/my-equipment/page.tsx");
  assert.match(page, /loadToolRows\(visibleGroupIds\)/);
  assert.match(page, /toolRows=\{toolRows\}/);
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /CCDC quản lý theo số lượng/);
  assert.match(workspace, /!isReadOnlyViewer && canEditTool\(/);
  assert.match(workspace, /!isReadOnlyViewer && canAdjustToolQuantity\(/);
  assert.match(workspace, /machineOnlyFilterActive/);
  assert.doesNotMatch(workspace, /headers=\{\["Mã", "Loại/, "bảng CCDC theo số lượng không có cột Loại");
});

test("form gọn: form thêm máy 6 ô, form sửa bỏ ô ít dùng (nhưng giữ giá trị cũ), CCDC theo số lượng bỏ Đơn giá", async () => {
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  const compactStart = workspace.indexOf('className="asset-form asset-form-compact"');
  assert.ok(compactStart > 0);
  const compactForm = workspace.slice(compactStart, workspace.indexOf("</form>", compactStart));
  for (const gone of ['label="Hãng"', 'label="Đơn giá mua (VNĐ)"', 'label="Ngày đưa vào sử dụng"']) {
    assert.ok(!compactForm.includes(gone), `form thêm máy không còn ${gone}`);
  }
  for (const kept of ['label="Nhóm quản lý"', 'label="Tên CCDC"', 'label="Nhóm thiết bị"', 'label="Tem nhôm / mã đã gán"', 'label="Tình trạng"', 'label="Ghi chú"']) {
    assert.ok(compactForm.includes(kept), `form thêm máy vẫn có ${kept}`);
  }
  // Form đầy đủ: ô đã gỡ thành input ẩn mang giá trị cũ để không bị xóa trắng khi lưu.
  assert.match(workspace, /<input type="hidden" name="commissionYear" defaultValue=\{record\?\.commissionYear \|\| ""\} \/>/);
  assert.match(workspace, /<input type="hidden" name="technicalNote" defaultValue=\{record\?\.technicalNote \|\| ""\} \/>/);
  assert.match(workspace, /<input type="hidden" name="purchaseNote" defaultValue=\{record\?\.purchaseNote \|\| ""\} \/>/);
  assert.match(workspace, /\{!isWorkshopAdmin \? <input type="hidden" name="recordedDate" value=\{defaultRecordedDate\} \/> : null\}/);
  for (const gone of ['label="Năm đưa vào sử dụng"', 'label="Ghi chú kỹ thuật"', 'label="Ghi chú mua sắm"']) {
    assert.ok(!workspace.includes(gone), `form sửa không còn ${gone}`);
  }
  const quantityForm = workspace.slice(workspace.indexOf("function QuantityToolForm"), workspace.indexOf("function AssetForm"));
  assert.ok(!quantityForm.includes("Đơn giá"), "CCDC theo số lượng không còn ô Đơn giá");
  assert.match(quantityForm, /useState\("KHAC"\)/, "Nhóm thiết bị mặc định Khác");
});
