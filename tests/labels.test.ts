import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import QRCode from "qrcode";
import {
  LABELS_PER_PAGE,
  LABEL_COLUMNS,
  LABEL_ROWS,
  MAX_IDS,
  defaultBaseUrl,
  machineUrl,
  normalizeBaseUrl,
  paginateLabels,
  parseIds,
  parseStart,
} from "../src/lib/labels";

const ID1 = "3f2b1c0e-8a4d-4c6e-9b1a-0d2e5f7a9c11";
const ID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("lưới A4 3 cột × 8 hàng = 24 tem mỗi tờ", () => {
  assert.equal(LABEL_COLUMNS, 3);
  assert.equal(LABEL_ROWS, 8);
  assert.equal(LABELS_PER_PAGE, 24);
});

test("normalizeBaseUrl chỉ giữ gốc https/http, bỏ đường dẫn; sai dạng thì dùng địa chỉ mặc định", () => {
  const fb = "https://ccdc.example.vn";
  assert.equal(normalizeBaseUrl("https://abc.vn/equipment/x?y=1", fb), "https://abc.vn");
  assert.equal(normalizeBaseUrl("abc.vn", fb), "https://abc.vn", "thiếu giao thức thì thêm https");
  assert.equal(normalizeBaseUrl("  http://localhost:3000/  ", fb), "http://localhost:3000");
  assert.equal(normalizeBaseUrl("", fb), fb);
  assert.equal(normalizeBaseUrl(undefined, fb), fb);
  assert.equal(normalizeBaseUrl("javascript:alert(1)", fb), fb);
  assert.equal(normalizeBaseUrl("ftp://abc.vn", fb), fb);
  assert.equal(normalizeBaseUrl("https://user:pass@abc.vn", fb), fb, "không nhận địa chỉ có tài khoản");
  assert.equal(normalizeBaseUrl("https://", fb), fb);
});

test("defaultBaseUrl theo host của yêu cầu", () => {
  assert.equal(defaultBaseUrl("ccdc.example.vn", null), "https://ccdc.example.vn");
  assert.equal(defaultBaseUrl("ccdc.example.vn", "https"), "https://ccdc.example.vn");
  assert.equal(defaultBaseUrl("localhost:3000", null), "http://localhost:3000");
  assert.equal(defaultBaseUrl("a.vn, b.vn", "https, http"), "https://a.vn", "lấy phần tử đầu của header chuyển tiếp");
  assert.equal(defaultBaseUrl(null, null), "https://localhost");
});

test("machineUrl, parseIds, parseStart", () => {
  assert.equal(machineUrl("https://abc.vn/", ID1), `https://abc.vn/equipment/${ID1}`);
  assert.deepEqual(parseIds(`${ID1}, ${ID2},${ID1},khong-phai-uuid,`), [ID1, ID2], "bỏ trùng và id sai dạng");
  assert.deepEqual(parseIds(undefined), []);
  const many = Array.from({ length: MAX_IDS + 20 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
  assert.equal(parseIds(many).length, MAX_IDS);
  assert.equal(parseStart("5"), 5);
  assert.equal(parseStart("24"), 24);
  assert.equal(parseStart("25"), 1);
  assert.equal(parseStart("0"), 1);
  assert.equal(parseStart("abc"), 1);
  assert.equal(parseStart(undefined), 1);
});

test("paginateLabels: chia 24 tem/tờ, chèn ô trống đầu tờ cho phần decal đã bóc", () => {
  const items = Array.from({ length: 30 }, (_, i) => `m${i + 1}`);
  const pages = paginateLabels(items);
  assert.deepEqual(pages.map((p) => p.length), [24, 6]);
  assert.equal(pages[0][0], "m1");
  const shifted = paginateLabels(items, 5);
  assert.deepEqual(shifted[0].slice(0, 5), [null, null, null, null, "m1"]);
  assert.deepEqual(shifted.map((p) => p.length), [24, 10], "30 tem + 4 ô trống = 34 ô");
  assert.deepEqual(paginateLabels([], 1), []);
  assert.deepEqual(paginateLabels(["x"], 24).map((p) => p.length), [24], "bắt đầu ô cuối: tem đầu nằm ở ô 24");
});

test("thư viện qrcode sinh được SVG cho địa chỉ hồ sơ máy", async () => {
  const svg = await QRCode.toString(machineUrl("https://abc.vn", ID1), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  assert.match(svg.trim(), /^<svg[\s\S]*<\/svg>$/);
  assert.ok(svg.includes("viewBox"));
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("trang in tem: giới hạn theo phạm vi nhóm, in khổ A4 riêng, ẩn khung ứng dụng khi in, có lối vào từ menu và hồ sơ máy", async () => {
  const page = await source("src/app/(app)/labels/page.tsx");
  assert.match(page, /requireUser\(\)/);
  assert.match(page, /canViewWholeWorkshop\(auth\)/);
  assert.match(page, /allowedGroups\.some\(\(group\) => group\.id === one\(params\.group\)\)/, "chỉ chọn được nhóm trong phạm vi");
  assert.match(page, /normalizeBaseUrl\(one\(params\.base\)/);
  const css = await source("src/app/ui-current.css");
  assert.match(css, /@page labels \{ size: A4 portrait; margin: 0; \}/);
  assert.match(css, /grid-template-columns: repeat\(3, 70mm\)/);
  assert.match(css, /grid-template-rows: repeat\(8, 37\.125mm\)/);
  assert.match(css, /@media print \{[\s\S]*\.sidebar, \.topbar/);
  assert.match(await source("src/components/sidebar.tsx"), /"\/labels", "In tem QR"/);
  assert.match(await source("src/app/(app)/equipment/[id]/page.tsx"), /\/labels\?ids=\$\{machine\.id\}/);
});
