import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DUE_SOON_DAYS, attentionText, buildAttention, overdueTaskKeys, type AttentionInput } from "../src/lib/attention";

const A = "a";
const B = "b";
const C = "c";
const names = new Map([[A, "Nhóm A"], [B, "Nhóm B"], [C, "Nhóm C"]]);
const TODAY = "2026-11-12";

function input(over: Partial<AttentionInput> = {}): AttentionInput {
  return { loans: [], quickLoans: [], groupNames: names, today: TODAY, scope: { whole: true, groupIds: new Set() }, ...over };
}
const loan = (id: string, due: string, over: Record<string, string> = {}) => ({ id, code: `PM-${id}`, label: `Máy ${id}`, status: "on_loan", ownerGroupId: A, borrowerGroupId: B, expectedReturnDate: due, ...over });

test("quá hạn và sắp đến hạn (trong 2 ngày) theo ngày VN; xa hơn thì không", () => {
  const rows = buildAttention(input({
    loans: [
      loan("1", "2026-11-09"),   // trễ 3 ngày
      loan("2", "2026-11-12"),   // hôm nay
      loan("3", "2026-11-13"),   // còn 1 ngày
      loan("4", "2026-11-14"),   // còn 2 ngày
      loan("5", "2026-11-15"),   // còn 3 ngày: chưa cần chú ý
    ],
  }));
  assert.equal(DUE_SOON_DAYS, 2);
  assert.deepEqual(rows.map((r) => [r.code, r.state, r.days]), [["PM-1", "overdue", 3], ["PM-2", "due_soon", 0], ["PM-3", "due_soon", 1], ["PM-4", "due_soon", 2]]);
  assert.deepEqual(rows.map((r) => attentionText(r)), ["Trễ 3 ngày", "Hạn hôm nay", "Còn 1 ngày", "Còn 2 ngày"]);
});

test("chỉ phiếu nhóm mượn còn giữ (đang mượn / có sự cố); phiếu đã báo trả hoặc chưa bàn giao thì bỏ", () => {
  const rows = buildAttention(input({
    loans: [
      loan("1", "2026-11-01", { status: "on_loan" }),
      loan("2", "2026-11-01", { status: "incident" }),
      loan("3", "2026-11-01", { status: "return_requested" }),
      loan("4", "2026-11-01", { status: "pending_owner" }),
      loan("5", "2026-11-01", { status: "completed" }),
    ],
    quickLoans: [
      { id: "q1", code: "CM-1", label: "Cờ lê × 2", status: "borrowed", sourceGroupId: A, borrowerGroupId: B, expectedReturnAt: new Date("2026-11-10T03:00:00Z") },
      { id: "q2", code: "CM-2", label: "Búa", status: "return_reported", sourceGroupId: A, borrowerGroupId: B, expectedReturnAt: new Date("2026-11-10T03:00:00Z") },
      { id: "q3", code: "CM-3", label: "Kìm", status: "borrowed", sourceGroupId: A, borrowerGroupId: B, expectedReturnAt: null },
    ],
  }));
  assert.deepEqual(rows.map((r) => r.code).sort(), ["CM-1", "PM-1", "PM-2"]);
  const quick = rows.find((r) => r.code === "CM-1")!;
  assert.equal(quick.kind, "Mượn nhanh");
  assert.equal(quick.days, 2);
  assert.equal(quick.href, "/quick-loans");
  assert.equal(rows.find((r) => r.code === "PM-1")!.href, "/machine-loans");
});

test("ngày VN: hạn quick-loan lưu lúc 18h UTC (1h sáng hôm sau VN) tính theo ngày VN", () => {
  const rows = buildAttention(input({
    quickLoans: [{ id: "q", code: "CM-9", label: "Búa", status: "borrowed", sourceGroupId: A, borrowerGroupId: B, expectedReturnAt: new Date("2026-11-11T18:00:00Z") }],
  }));
  assert.equal(rows[0].dueDate, "2026-11-12");
  assert.equal(rows[0].state, "due_soon");
  assert.equal(rows[0].days, 0);
});

test("phạm vi: nhóm của tôi (bên cho mượn hoặc bên mượn); vai trò toàn Xưởng thấy hết", () => {
  const loans = [loan("1", "2026-11-01"), loan("2", "2026-11-01", { ownerGroupId: B, borrowerGroupId: C })];
  const mine = (groups: string[]) => buildAttention(input({ loans, scope: { whole: false, groupIds: new Set(groups) } })).map((r) => r.code);
  assert.deepEqual(mine([A]), ["PM-1"], "bên cho mượn");
  assert.deepEqual(mine([C]), ["PM-2"], "bên mượn");
  assert.deepEqual(mine([B]).sort(), ["PM-1", "PM-2"], "B là bên mượn của phiếu 1 và bên cho mượn của phiếu 2");
  assert.deepEqual(mine([]), []);
  assert.equal(buildAttention(input({ loans })).length, 2, "toàn Xưởng");
});

test("thứ tự: quá hạn trước (trễ nhiều nhất lên đầu), rồi sắp đến hạn (gần hạn nhất lên đầu)", () => {
  const rows = buildAttention(input({ loans: [loan("1", "2026-11-14"), loan("2", "2026-11-10"), loan("3", "2026-11-12"), loan("4", "2026-11-05")] }));
  assert.deepEqual(rows.map((r) => r.code), ["PM-4", "PM-2", "PM-3", "PM-1"]);
});

test("loại phiếu đã nằm ở 'Việc chờ tôi' dạng quá hạn để khỏi lặp", () => {
  const taskKeys = ["loan-overdue:1", "quick-overdue:q1", "loan-approve:9", "transfer-ws:5"];
  const excluded = overdueTaskKeys(taskKeys);
  assert.deepEqual([...excluded].sort(), ["loan:1", "quick:q1"]);
  const rows = buildAttention(input({ loans: [loan("1", "2026-11-01"), loan("2", "2026-11-01")], excludeKeys: excluded }));
  assert.deepEqual(rows.map((r) => r.code), ["PM-2"]);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("trang chủ hiện 'Chú ý hôm nay' ở máy tính và điện thoại, dùng ngày VN", async () => {
  const page = await source("src/app/(app)/dashboard/page.tsx");
  assert.match(page, /buildAttention\(/);
  assert.match(page, /className="home-attention"/);
  assert.match(page, /className="mobile-ops-block mobile-attention"/);
  assert.match(page, /const today = vnDate\(\)/, "bỏ ngày UTC (lệch 1 ngày quanh nửa đêm)");
  assert.doesNotMatch(page, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.ok(page.indexOf('id="viec-cho-toi"') < page.indexOf('className="home-attention"'), "việc của tôi trước, chú ý sau");
  assert.ok(page.indexOf('className="home-attention"') < page.indexOf('className="executive-kpis'), "chú ý trước ô số liệu");
});
