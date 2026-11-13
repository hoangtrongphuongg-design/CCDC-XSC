import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MAX_REPAIR_COST, parseRepairCost } from "../src/lib/repair-cost";

test("chi phí sửa: số không âm hợp lệ, nhận dấu phẩy VN, làm tròn 2 số lẻ", () => {
  assert.deepEqual(parseRepairCost("1500000"), { ok: true, cost: 1500000 });
  assert.deepEqual(parseRepairCost(" 250000 "), { ok: true, cost: 250000 });
  assert.deepEqual(parseRepairCost("0"), { ok: true, cost: 0 });
  assert.deepEqual(parseRepairCost(1200.5), { ok: true, cost: 1200.5 });
  assert.deepEqual(parseRepairCost("1234,567"), { ok: true, cost: 1234.57 });
  assert.deepEqual(parseRepairCost(MAX_REPAIR_COST), { ok: true, cost: MAX_REPAIR_COST });
});

test("chi phí sửa: từ chối rỗng, âm, chữ, NaN, vô cực, quá lớn", () => {
  for (const bad of ["", "   ", "-1", "abc", "1e9", "12.3.4", "NaN", "Infinity", null, undefined, {}, Number.NaN, Number.POSITIVE_INFINITY, -5]) {
    assert.equal(parseRepairCost(bad).ok, false, `phải từ chối ${String(bad)}`);
  }
  assert.equal(parseRepairCost("10000000000000").ok, false, "vượt numeric(18,2) cho phép");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("cập nhật chi phí sửa: chỉ Quản lý Xưởng/Admin, khóa dòng, mọi trạng thái phiếu, có nhật ký trước/sau", async () => {
  const actions = await source("src/actions/repairs.ts");
  const fn = actions.slice(actions.indexOf("export async function updateRepairCostAction"), actions.indexOf("export async function confirmRepairByOwnerAction"));
  assert.match(fn, /requireWsManager\(\)/);
  assert.match(fn, /parseRepairCost\(formData\.get\("cost"\)\)/);
  assert.match(fn, /\.for\("update"\)/);
  assert.doesNotMatch(fn, /locked\.status|repair\.status/, "không lọc theo trạng thái: sửa được bất cứ lúc nào");
  assert.match(fn, /action: "repair\.cost_update"/);
  assert.match(fn, /beforeData: \{ cost: before \}/);
  assert.match(fn, /afterData: \{ cost: parsed\.cost \}/);
  assert.match(fn, /revalidatePath\("\/reports"\)/);
  assert.match(await source("src/lib/activity-log.ts"), /"repair\.cost_update": \{ label: "Cập nhật chi phí sửa chữa", category: "repair" \}/);
});

test("trang Sửa chữa: ô sửa chi phí chỉ hiện cho Quản lý Xưởng/Admin, người khác chỉ xem số", async () => {
  const page = await source("src/app/(app)/repairs/page.tsx");
  assert.match(page, /updateRepairCostAction/);
  assert.match(page, /auth\.isWorkshopAdmin \? <form key="cost" action=\{updateRepairCostAction\}/);
  assert.match(page, /<span key="cost" className="numeric">\{formatNumber\(row\.cost\)\}<\/span>/);
});
