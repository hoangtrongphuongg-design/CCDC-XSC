import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMyTasks,
  countBySection,
  formatBadge,
  isGroupMember,
  type MyTaskInput,
  type TaskSubject,
} from "../src/lib/my-tasks";

const A = "group-a";
const B = "group-b";
const KHO = "group-kho";
const ME = "user-me";
const OTHER = "user-other";
const AT = new Date("2026-11-01T03:00:00Z");

function subject(over: Partial<TaskSubject> & { perms?: Array<[string, "viewer" | "operator" | "manager"]> } = {}): TaskSubject {
  const { perms = [], ...rest } = over;
  return {
    userId: ME,
    isAdmin: false,
    isWsManager: false,
    isReadOnlyViewer: false,
    permissions: perms.map(([groupId, level]) => ({ groupId, groupCode: groupId, groupName: groupId, level, isPrimary: false })),
    ...rest,
  };
}

function input(over: Partial<MyTaskInput> = {}): MyTaskInput {
  return {
    loans: [], quickLoans: [], transfers: [], repairs: [], disposals: [],
    warehouseGroupId: KHO,
    groupNames: new Map([[A, "Nhóm A"], [B, "Nhóm B"], [KHO, "Kho thanh lý"]]),
    today: "2026-11-12",
    ...over,
  };
}

const base = { id: "x", code: "PM-1", label: "Máy hàn (CBL-0001)", updatedAt: AT };
const keys = (tasks: ReturnType<typeof buildMyTasks>) => tasks.map((t) => t.key.split(":")[0]).sort();

test("mượn máy: nhóm cho mượn (operator+) thấy việc duyệt, người tạo phiếu thì không", () => {
  const loans = [{ ...base, status: "pending_owner", ownerGroupId: A, borrowerGroupId: B, requestedBy: OTHER, expectedReturnDate: "2026-12-01" }];
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[A, "operator"]] }), input({ loans }))), ["loan-approve"]);
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[A, "viewer"]] }), input({ loans }))), [], "viewer không duyệt được");
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[B, "manager"]] }), input({ loans }))), [], "nhóm mượn không duyệt");
  const own = [{ ...loans[0], requestedBy: ME }];
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[A, "manager"]] }), input({ loans: own }))), [], "không tự duyệt phiếu của mình");
});

test("mượn máy: chờ nhận lại là việc của nhóm cho mượn; quá hạn là việc của nhóm đang mượn", () => {
  const returnRequested = [{ ...base, status: "return_requested", ownerGroupId: A, borrowerGroupId: B, requestedBy: OTHER, expectedReturnDate: "2026-12-01" }];
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[A, "operator"]] }), input({ loans: returnRequested }))), ["loan-return"]);
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[B, "operator"]] }), input({ loans: returnRequested }))), []);

  const overdue = [{ ...base, status: "on_loan", ownerGroupId: A, borrowerGroupId: B, requestedBy: OTHER, expectedReturnDate: "2026-11-10" }];
  const mine = buildMyTasks(subject({ perms: [[B, "viewer"]] }), input({ loans: overdue }));
  assert.deepEqual(keys(mine), ["loan-overdue"]);
  assert.equal(mine[0].tone, "red");
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[A, "manager"]] }), input({ loans: overdue }))), [], "nhóm cho mượn không phải người cần trả");
  const notYet = [{ ...overdue[0], expectedReturnDate: "2026-11-12" }];
  assert.deepEqual(keys(buildMyTasks(subject({ perms: [[B, "viewer"]] }), input({ loans: notYet }))), [], "đúng hạn hôm nay chưa tính quá hạn");
});

test("mượn nhanh: duyệt / xác nhận đã nhận / nhận lại / quá hạn", () => {
  const row = { ...base, code: "CM-1", label: "Cờ lê × 2 cái", sourceGroupId: A, borrowerGroupId: B, requestedBy: OTHER, expectedReturnAt: null as Date | null };
  const run = (status: string, perms: Array<[string, "viewer" | "operator" | "manager"]>, extra: Partial<typeof row> = {}) =>
    keys(buildMyTasks(subject({ perms }), input({ quickLoans: [{ ...row, status, ...extra }] })));
  assert.deepEqual(run("pending_approval", [[A, "operator"]]), ["quick-approve"]);
  assert.deepEqual(run("pending_approval", [[A, "operator"]], { requestedBy: ME }), []);
  assert.deepEqual(run("pending_receipt", [[B, "viewer"]]), ["quick-receipt"]);
  assert.deepEqual(run("pending_receipt", [[A, "manager"]]), []);
  assert.deepEqual(run("return_reported", [[A, "operator"]]), ["quick-return"]);
  assert.deepEqual(run("borrowed", [[B, "viewer"]], { expectedReturnAt: new Date("2026-11-10T03:00:00Z") }), ["quick-overdue"]);
  assert.deepEqual(run("borrowed", [[B, "viewer"]], { expectedReturnAt: new Date("2026-11-20T03:00:00Z") }), []);
  assert.deepEqual(run("borrowed", [[B, "viewer"]]), [], "không hạn trả thì không quá hạn");
});

