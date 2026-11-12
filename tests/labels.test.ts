import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import QRCode from "qrcode";
import {
  LABELS_PER_PAGE,
  LABEL_COLUMNS,
  LABEL_ROWS,
  MAX_IDS,
  canPrintLabels,
  defaultBaseUrl,
  machineUrl,
  normalizeBaseUrl,
  paginateLabels,
  parseIds,
  parseStart,
  resolveBaseUrl,
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

test("canPrintLabels: chỉ Quản lý Xưởng và Admin, Người xem toàn xưởng không (kể cả mang cờ Admin)", () => {
  const none = { isAdmin: false, isWsManager: false, isReadOnlyViewer: false };
  assert.equal(canPrintLabels({ ...none, isWsManager: true }), true);
  assert.equal(canPrintLabels({ ...none, isAdmin: true }), true);
  assert.equal(canPrintLabels(none), false, "Đốc công / Kỹ sư / Công nhân (người dùng theo nhóm)");
  assert.equal(canPrintLabels({ ...none, isReadOnlyViewer: true }), false);
  assert.equal(canPrintLabels({ isAdmin: true, isWsManager: false, isReadOnlyViewer: true }), false);
});

test("resolveBaseUrl: có APP_BASE_URL thì luôn dùng (QR in lại giống hệt), thiếu thì theo tên miền đang mở", () => {
  const fromHost = resolveBaseUrl({ configured: "", host: "preview-abc.vercel.app", proto: "https" });
  assert.deepEqual(fromHost, { baseUrl: "https://preview-abc.vercel.app", fromConfig: false, mismatch: false });
  const same = resolveBaseUrl({ configured: "https://ccdc-xsc.vercel.app/", host: "ccdc-xsc.vercel.app", proto: "https" });
  assert.deepEqual(same, { baseUrl: "https://ccdc-xsc.vercel.app", fromConfig: true, mismatch: false });
  const preview = resolveBaseUrl({ configured: "https://ccdc-xsc.vercel.app", host: "preview-abc.vercel.app", proto: "https" });
  assert.equal(preview.baseUrl, "https://ccdc-xsc.vercel.app", "mở từ bản xem thử vẫn ra địa chỉ chính thức");
  assert.equal(preview.mismatch, true);
  const bad = resolveBaseUrl({ configured: "javascript:alert(1)", host: "x.vn", proto: "https" });
  assert.equal(bad.fromConfig, false, "cấu hình sai dạng thì bỏ qua");
});

test("trang in tem: chỉ Quản lý Xưởng/Admin, dùng địa chỉ gốc cấu hình, in khổ A4 riêng, ẩn khung ứng dụng khi in, lối vào có điều kiện", async () => {
  const page = await source("src/app/(app)/labels/page.tsx");
  assert.match(page, /requireUser\(\)/);
  assert.match(page, /if \(!canPrintLabels\(auth\)\) notFound\(\);/, "người không đủ quyền gõ thẳng /labels thì 404");
  assert.doesNotMatch(page, /canViewWholeWorkshop/);
  assert.match(page, /process\.env\.APP_BASE_URL/);
  assert.match(page, /normalizeBaseUrl\(one\(params\.base\)/);
  const css = await source("src/app/ui-current.css");
  assert.match(css, /@page labels \{ size: A4 portrait; margin: 0; \}/);
  assert.match(css, /grid-template-columns: repeat\(3, 70mm\)/);
  assert.match(css, /grid-template-rows: repeat\(8, 37\.125mm\)/);
  assert.match(css, /@media print \{[\s\S]*\.sidebar, \.topbar/);
  const sidebar = await source("src/components/sidebar.tsx");
  assert.match(sidebar, /"\/labels", "In tem QR"/);
  assert.match(sidebar, /canPrintLabels\(auth\) \? \[labelsItem\]/, "menu chỉ hiện cho người in được tem");
  const profile = await source("src/app/(app)/equipment/[id]/page.tsx");
  assert.match(profile, /\/labels\?ids=\$\{machine\.id\}/);
  assert.match(profile, /canPrintLabels\(auth\) \? <Link/, "nút In tem QR ở hồ sơ máy chỉ hiện cho người in được tem");
});
