import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isAuthorizedCron } from "../src/lib/cron-auth";
import {
  daysUntilDeadline,
  deadlineLabel,
  deadlineOf,
  periodOf,
  periodTitle,
  plan,
  type ScheduleSession,
} from "../src/lib/inventory-schedule";

const A = "group-a";
const B = "group-b";
const C = "group-c";
const groups = [
  { groupId: A, machineCount: 12 },
  { groupId: B, machineCount: 3 },
  { groupId: C, machineCount: 0 },
];
const summarize = (actions: ReturnType<typeof plan>) => actions.map((a) => `${a.type}:${a.groupId}`);

test("kỳ, hạn và tiêu đề theo tháng", () => {
  assert.equal(periodOf("2026-11-12"), "2026-11");
  assert.equal(deadlineOf("2026-11"), "2026-11-15");
  assert.equal(deadlineLabel("2026-11"), "15/11");
  assert.equal(deadlineLabel("2026-02"), "15/2");
  assert.equal(periodTitle("2026-11"), "Kiểm kê định kỳ tháng 11/2026");
  assert.equal(daysUntilDeadline("2026-11", "2026-11-12"), 3);
  assert.equal(daysUntilDeadline("2026-11", "2026-11-15"), 0);
  assert.equal(daysUntilDeadline("2026-11", "2026-11-16"), -1);
  assert.equal(daysUntilDeadline("2026-12", "2026-11-30"), 15, "qua cuối tháng");
});

test("ngày 1: mở đợt cho nhóm có máy, bỏ nhóm không có máy", () => {
  assert.deepEqual(summarize(plan({ today: "2026-11-01", groups, sessions: [] })), [`create:${A}`, `create:${B}`]);
});

test("chạy lặp trong ngày không tạo trùng (kể cả đợt kỳ này đã đóng tay)", () => {
  const sessions: ScheduleSession[] = [
    { id: "s1", groupId: A, status: "open", period: "2026-11" },
    { id: "s2", groupId: B, status: "closed", period: "2026-11" },
  ];
  assert.deepEqual(plan({ today: "2026-11-01", groups, sessions }), []);
  assert.deepEqual(plan({ today: "2026-11-09", groups, sessions }), []);
});

test("chạy bù: hôm 1 lỡ thì các ngày 2–15 vẫn mở đợt; ngày 16 trở đi thì không mở", () => {
  assert.deepEqual(summarize(plan({ today: "2026-11-10", groups, sessions: [] })), [`create:${A}`, `create:${B}`]);
  assert.deepEqual(summarize(plan({ today: "2026-11-15", groups, sessions: [] })), [`create:${A}`, `create:${B}`]);
  assert.deepEqual(plan({ today: "2026-11-16", groups, sessions: [] }), []);
  assert.deepEqual(plan({ today: "2026-11-28", groups, sessions: [] }), []);
});

test("đợt mở tay còn đang mở được nhận làm đợt của tháng thay vì tạo thêm", () => {
  const sessions: ScheduleSession[] = [{ id: "manual", groupId: A, status: "open", period: null }];
  assert.deepEqual(plan({ today: "2026-11-01", groups, sessions }), [
    { type: "adopt", sessionId: "manual", groupId: A, period: "2026-11" },
    { type: "create", groupId: B, period: "2026-11" },
  ]);
});

test("hết ngày 15: đóng đợt định kỳ còn mở (ngày 15 chưa đóng, ngày 16 thì đóng); đợt tay không bị đóng", () => {
  const sessions: ScheduleSession[] = [
    { id: "s1", groupId: A, status: "open", period: "2026-11" },
    { id: "manual", groupId: B, status: "open", period: null },
    { id: "done", groupId: C, status: "closed", period: "2026-11" },
  ];
  // Ngày 15 chưa đóng gì (đợt tay của B được nhận làm đợt tháng); ngày 16 mới đóng và không mở/nhận nữa.
  assert.deepEqual(plan({ today: "2026-11-15", groups, sessions }), [{ type: "adopt", sessionId: "manual", groupId: B, period: "2026-11" }]);
  assert.deepEqual(plan({ today: "2026-11-16", groups, sessions }), [{ type: "close", sessionId: "s1", groupId: A, period: "2026-11" }]);
});

test("sang tháng mới: đợt tháng trước bị đóng rồi mới mở đợt mới cho cùng nhóm", () => {
  const sessions: ScheduleSession[] = [{ id: "old", groupId: A, status: "open", period: "2026-10" }];
  assert.deepEqual(plan({ today: "2026-11-01", groups, sessions }), [
    { type: "close", sessionId: "old", groupId: A, period: "2026-10" },
    { type: "create", groupId: A, period: "2026-11" },
    { type: "create", groupId: B, period: "2026-11" },
  ]);
});

