import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS } from "../src/lib/constants";
import { isActivePath } from "../src/lib/nav-active";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("nhãn Tình trạng không trùng nhãn Trạng thái (hết 'Chờ kiểm tra' / 'Thanh lý' ở cả hai)", () => {
  const statusLabels = new Set<string>(Object.values(EQUIPMENT_STATUS_LABELS));
  const conditionLabels = new Set<string>(Object.values(CONDITION_LABELS));
  const shared = [...conditionLabels].filter((label) => statusLabels.has(label));
  assert.deepEqual(shared, [], `nhãn trùng giữa Trạng thái và Tình trạng: ${shared.join(", ")}`);
  assert.deepEqual([...conditionLabels].sort(), ["Chưa đánh giá", "Hư hỏng", "Không thể phục hồi", "Tốt"].sort());
  assert.equal(EQUIPMENT_STATUS_LABELS.wait_handover, "Đang điều chuyển");
});

test("menu Mượn – Trả sáng ở cả Mượn máy và Mượn nhanh, không sáng nhầm ở trang khác", () => {
  assert.equal(isActivePath("/machine-loans", "/machine-loans"), true);
  assert.equal(isActivePath("/quick-loans", "/machine-loans"), true);
  assert.equal(isActivePath("/quick-loans/x", "/machine-loans"), true);
  assert.equal(isActivePath("/transfers", "/machine-loans"), false);
  assert.equal(isActivePath("/quick-loans", "/transfers"), false);
  assert.equal(isActivePath("/equipment/export", "/equipment"), true);
  assert.equal(isActivePath("/equipmentx", "/equipment"), false, "không khớp tiền tố chữ");
});

test("sidebar chỉ còn một mục Mượn – Trả; hai trang dùng chung LoanTabs", async () => {
  const sidebar = await source("src/components/sidebar.tsx");
  assert.match(sidebar, /"Mượn – Trả"/);
  assert.doesNotMatch(sidebar, /Cho mượn nhanh/);
  assert.match(await source("src/app/(app)/machine-loans/page.tsx"), /<LoanTabs active="machine" \/>/);
  assert.match(await source("src/app/(app)/quick-loans/page.tsx"), /<LoanTabs active="quick" \/>/);
});
