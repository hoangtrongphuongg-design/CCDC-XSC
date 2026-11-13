import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canProposeDisposal } from "../src/lib/disposal-rule";
import { ACTIVITY_ACTIONS } from "../src/lib/activity-log";
import { OPEN_REPAIR_STATUSES } from "../src/lib/workflow-status";
import { WORKFLOW_LABELS } from "../src/lib/constants";
import { workflowTone } from "../src/lib/status-style";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function fn(code: string, name: string): string {
  const start = code.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `thiếu ${name}`);
  const next = code.indexOf("\nexport async function ", start + 10);
  return code.slice(start, next < 0 ? undefined : next);
}

test("máy được đề xuất thanh lý: Hư hỏng hoặc Không thể phục hồi, chưa ở bước khác của vòng đời", () => {
  assert.equal(canProposeDisposal({ status: "wait_inspection", condition: "irreparable" }), true, "máy sửa không được đã về nhóm");
  assert.equal(canProposeDisposal({ status: "wait_inspection", condition: "major_damage" }), true, "nhóm tự xác định hư hỏng nặng");
  assert.equal(canProposeDisposal({ status: "wait_inspection", condition: "minor_damage" }), true, "dữ liệu cũ hiện nhãn Hư hỏng");
  assert.equal(canProposeDisposal({ status: "wait_disposal", condition: "good" }), true, "hồ sơ cũ đã Chờ thanh lý");
  assert.equal(canProposeDisposal({ status: "in_use_owner", condition: "major_damage" }), true);
  assert.equal(canProposeDisposal({ status: "wait_inspection", condition: "good" }), false, "máy Tốt không thanh lý");
  assert.equal(canProposeDisposal({ status: "wait_inspection", condition: "awaiting_assessment" }), false, "chưa đánh giá thì chưa thanh lý");
  for (const status of ["on_loan", "repairing", "wait_repair_confirm", "wait_handover", "disposal_warehouse", "inactive"]) {
    assert.equal(canProposeDisposal({ status, condition: "irreparable" }), false, status);
  }
});

test("luồng thanh lý: không còn bước nhóm xác nhận; tạo phiếu vào thẳng chờ Quản lý Xưởng; nhập kho do Quản lý Xưởng/Admin", async () => {
  const code = await source("src/actions/disposals.ts");
  assert.doesNotMatch(code, /export async function confirm(Tool)?DisposalByGroupAction/);
  assert.match(fn(code, "createDisposalAction"), /status: "pending_ws"/);
  assert.match(fn(code, "createDisposalAction"), /canProposeDisposal\(/);
  assert.match(fn(code, "createToolDisposalAction"), /status: "pending_ws"/);
  assert.match(fn(code, "receiveDisposalWarehouseAction"), /requireWsManager\(\)/);
  assert.doesNotMatch(fn(code, "receiveDisposalWarehouseAction"), /requireGroupPermission/);
  // phiếu cũ pending_group vẫn duyệt được
  assert.match(fn(code, "approveDisposalByWsAction"), /inArray\(disposals\.status, \[\.\.\.AWAITING_WS\]\)/);
  assert.match(fn(code, "approveToolDisposalByWsAction"), /inArray\(toolDisposals\.status, \[\.\.\.AWAITING_WS\]\)/);
});

test("từ chối (Quản lý Xưởng, bắt buộc lý do) và hủy (người tạo / Quản lý Xưởng); máy về Chờ kiểm tra", async () => {
  const code = await source("src/actions/disposals.ts");
  for (const name of ["rejectDisposalAction", "rejectToolDisposalAction"]) {
    const body = fn(code, name);
    assert.match(body, /requireWsManager\(\)/, name);
    assert.match(body, /Vui lòng nhập lý do từ chối/, name);
    assert.match(body, /status: "rejected", rejectionReason: reason/, name);
  }
  for (const name of ["cancelDisposalAction", "cancelToolDisposalAction"]) {
    const body = fn(code, name);
    assert.match(body, /item\.proposedBy !== auth\.userId && !auth\.isWorkshopAdmin/, name);
    assert.match(body, /status: "cancelled"/, name);
  }
  for (const name of ["rejectDisposalAction", "cancelDisposalAction"]) {
    assert.match(fn(code, name), /status: "wait_inspection"/, `${name}: máy về Chờ kiểm tra`);
  }
  for (const action of ["disposal.reject", "disposal.cancel", "tool_disposal.reject", "tool_disposal.cancel", "repair.owner_receive_irreparable"]) {
    assert.ok(action in ACTIVITY_ACTIONS, `${action} chưa khai báo trong ACTIVITY_ACTIONS`);
  }
});

test("máy sửa không được: Quản lý Xưởng kết luận (cả nội bộ), nhóm chủ nhận lại rồi tự tạo phiếu thanh lý", async () => {
  const code = await source("src/actions/repairs.ts");
  const mark = fn(code, "markRepairIrreparableAction");
  assert.match(mark, /requireWsManager\(\)/);
  assert.doesNotMatch(mark, /repairType !== "external"/, "không chỉ cho thuê ngoài");
  assert.match(mark, /status: "wait_owner_receive"/);
  assert.match(mark, /status: "wait_repair_confirm", condition: "irreparable"/);
  const receive = fn(code, "receiveIrreparableByOwnerAction");
  assert.match(receive, /requireGroupPermission\(item\.ownerGroupId, "manager"\)/);
  assert.match(receive, /status: "irreparable"/);
  assert.match(receive, /status: "wait_inspection", condition: "irreparable"/);
  assert.ok((OPEN_REPAIR_STATUSES as readonly string[]).includes("wait_owner_receive"), "phiếu chờ nhận lại là phiếu đang mở");
  assert.equal(WORKFLOW_LABELS.wait_owner_receive, "Chờ nhóm nhận lại (không sửa được)");
  assert.equal(workflowTone("wait_owner_receive"), "warning");
  const page = await source("src/app/(app)/repairs/page.tsx");
  assert.match(page, /markRepairIrreparableAction/);
  assert.match(page, /receiveIrreparableByOwnerAction/);
  assert.match(page, /key="internal-fail"/, "nút Không thể phục hồi cho sửa nội bộ");
});

test("SQL V1.7.2 thêm giá trị enum repair_status và khớp schema.ts", async () => {
  assert.match(await source("database/update.sql"), /ALTER TYPE repair_status ADD VALUE IF NOT EXISTS 'wait_owner_receive'/);
  assert.match(await source("database/current_schema.sql"), /CREATE TYPE repair_status AS ENUM \([^)]*'wait_owner_receive'/);
  assert.match(await source("src/lib/db/schema.ts"), /"wait_owner_confirm",\s*"wait_owner_receive"/);
});

test("trang Thanh lý: Quản lý Xưởng có Duyệt / Từ chối / Xác nhận nhập kho, người tạo có Hủy phiếu, không còn nút Nhóm xác nhận", async () => {
  const page = await source("src/app/(app)/disposals/page.tsx");
  for (const text of ["Quản lý Xưởng duyệt", "Từ chối", "Xác nhận nhập kho", "Hủy phiếu"]) assert.ok(page.includes(text), text);
  assert.doesNotMatch(page, /Nhóm xác nhận/);
  assert.match(page, /rejectionReason/);
  assert.match(page, /DISPOSABLE_CONDITIONS/);
});