test("điều chuyển: đối ứng, Quản lý Xưởng duyệt, bàn giao rồi nhận", () => {
  const row = { ...base, code: "DC-1", sourceGroupId: A, targetGroupId: B, proposedBy: OTHER, handedOver: false };
  const run = (status: string, s: TaskSubject, extra: Partial<typeof row> = {}) =>
    keys(buildMyTasks(s, input({ transfers: [{ ...row, status, ...extra }] })));

  assert.deepEqual(run("pending_target", subject({ perms: [[B, "manager"]] })), ["transfer-counterpart"]);
  assert.deepEqual(run("pending_target", subject({ perms: [[A, "manager"]] })), [], "nhóm giao chưa đến lượt");
  assert.deepEqual(run("pending_target", subject({ perms: [[B, "operator"]] })), [], "cần bậc manager");
  assert.deepEqual(run("pending_target", subject({ perms: [[B, "manager"]] }), { proposedBy: ME }), [], "người đề nghị không tự đồng ý");
  assert.deepEqual(run("pending_source", subject({ perms: [[A, "manager"]] })), ["transfer-counterpart"]);

  assert.deepEqual(run("pending_ws", subject({ isWsManager: true })), ["transfer-ws"]);
  assert.deepEqual(run("pending_ws", subject({ isAdmin: true })), ["transfer-ws"]);
  assert.deepEqual(run("pending_ws", subject({ perms: [[A, "manager"]] })), []);

  assert.deepEqual(run("wait_handover", subject({ perms: [[A, "manager"]] })), ["transfer-handover"]);
  assert.deepEqual(run("wait_handover", subject({ perms: [[B, "manager"]] })), []);
  assert.deepEqual(run("wait_handover", subject({ perms: [[B, "manager"]] }), { handedOver: true }), ["transfer-receipt"]);
  assert.deepEqual(run("wait_handover", subject({ perms: [[A, "manager"]] }), { handedOver: true }), []);
});

test("sửa chữa: Quản lý Xưởng tiếp nhận, nhóm chủ nhận lại; đang sửa không tính", () => {
  const row = { ...base, code: "SC-1", ownerGroupId: A };
  const run = (status: string, s: TaskSubject) => keys(buildMyTasks(s, input({ repairs: [{ ...row, status }] })));
  assert.deepEqual(run("pending_acceptance", subject({ isWsManager: true })), ["repair-accept"]);
  assert.deepEqual(run("pending_acceptance", subject({ perms: [[A, "manager"]] })), []);
  assert.deepEqual(run("repairing", subject({ isWsManager: true })), []);
  assert.deepEqual(run("wait_owner_confirm", subject({ perms: [[A, "manager"]] })), ["repair-confirm"]);
  assert.deepEqual(run("wait_owner_confirm", subject({ perms: [[A, "operator"]] })), []);
  assert.deepEqual(run("wait_owner_confirm", subject({ isWsManager: true })), [], "Quản lý Xưởng không phải nhóm chủ");
});

