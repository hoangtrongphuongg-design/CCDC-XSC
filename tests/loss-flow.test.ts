import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOSS_LOAN_STATUSES, canReportLoss, parseLossCircumstances, parseLossQuantity, remainingAfterLoss } from "../src/lib/loss-rule";
import { ACTIVITY_ACTIONS } from "../src/lib/activity-log";
import { EQUIPMENT_STATUS_LABELS } from "../src/lib/constants";
import { equipmentStatusTone } from "../src/lib/status-style";
import { buildMyTasks, type TaskSubject } from "../src/lib/my-tasks";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function fn(code: string, name: string): string {
  const start = code.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `thiếu ${name}`);
  const next = code.indexOf("\nexport async function ", start + 10);
  return code.slice(start, next < 0 ? undefined : next);
}

test("máy được báo mất khi ở nhóm hoặc đang cho mượn; đang sửa / thanh lý / kho / đã mất thì không", () => {
  for (const status of ["in_use_owner", "wait_inspection", "inactive", "on_loan", "return_requested"]) assert.equal(canReportLoss(status), true, status);
  for (const status of ["repairing", "wait_repair_confirm", "wait_disposal", "disposal_warehouse", "wait_handover", "lost"]) assert.equal(canReportLoss(status), false, status);
  assert.deepEqual([...LOSS_LOAN_STATUSES], ["on_loan", "return_requested", "incident"]);
});

test("hoàn cảnh và số lượng mất được kiểm tra", () => {
  assert.equal(parseLossCircumstances("  mất   sau ca đêm ").ok, true);
  assert.deepEqual(parseLossCircumstances("  mất   sau ca đêm "), { ok: true, value: "mất sau ca đêm" });
  assert.equal(parseLossCircumstances("ab").ok, false);
  assert.equal(parseLossCircumstances("").ok, false);
  assert.deepEqual(parseLossQuantity("3", 10), { ok: true, value: 3 });
  assert.deepEqual(parseLossQuantity("2.5", 10), { ok: true, value: 2.5 });
  assert.equal(parseLossQuantity("0", 10).ok, false);
  assert.equal(parseLossQuantity("-1", 10).ok, false);
  assert.equal(parseLossQuantity("abc", 10).ok, false);
  assert.equal(parseLossQuantity("11", 10).ok, false, "vượt tồn");
  assert.equal(parseLossQuantity("1.234", 10).ok, false, "quá 2 chữ số thập phân");
  assert.equal(remainingAfterLoss(10, 3), 7);
  assert.equal(remainingAfterLoss(0.3, 0.1), 0.2, "làm tròn 2 chữ số");
  assert.equal(remainingAfterLoss(1, 5), 0, "không âm");
});

test("trạng thái máy 'Đã mất': nhãn riêng, màu xám, có trong nhật ký", () => {
  assert.equal(EQUIPMENT_STATUS_LABELS.lost, "Đã mất");
  assert.equal(equipmentStatusTone("lost"), "neutral");
  for (const action of ["loss.create", "loss.approve", "loss.reject", "loss.cancel", "loss.apply", "equipment.restore_lost"]) {
    assert.equal(ACTIVITY_ACTIONS[action]?.category, "loss", action);
  }
});

test("tạo phiếu báo mất: máy cần quyền nhóm quản lý / nhóm đang mượn; CCDC kiểm số lượng; đều vào chờ Quản lý Xưởng", async () => {
  const code = await source("src/actions/loss.ts");
  const create = fn(code, "createLossReportAction");
  assert.match(create, /canReportLoss\(item\.status\)/);
  assert.match(create, /hasGroupPermission\(auth, item\.owner_group_id, "operator"\)/);
  assert.match(create, /hasGroupPermission\(auth, loan\.borrowerGroupId, "operator"\)/, "nhóm đang mượn giữ máy cũng báo mất được");
  assert.match(create, /assertEquipmentHasNoOtherOpenWorkflow\(tx, equipmentId, loan \? \{ machineLoanId: loan\.id \} : undefined\)/, "máy đang cho mượn vẫn báo mất được");
  assert.match(create, /status: "pending_ws"/);
  const tool = fn(code, "createToolLossReportAction");
  assert.match(tool, /parseLossQuantity\(formData\.get\("quantity"\), Number\(tool\.quantityOnHand\)\)/);
  assert.match(tool, /status: "pending_ws"/);
});

