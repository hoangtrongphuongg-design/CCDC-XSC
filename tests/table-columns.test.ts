import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { alignOf, columnKind, type ColumnKind } from "../src/lib/table-columns";

/** Mọi tiêu đề đang dùng ở các trang (DataTable) và loại cột mong đợi. */
const EXPECTED: Array<[string, ColumnKind]> = [
  // mã / số / ngày: vừa nội dung
  ["Mã hệ thống", "fit"], ["Mã", "fit"], ["Mã phiếu", "fit"], ["Mã nhóm", "fit"], ["Phiếu", "fit"], ["Tem nhôm", "fit"],
  ["SL", "fit"], ["SL thanh lý", "fit"], ["Số lượng", "fit"], ["Số phiếu", "fit"], ["Số máy", "fit"], ["Chi phí", "fit"],
  ["Hạn trả", "fit"], ["Tính từ", "fit"], ["Tháng", "fit"], ["Trễ (ngày)", "fit"], ["Nằm không (ngày)", "fit"],
  ["Thời gian", "fit"], ["Cập nhật", "fit"], ["Máy/CCDC", "fit"],
  // huy hiệu
  ["Trạng thái", "status"], ["Tình trạng", "status"],
  // nhận phần rộng nhất
  ["Tên CCDC", "wide"], ["Tên máy", "wide"], ["Tên dụng cụ", "wide"], ["Máy", "wide"], ["CCDC", "wide"], ["Vật dụng", "wide"],
  ["Máy / CCDC", "wide"], ["Lý do", "wide"], ["Nội dung", "wide"], ["Nội dung hư", "wide"], ["Nhân viên", "wide"],
  // chữ ngắn / vừa
  ["Nhóm", "text"], ["Nhóm quản lý", "text"], ["Nhóm đang dùng", "text"], ["Nhóm cho", "text"], ["Nhóm mượn", "text"], ["Nhóm cho mượn", "text"],
  ["Nhóm giao", "text"], ["Nhóm nhận", "text"], ["Nhóm báo", "text"], ["Nhóm chính", "text"], ["Nhóm thiết bị", "text"],
  ["Loại", "text"], ["Hãng / Model", "text"], ["Vị trí", "text"], ["Quy cách", "text"], ["Khối", "text"], ["Nhân sự", "text"],
  ["Người thực hiện", "text"], ["Hành động", "text"], ["Quyền nhóm", "text"], ["Vai trò hệ thống", "text"], ["Username / Mã NV", "text"],
  ["Tiền tố mã dụng cụ", "text"],
  // nút thao tác
  ["Thao tác", "actions"],
];

test("phân loại cột cho mọi tiêu đề đang dùng", () => {
  for (const [header, kind] of EXPECTED) assert.equal(columnKind(header), kind, `"${header}" phải là ${kind}`);
});

test("so khớp không phân biệt hoa/thường và dấu; 'Mã' không bắt nhầm 'Máy'", () => {
  assert.equal(columnKind("MÃ HỆ THỐNG"), "fit");
  assert.equal(columnKind("ma he thong"), "fit");
  assert.equal(columnKind("  tên   máy "), "wide");
  assert.equal(columnKind("Máy"), "wide", "Máy là tên máy, không phải mã");
  assert.equal(columnKind("Máy/CCDC"), "fit", "ở trang nhóm đây là số lượng máy");
  assert.equal(columnKind("Máy / CCDC"), "wide", "ở báo cáo/tìm kiếm đây là tên máy");
  assert.equal(columnKind("THAO TÁC"), "actions");
  assert.equal(columnKind("Cột lạ"), "text");
});

test("canh lề: chữ canh trái, mã/ngày/huy hiệu canh giữa, tiền canh phải", () => {
  assert.equal(alignOf("Tên máy"), "left");
  assert.equal(alignOf("Nhóm quản lý"), "left");
  assert.equal(alignOf("Mã hệ thống"), "center");
  assert.equal(alignOf("Trạng thái"), "center");
  assert.equal(alignOf("Hạn trả"), "center");
  assert.equal(alignOf("Thao tác"), "center");
  assert.equal(alignOf("Chi phí"), "right");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("mọi tiêu đề trong mã nguồn đều đã được liệt kê ở bảng kiểm thử trên (thêm cột mới phải thêm vào đây)", async () => {
  const known = new Set(EXPECTED.map(([header]) => header));
  const missing: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/\.tsx$/.test(entry.name)) continue;
      const text = await readFile(full, "utf8");
      for (const match of text.matchAll(/headers=\{\[([^\]]*)\]\}/g)) {
        for (const header of match[1].matchAll(/"([^"]+)"/g)) if (!known.has(header[1])) missing.push(`${header[1]} (${full})`);
      }
    }
  }
  await walk(join(process.cwd(), "src"));
  assert.deepEqual(missing, [], "tiêu đề chưa có trong bảng kiểm thử phân loại cột");
});

test("DataTable gắn data-col / data-align; CSS chia cột theo nội dung và không còn luật gây bó cột tên", async () => {
  const table = await source("src/components/data-table.tsx");
  assert.match(table, /data-sizing="auto"/);
  assert.match(table, /data-col=\{columns\[index\]\.kind\}/);
  assert.match(table, /data-align=/);
  const ui = await source("src/app/ui-current.css");
  assert.match(ui, /table\[data-sizing="auto"\] \{ table-layout: auto; \}/);
  assert.match(ui, /\[data-col="wide"\] \{ width: 22%/);
  assert.match(ui, /\[data-col="fit"\] \{ width: 1%; white-space: nowrap; \}/);
  assert.doesNotMatch(ui, /\.equipment-list-table th:nth-child\(\d+\)/, "không chia % cố định cho bảng danh sách máy");
  assert.doesNotMatch(ui, /\.dashboard-operations-grid \.card \{ min-height: 326px; \}/);
  const globals = await source("src/app/globals.css");
  assert.doesNotMatch(globals, /\.asset-name-cell strong \{ max-width: 260px; \}/, "tên máy dài không bị giới hạn 260px");
  assert.match(globals, /overflow-x:\s*hidden/, "vẫn không cuộn ngang");
});
