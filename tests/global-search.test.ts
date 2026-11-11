import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanQuery, escapeLike, foldText, queryTerms, rankMatch, searchItems } from "../src/lib/global-search";

test("foldText bỏ dấu, hoa/thường, khoảng trắng; đ → d", () => {
  assert.equal(foldText("  Máy  HÀN Que "), "may han que");
  assert.equal(foldText("Đèn ĐỌC"), "den doc");
  assert.equal(foldText(null), "");
  assert.deepEqual(queryTerms("Han  JASIC han"), ["han", "jasic"], "bỏ từ lặp");
  assert.equal(queryTerms("a b c d e f g h").length, 6, "tối đa 6 từ");
});

test("rankMatch: mọi từ phải khớp; trùng hẳn mã > bắt đầu bằng > chứa > trường khác", () => {
  const machine = { primary: ["CBL-0001", "TEM-12", "SN-9"], text: ["Máy hàn Jasic", "Máy hàn que", "Nhóm CBL", "Xưởng A"] };
  assert.equal(rankMatch(machine, "cbl-0001"), 0, "trùng hẳn mã hệ thống");
  assert.equal(rankMatch(machine, "tem-12"), 0, "trùng hẳn tem nhôm");
  assert.equal(rankMatch(machine, "sn-9"), 0, "trùng hẳn serial");
  assert.equal(rankMatch(machine, "cbl-00"), 1);
  assert.equal(rankMatch(machine, "0001"), 2);
  assert.equal(rankMatch(machine, "may han"), 3, "không dấu vẫn khớp tên");
  assert.equal(rankMatch(machine, "jasic han"), 3, "thứ tự từ không quan trọng");
  assert.equal(rankMatch(machine, "xuong a que"), 3, "từ nằm ở các trường khác nhau");
  assert.equal(rankMatch(machine, "jasic bosch"), null, "thiếu một từ là không khớp");
  assert.equal(rankMatch(machine, "   "), null);
  assert.equal(rankMatch({ primary: [null], text: [undefined] }, "abc"), null);
});

test("searchItems: xếp theo hạng rồi thứ tự gốc, cắt giới hạn nhưng vẫn báo tổng", () => {
  const items = [
    { id: "a", code: "CBL-0010", name: "Máy hàn 10" },
    { id: "b", code: "CBL-0001", name: "Máy hàn 1" },
    { id: "c", code: "NBS-0001", name: "Bộ nguồn CBL-0001 dự phòng" },
    { id: "d", code: "NBS-0002", name: "Máy mài" },
  ];
  const fields = (i: (typeof items)[number]) => ({ primary: [i.code], text: [i.name] });
  const found = searchItems(items, "cbl-0001", fields, 10);
  assert.deepEqual(found.rows.map((i) => i.id), ["b", "c"], "mã trùng hẳn trước, khớp ở tên sau");
  assert.equal(found.total, 2);
  const byPrefix = searchItems(items, "cbl", fields, 1);
  assert.deepEqual(byPrefix.rows.map((i) => i.id), ["a"], "cùng hạng giữ thứ tự gốc");
  assert.equal(byPrefix.total, 3, "tổng đếm trước khi cắt");
  assert.deepEqual(searchItems(items, "zzz", fields, 5), { rows: [], total: 0 });
});

test("escapeLike và cleanQuery", () => {
  assert.equal(escapeLike("PM_20%\\x"), "PM\\_20\\%\\\\x");
  assert.equal(cleanQuery("  PM-2026   0001 \n"), "PM-2026 0001");
  assert.equal(cleanQuery(undefined), "");
  assert.equal(cleanQuery("x".repeat(300)).length, 120);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("ô tìm kiếm chung nằm ở thanh trên và trang chủ điện thoại, trang /search ai đăng nhập cũng vào được", async () => {
  assert.match(await source("src/components/topbar.tsx"), /<GlobalSearchBox \/>/);
  assert.match(await source("src/components/global-search-box.tsx"), /action="\/search"/);
  assert.match(await source("src/app/(app)/dashboard/page.tsx"), /className="mobile-ops-search" action="\/search"/);
  const page = await source("src/app/(app)/search/page.tsx");
  assert.match(page, /requireUser\(\)/);
  assert.match(page, /globalSearch\(auth, query\)/);
});

test("phiếu trong kết quả chỉ giới hạn theo nhóm của người dùng, máy thì toàn Xưởng", async () => {
  const data = await source("src/lib/global-search-data.ts");
  assert.match(data, /const whole = canViewWholeWorkshop\(auth\)/);
  assert.match(data, /whole \? undefined : or\(/, "điều kiện nhóm chỉ áp khi không phải vai trò toàn Xưởng");
  assert.match(data, /eq\(equipment\.recordStatus, "active"\)/, "chỉ máy đã hoàn thành hồ sơ");
  assert.match(data, /escapeLike\(query\)/, "mã phiếu được thoát ký tự LIKE");
});
