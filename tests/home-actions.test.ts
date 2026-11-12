import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOME_ACTION_LIMIT, buildHomeActions, greetingFor, kpiLinks, shortName, type HomeSubject } from "../src/lib/home-actions";

function subject(over: Partial<HomeSubject> & { perms?: Array<"viewer" | "operator" | "manager"> } = {}): HomeSubject {
  const { perms = [], ...rest } = over;
  return {
    isAdmin: false, isWsManager: false, isReadOnlyViewer: false,
    permissions: perms.map((level, i) => ({ groupId: `g${i}`, groupCode: `G${i}`, groupName: `Nhóm ${i}`, level, isPrimary: i === 0 })),
    ...rest,
  };
}
const keys = (s: HomeSubject, pending = 0) => buildHomeActions(s, { pendingTasks: pending }).map((a) => a.key);

test("nút hành động theo vai trò", () => {
  assert.deepEqual(keys(subject({ perms: ["viewer"] })), ["loan", "return", "inventory", "search"], "Công nhân kỹ thuật: không có Báo hỏng");
  assert.deepEqual(keys(subject({ perms: ["operator"] })), ["loan", "return", "repair", "search"]);
  assert.deepEqual(keys(subject({ perms: ["viewer", "manager"] })), ["approve", "loan", "repair", "inventory"], "Đốc công: duyệt đầu tiên");
  assert.deepEqual(keys(subject({ isWsManager: true })), ["approve", "report", "inventory", "search"]);
  assert.deepEqual(keys(subject({ isAdmin: true })), ["approve", "report", "inventory", "import"], "Admin có thêm Nhập máy từ Excel");
  assert.deepEqual(keys(subject({ isReadOnlyViewer: true, isAdmin: true, perms: ["manager"] })), ["search", "equipment", "report"], "Người xem toàn xưởng không có nút ghi");
  assert.deepEqual(keys(subject()), ["search"], "chưa được gán nhóm");
  for (const s of [subject({ perms: ["manager"] }), subject({ isAdmin: true }), subject({ perms: ["operator"] })]) assert.ok(buildHomeActions(s, { pendingTasks: 0 }).length <= HOME_ACTION_LIMIT);
});

test("nút 'Việc chờ xử lý' mang số việc đang chờ; mọi nút có đường dẫn nội bộ", () => {
  const withTasks = buildHomeActions(subject({ perms: ["manager"] }), { pendingTasks: 3 })[0];
  assert.equal(withTasks.key, "approve");
  assert.equal(withTasks.badge, 3);
  assert.match(withTasks.hint, /3 việc/);
  assert.equal(buildHomeActions(subject({ perms: ["manager"] }), { pendingTasks: 0 })[0].badge, undefined);
  for (const s of [subject({ perms: ["viewer"] }), subject({ isAdmin: true }), subject({ isReadOnlyViewer: true })]) {
    for (const action of buildHomeActions(s, { pendingTasks: 1 })) assert.match(action.href, /^(\/|#)/, `${action.key}: ${action.href}`);
  }
});

test("đường dẫn ô số liệu theo vai trò", () => {
  const member = kpiLinks(subject({ perms: ["viewer"] }));
  assert.deepEqual(member, { tasks: "#viec-cho-toi", total: "/my-equipment", ready: "/my-equipment", loans: "/machine-loans", repairs: "/repairs", transfers: null });
  const manager = kpiLinks(subject({ perms: ["manager"] }));
  assert.equal(manager.transfers, "/transfers");
  const ws = kpiLinks(subject({ isWsManager: true }));
  assert.equal(ws.total, "/equipment");
  assert.equal(ws.ready, `/equipment?q=${encodeURIComponent("Sẵn sàng")}`);
  assert.equal(ws.transfers, "/transfers");
  const viewer = kpiLinks(subject({ isReadOnlyViewer: true }));
  assert.deepEqual([viewer.loans, viewer.repairs, viewer.transfers], [null, null, null], "Người xem toàn xưởng không có trang nghiệp vụ");
  assert.equal(viewer.total, "/equipment");
});

test("lời chào theo giờ Việt Nam và tên gọi", () => {
  assert.equal(greetingFor(new Date("2026-11-12T00:30:00Z")), "Chào buổi sáng", "7h30 VN");
  assert.equal(greetingFor(new Date("2026-11-12T05:00:00Z")), "Chào buổi trưa", "12h VN");
  assert.equal(greetingFor(new Date("2026-11-12T08:00:00Z")), "Chào buổi chiều", "15h VN");
  assert.equal(greetingFor(new Date("2026-11-12T14:00:00Z")), "Chào buổi tối", "21h VN");
  assert.equal(greetingFor(new Date("2026-11-12T17:30:00Z")), "Chào buổi sáng", "0h30 sáng hôm sau VN");
  assert.equal(shortName("Nguyễn Văn Ánh"), "Ánh");
  assert.equal(shortName("  Phương "), "Phương");
  assert.equal(shortName(""), "bạn");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("trang chủ: lời chào + nút hành động + việc chờ tôi ở đầu, ô số liệu bấm được, biểu đồ gập lại", async () => {
  const page = await source("src/app/(app)/dashboard/page.tsx");
  assert.match(page, /buildHomeActions\(auth, \{ pendingTasks: myTasks\.length, inventoryTasks: /);
  assert.match(page, /kpiLinks\(auth\)/);
  assert.match(page, /className="home-hero"/);
  assert.match(page, /<details className="home-more"/);
  assert.match(page, /id="viec-cho-toi"/);
  assert.ok(page.indexOf('className="home-hero"') < page.indexOf('id="viec-cho-toi"'), "lời chào và nút hành động đứng trước việc chờ");
  assert.ok(page.indexOf('id="viec-cho-toi"') < page.indexOf('<details className="home-more"'), "việc trước, biểu đồ sau");
  assert.doesNotMatch(page, /showMobileLoans|showMobileReturns|showMobileRepairs/, "bỏ các khối xem phiếu nhúng ở điện thoại, dùng nút dẫn thẳng tới trang nghiệp vụ");
});
