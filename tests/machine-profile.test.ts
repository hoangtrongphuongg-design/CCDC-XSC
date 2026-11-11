import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canSeeFinancials, heldByGroupId, isInMyScope, isUuid } from "../src/lib/machine-profile";

const OWNER = "owner";
const BORROWER = "borrower";
const OTHER = "other";

test("isUuid chỉ nhận UUID đúng dạng (chặn /equipment/export, chuỗi lạ)", () => {
  assert.equal(isUuid("3f2b1c0e-8a4d-4c6e-9b1a-0d2e5f7a9c11"), true);
  assert.equal(isUuid("3F2B1C0E-8A4D-4C6E-9B1A-0D2E5F7A9C11"), true);
  assert.equal(isUuid("export"), false);
  assert.equal(isUuid("3f2b1c0e-8a4d-4c6e-9b1a-0d2e5f7a9c1"), false);
  assert.equal(isUuid("3f2b1c0e-8a4d-4c6e-9b1a-0d2e5f7a9c11; drop"), false);
  assert.equal(isUuid(undefined), false);
});

test("heldByGroupId: chỉ phiếu on_loan / incident mới là nhóm đang giữ máy", () => {
  assert.equal(heldByGroupId([]), null);
  assert.equal(heldByGroupId([{ status: "pending_owner", borrowerGroupId: BORROWER }]), null, "chưa bàn giao");
  assert.equal(heldByGroupId([{ status: "return_requested", borrowerGroupId: BORROWER }]), null, "đã báo trả");
  assert.equal(heldByGroupId([{ status: "on_loan", borrowerGroupId: BORROWER }]), BORROWER);
  assert.equal(heldByGroupId([{ status: "incident", borrowerGroupId: BORROWER }]), BORROWER);
});

test("đơn giá / PO / nhà cung cấp chỉ cho Admin, Quản lý Xưởng hoặc nhóm quản lý máy", () => {
  const base = { isWorkshopAdmin: false, isReadOnlyViewer: false, groupIds: [] as string[], ownerGroupId: OWNER };
  assert.equal(canSeeFinancials({ ...base, isWorkshopAdmin: true }), true);
  assert.equal(canSeeFinancials({ ...base, groupIds: [OWNER] }), true);
  assert.equal(canSeeFinancials({ ...base, groupIds: [OTHER, BORROWER] }), false, "nhóm đang mượn không thấy giá");
  assert.equal(canSeeFinancials(base), false);
  assert.equal(canSeeFinancials({ ...base, isReadOnlyViewer: true, isWorkshopAdmin: true, groupIds: [OWNER] }), false, "người xem toàn xưởng không thấy giá");
});

test("isInMyScope: nhóm chủ hoặc nhóm đang giữ do mượn; Admin/Quản lý Xưởng luôn; Người xem thì không", () => {
  const base = { isReadOnlyViewer: false, isWorkshopAdmin: false, groupIds: [] as string[], ownerGroupId: OWNER, heldByGroupId: null as string | null };
  assert.equal(isInMyScope({ ...base, groupIds: [OWNER] }), true);
  assert.equal(isInMyScope({ ...base, groupIds: [BORROWER], heldByGroupId: BORROWER }), true);
  assert.equal(isInMyScope({ ...base, groupIds: [BORROWER] }), false, "đã trả máy thì không còn trong phạm vi");
  assert.equal(isInMyScope({ ...base, isWorkshopAdmin: true }), true);
  assert.equal(isInMyScope({ ...base, isReadOnlyViewer: true, isWorkshopAdmin: true, groupIds: [OWNER] }), false);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("hồ sơ máy: ai đăng nhập cũng vào được, lịch sử theo quyền, bản nháp chỉ người trong phạm vi; liên kết từ danh sách và tìm kiếm", async () => {
  const page = await source("src/app/(app)/equipment/[id]/page.tsx");
  assert.match(page, /requireUser\(\)/);
  assert.match(page, /machine\.recordStatus !== "active" && !inMyScope/);
  assert.match(page, /history === null/, "không có quyền thì báo chứ không hiện lịch sử");
  const data = await source("src/lib/machine-profile-data.ts");
  assert.match(data, /canViewEquipmentHistory\(/, "dùng chung quy tắc quyền xem lịch sử với tab Lịch sử");
  assert.match(data, /isUuid\(id\)/);
  assert.match(await source("src/app/(app)/equipment/page.tsx"), /href=\{`\/equipment\/\$\{row\.id\}`\}/);
  assert.match(await source("src/app/(app)/search/page.tsx"), /href=\{`\/equipment\/\$\{m\.id\}`\}/);
});