test("nhóm đang có đợt khác định kỳ chưa đóng thì không tạo thêm (luật 1 đợt mở / nhóm)", () => {
  // Đợt định kỳ của kỳ khác chưa quá hạn không thể xảy ra, nhưng đợt tay có period null luôn được nhận chứ không tạo mới.
  const sessions: ScheduleSession[] = [{ id: "manual", groupId: B, status: "open", period: null }];
  const created = plan({ today: "2026-11-02", groups, sessions }).filter((a) => a.type === "create").map((a) => a.groupId);
  assert.deepEqual(created, [A]);
});

test("cron: chỉ nhận đúng Bearer CRON_SECRET, thiếu cấu hình thì từ chối hết", () => {
  const secret = "một-chuỗi-bí-mật-đủ-dài-123";
  assert.equal(isAuthorizedCron(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedCron("Bearer sai", secret), false);
  assert.equal(isAuthorizedCron(secret, secret), false, "thiếu tiền tố Bearer");
  assert.equal(isAuthorizedCron(null, secret), false);
  assert.equal(isAuthorizedCron(`Bearer ${secret}`, undefined), false, "chưa cấu hình CRON_SECRET");
  assert.equal(isAuthorizedCron("Bearer ", ""), false);
  assert.equal(isAuthorizedCron("Bearer short", "short"), false, "secret quá ngắn không được chấp nhận");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("route cron kiểm CRON_SECRET trước khi chạy; vercel.json hẹn giờ 17:05 UTC (0h05 giờ VN)", async () => {
  const route = await source("src/app/api/cron/inventory/route.ts");
  assert.match(route, /isAuthorizedCron\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/);
  assert.ok(route.indexOf("isAuthorizedCron") < route.indexOf("runMonthlyInventory()"), "kiểm quyền trước khi chạy");
  assert.match(route, /status: 401/);
  const config = JSON.parse(await source("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
  assert.deepEqual(config.crons, [{ path: "/api/cron/inventory", schedule: "5 17 * * *" }]);
});

test("SQL V1.7.1 và schema.ts khớp nhau (created_by null được, period, auto_closed, duy nhất mỗi nhóm mỗi kỳ)", async () => {
  const update = await source("database/update.sql");
  const current = await source("database/current_schema.sql");
  const schema = await source("src/lib/db/schema.ts");
  assert.match(update, /V1\.7\.1/);
  assert.match(update, /ALTER TABLE inventory_sessions ALTER COLUMN created_by DROP NOT NULL/);
  assert.match(update, /ADD COLUMN IF NOT EXISTS period varchar\(7\)/);
  assert.match(update, /ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false/);
  assert.match(update, /CREATE UNIQUE INDEX IF NOT EXISTS inventory_sessions_group_period_unique ON inventory_sessions\(group_id, period\) WHERE period IS NOT NULL/);
  assert.match(current, /period varchar\(7\)/);
  assert.match(current, /auto_closed boolean NOT NULL DEFAULT false/);
  assert.match(current, /inventory_sessions_group_period_unique/);
  assert.doesNotMatch(current.slice(current.indexOf("CREATE TABLE IF NOT EXISTS inventory_sessions")).split(");")[0], /created_by uuid NOT NULL/);
  assert.match(schema, /period: varchar\("period", \{ length: 7 \}\)/);
  assert.match(schema, /autoClosed: boolean\("auto_closed"\)\.notNull\(\)\.default\(false\)/);
  assert.match(schema, /inventory_sessions_group_period_unique/);
});

test("trình chạy định kỳ: đóng đợt có closed_by NULL + auto_closed, đúng điều kiện status = open; có nút Chạy ngay chỉ cho Quản lý Xưởng/Admin", async () => {
  const runner = await source("src/lib/inventory-schedule-data.ts");
  assert.match(runner, /closedBy: null/);
  assert.match(runner, /autoClosed: true/);
  assert.match(runner, /eq\(inventorySessions\.status, "open"\)/, "đóng theo kiểu optimistic: chỉ khi vẫn đang mở");
  assert.match(runner, /action: "inventory\.schedule_run"/);
  const create = await source("src/lib/inventory-create.ts");
  assert.match(create, /"inventory\.schedule_create"/);
  const actions = await source("src/actions/inventory.ts");
  assert.match(actions, /createInventorySession\(\{ groupId, title: title \|\| null, createdBy: auth\.userId, period: null, includeTools: formData\.get\("includeTools"\) === "on" \}\)/, "đợt mở tay dùng chung hàm tạo đợt");
  assert.match(actions, /export async function runMonthlyInventoryAction/);
  assert.match(actions, /auth\.isReadOnlyViewer \|\| !auth\.isWorkshopAdmin/);
  const page = await source("src/app/(app)/inventory/page.tsx");
  assert.match(page, /canRunSchedule = auth\.isWorkshopAdmin && !auth\.isReadOnlyViewer/);
  assert.match(page, /Tự đóng — còn/);
});