test("thanh lý: nhóm xác nhận, Quản lý Xưởng duyệt, Kho thanh lý nhập kho", () => {
  const row = { ...base, code: "TL-1", ownerGroupId: A, proposedBy: OTHER };
  const run = (status: string, s: TaskSubject, extra: Partial<typeof row> = {}) =>
    keys(buildMyTasks(s, input({ disposals: [{ ...row, status, ...extra }] })));
  assert.deepEqual(run("pending_group", subject({ perms: [[A, "manager"]] })), ["disposal-group"]);
  assert.deepEqual(run("pending_group", subject({ perms: [[A, "manager"]] }), { proposedBy: ME }), [], "người đề xuất không tự xác nhận");
  assert.deepEqual(run("pending_group", subject({ perms: [[A, "operator"]] })), []);
  assert.deepEqual(run("pending_ws", subject({ isWsManager: true })), ["disposal-ws"]);
  assert.deepEqual(run("pending_ws", subject({ perms: [[A, "manager"]] })), []);
  assert.deepEqual(run("wait_warehouse", subject({ perms: [[KHO, "operator"]] })), ["disposal-warehouse"]);
  assert.deepEqual(run("wait_warehouse", subject({ perms: [[KHO, "viewer"]] })), []);
  assert.deepEqual(run("wait_warehouse", subject({ perms: [[A, "manager"]] })), []);
  assert.deepEqual(buildMyTasks(subject({ perms: [[KHO, "operator"]] }), input({ warehouseGroupId: null, disposals: [{ ...row, status: "wait_warehouse" }] })), []);
});

test("Admin / Quản lý Xưởng không tự có việc của mọi nhóm; Người xem toàn xưởng không có việc nào", () => {
  const all = input({
    loans: [{ ...base, status: "pending_owner", ownerGroupId: A, borrowerGroupId: B, requestedBy: OTHER, expectedReturnDate: "2026-12-01" }],
    transfers: [{ ...base, status: "pending_target", sourceGroupId: A, targetGroupId: B, proposedBy: OTHER, handedOver: false }],
    repairs: [{ ...base, status: "pending_acceptance", ownerGroupId: A }],
  });
  assert.deepEqual(keys(buildMyTasks(subject({ isWsManager: true }), all)), ["repair-accept"]);
  assert.deepEqual(keys(buildMyTasks(subject({ isAdmin: true }), all)), ["repair-accept"]);
  assert.deepEqual(buildMyTasks(subject({ isReadOnlyViewer: true, isWsManager: true, perms: [[A, "manager"]] }), all), []);
  assert.equal(isGroupMember(subject({ isReadOnlyViewer: true, perms: [[A, "manager"]] }), A, "viewer"), false);
  assert.equal(isGroupMember(subject({ perms: [[A, "manager"]] }), null, "viewer"), false);
});

test("đếm theo mục menu, sắp việc chờ lâu nhất lên đầu, huy hiệu 99+", () => {
  const s = subject({ isWsManager: true, perms: [[A, "manager"], [B, "manager"]] });
  const tasks = buildMyTasks(s, input({
    loans: [{ ...base, id: "l1", status: "pending_owner", ownerGroupId: A, borrowerGroupId: B, requestedBy: OTHER, expectedReturnDate: "2026-12-01", updatedAt: new Date("2026-11-05T00:00:00Z") }],
    transfers: [{ ...base, id: "t1", status: "pending_ws", sourceGroupId: A, targetGroupId: B, proposedBy: OTHER, handedOver: false, updatedAt: new Date("2026-11-02T00:00:00Z") }],
    repairs: [{ ...base, id: "r1", status: "pending_acceptance", ownerGroupId: A, updatedAt: new Date("2026-11-03T00:00:00Z") }],
    disposals: [{ ...base, id: "d1", status: "pending_group", ownerGroupId: A, proposedBy: OTHER, updatedAt: new Date("2026-11-04T00:00:00Z") }],
  }));
  assert.deepEqual(tasks.map((t) => t.section), ["transfers", "repairs", "disposals", "loans"]);
  assert.deepEqual(countBySection(tasks), { loans: 1, transfers: 1, repairs: 1, disposals: 1 });
  assert.equal(new Set(tasks.map((t) => t.key)).size, tasks.length, "key không trùng");
  assert.equal(formatBadge(7), "7");
  assert.equal(formatBadge(99), "99");
  assert.equal(formatBadge(100), "99+");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("chuông và menu dùng số việc chờ thật, không còn chấm đỏ giả", async () => {
  const layout = await source("src/app/(app)/layout.tsx");
  assert.match(layout, /loadMyTasks\(auth\)/);
  assert.match(layout, /taskCounts=\{countBySection\(tasks\)\}/);
  const topbar = await source("src/components/topbar.tsx");
  assert.match(topbar, /href="\/dashboard#viec-cho-toi"/);
  assert.doesNotMatch(topbar, /notification-dot/);
  assert.match(await source("src/components/sidebar.tsx"), /nav-badge/);
  assert.match(await source("src/components/mobile-nav.tsx"), /mobile-nav-badge/);
  assert.match(await source("src/app/(app)/dashboard/page.tsx"), /id="viec-cho-toi"/);
});