test("duyệt báo mất: Quản lý Xưởng; máy → Đã mất + đóng phiếu mượn; CCDC trừ tồn; từ chối cần lý do; hủy theo người tạo", async () => {
  const code = await source("src/actions/loss.ts");
  const approve = fn(code, "approveLossAction");
  assert.match(approve, /requireWsManager\(\)/);
  assert.match(approve, /status: "lost"/);
  assert.match(approve, /status: "completed",\s*closedBy: auth\.userId/, "phiếu mượn đang mở tự đóng");
  assert.match(approve, /remainingAfterLoss\(current, qty\)/);
  assert.match(approve, /isActive: remaining > 0/);
  assert.match(approve, /lossId: report\.id/, "không tự chặn bởi chính phiếu báo mất");
  assert.match(approve, /eq\(lossReports\.status, "pending_ws"\)/, "optimistic concurrency");
  const reject = fn(code, "rejectLossAction");
  assert.match(reject, /requireWsManager\(\)/);
  assert.match(reject, /Vui lòng nhập lý do từ chối/);
  assert.match(fn(code, "cancelLossAction"), /report\.reportedBy !== auth\.userId && !auth\.isWorkshopAdmin/);
  const restore = fn(code, "restoreLostEquipmentAction");
  assert.match(restore, /requireWsManager\(\)/);
  assert.match(restore, /status: "wait_inspection"/);
});

test("mã BM, hồ sơ có phiếu báo mất tính là có lịch sử, kiểm kê bỏ máy đã mất", async () => {
  assert.match(await source("src/lib/workflows.ts"), /OPEN_LOSS_STATUSES/);
  assert.match(await source("src/lib/record-history.ts"), /lossReports/);
  assert.match(await source("src/lib/inventory-create.ts"), /ne\(equipment\.status, "lost"\)/);
  assert.match(await source("src/lib/equipment-filter.ts"), /row\.status === "lost"/);
});

test("trang Báo mất: nút đỏ nổi theo quyền tạo, hai bảng, khôi phục máy đã mất; menu Báo mất", async () => {
  const page = await source("src/app/(app)/losses/page.tsx");
  assert.match(page, /buttonLabel="Tạo phiếu báo mất"/);
  assert.match(page, /buttonLabel="Tạo báo mất CCDC số lượng"/);
  assert.match(page, /<TicketTableCard title="Chờ xử lý"/);
  assert.match(page, /<TicketTableCard title="Đã hoàn thành"[^>]*tone="done"/);
  assert.doesNotMatch(page, /side-panel|content-grid/);
  assert.match(page, /restoreLostEquipmentAction/);
  assert.match(await source("src/components/sidebar.tsx"), /\["\/losses", "Báo mất"/);
  const wrappers = await source("src/actions/ticket-forms.ts");
  assert.match(wrappers, /export async function submitLoss\(/);
  assert.match(wrappers, /export async function submitToolLoss\(/);
});

test("việc chờ tôi: chỉ Quản lý Xưởng / Admin có việc duyệt báo mất", () => {
  const base = { id: "l1", code: "BM-1", label: "Máy hàn (A-1)", updatedAt: new Date("2026-11-01T00:00:00Z"), status: "pending_ws", ownerGroupId: "g1", reportedBy: "u2" };
  const input = { loans: [], quickLoans: [], transfers: [], repairs: [], disposals: [], losses: [base], warehouseGroupId: null, groupNames: new Map<string, string>(), today: "2026-11-13" };
  const subject = (over: Partial<TaskSubject>): TaskSubject => ({ userId: "u1", isAdmin: false, isWsManager: false, isReadOnlyViewer: false, permissions: [], ...over }) as TaskSubject;
  assert.deepEqual(buildMyTasks(subject({ isWsManager: true }), input).map((t) => t.key), ["loss-ws:l1"]);
  assert.deepEqual(buildMyTasks(subject({ permissions: [{ groupId: "g1", level: "manager" }] as never }), input), []);
});

test("SQL V1.7.3 khớp schema.ts: enum equipment_status 'lost', loss_reports, inventory_tool_counts, includes_tools", async () => {
  const update = await source("database/update.sql");
  assert.match(update, /ALTER TYPE equipment_status ADD VALUE IF NOT EXISTS 'lost'/);
  assert.match(update, /CREATE TABLE IF NOT EXISTS loss_reports/);
  assert.match(update, /CREATE TABLE IF NOT EXISTS inventory_tool_counts/);
  assert.match(update, /ADD COLUMN IF NOT EXISTS includes_tools boolean NOT NULL DEFAULT false/);
  const current = await source("database/current_schema.sql");
  assert.match(current, /'disposal_warehouse','inactive','lost'/);
  assert.match(current, /CREATE TABLE IF NOT EXISTS loss_reports/);
  const schema = await source("src/lib/db/schema.ts");
  assert.match(schema, /"inactive",\s*"lost"/);
  assert.match(schema, /pgTable\(\s*"loss_reports"/);
  assert.match(schema, /pgTable\(\s*"inventory_tool_counts"/);
  assert.match(schema, /includesTools: boolean\("includes_tools"\)/);
});
