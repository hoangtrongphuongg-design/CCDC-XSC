import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildImportTemplate } from "../src/lib/export/import-template";
import {
  collectDuplicateKeys,
  findHeader,
  foldKey,
  IMPORT_COLUMNS,
  IMPORT_SHEET_NAME,
  isPlaceholder,
  parseImportRows,
  toDataRows,
  type ImportContext,
  type RawImportRow,
} from "../src/lib/import/equipment-import";
import { cellToText, readImportRows } from "../src/lib/import/read-workbook";

const GROUPS = [
  { id: "g-cbl", code: "CBL", name: "Bảo trì cơ - Nhóm CBL" },
  { id: "g-nbs", code: "NBS", name: "Bảo trì điện - Nhóm NBS" },
];

function context(over: Partial<ImportContext> = {}): ImportContext {
  return { groups: GROUPS, existingLegacy: new Map(), existingSerial: new Map(), ...over };
}

const HEADER = ["Nhóm quản lý *", "Tên CCDC *", "Nhóm thiết bị", "Loại", "Tem nhôm", "Hãng", "Model", "Serial", "Năm sản xuất", "Năm đưa vào sử dụng", "Vị trí", "Tình trạng", "Ghi chú"];

function rawRows(...dataRows: string[][]): RawImportRow[] {
  return [{ rowNumber: 1, cells: HEADER }, ...dataRows.map((cells, index) => ({ rowNumber: index + 2, cells }))];
}

function parse(rows: RawImportRow[], ctx: ImportContext = context()) {
  const found = findHeader(rows);
  assert.equal(found.ok, true);
  if (!found.ok) throw new Error("no header");
  return parseImportRows(toDataRows(rows, found.header), ctx);
}

test("foldKey bỏ dấu, dấu sao và khoảng trắng thừa; placeholder coi như trống", () => {
  assert.equal(foldKey("  Nhóm  quản lý * "), "nhom quan ly");
  assert.equal(foldKey("Đốc công"), "doc cong");
  assert.equal(isPlaceholder("N/A"), true);
  assert.equal(isPlaceholder(" - "), true);
  assert.equal(isPlaceholder("Không"), true);
  assert.equal(isPlaceholder("SN-001"), false);
});

test("tìm dòng tiêu đề kể cả khi có dòng tiêu đề phụ phía trên; thiếu cột bắt buộc thì báo lỗi", () => {
  const withTitle: RawImportRow[] = [
    { rowNumber: 1, cells: ["DANH SÁCH MÁY"] },
    { rowNumber: 3, cells: ["Tên CCDC", "", "Nhóm quản lý", "Serial"] },
    { rowNumber: 4, cells: ["Máy hàn", "", "CBL", "S1"] },
  ];
  const found = findHeader(withTitle);
  assert.equal(found.ok, true);
  if (found.ok) {
    assert.equal(found.header.headerRowNumber, 3);
    assert.deepEqual([found.header.columnIndex.name, found.header.columnIndex.group, found.header.columnIndex.serial], [0, 2, 3]);
    const data = toDataRows(withTitle, found.header);
    assert.equal(data.length, 1);
    assert.equal(data[0].values.name, "Máy hàn");
  }
  const missing = findHeader([{ rowNumber: 1, cells: ["Tên CCDC", "Serial"] }]);
  assert.equal(missing.ok, false);
});

test("dòng hợp lệ: nhận tên nhóm đầy đủ, mã nhóm hoặc tên ngắn; điền mặc định đúng", () => {
  const { rows, summary } = parse(rawRows(
    ["Bảo trì cơ - Nhóm CBL", "Máy hàn Jasic", "Cơ khí - Hàn, cắt và gia nhiệt", "Máy hàn que", "CBL-12", "Jasic", "ZX7", "SN1", "2019", "2020", "Xưởng A", "Tốt", "ghi chú"],
    ["nbs", "Bộ nguồn", "", "", "", "", "", "", "", "", "", "", ""],
    ["Nhóm CBL", "Máy mài", "", "Máy mài góc", "", "", "", "", "", "", "", "Hư hỏng", ""],
  ));
  assert.deepEqual(summary, { total: 3, ok: 3, skip: 0, error: 0 });
  const [a, b, c] = rows.map((r) => r.record!);
  assert.equal(a.ownerGroupId, "g-cbl");
  assert.equal(a.categoryCode, "CK_HAN_CAT");
  assert.equal(a.legacyCode, "CBL-12");
  assert.equal(a.manufactureYear, 2019);
  assert.equal(a.commissionYear, 2020);
  assert.equal(b.ownerGroupId, "g-nbs");
  assert.equal(b.categoryCode, "KHAC", "bỏ trống nhóm thiết bị → Khác");
  assert.equal(b.equipmentType, "Bộ nguồn", "bỏ trống loại → lấy theo tên");
  assert.equal(b.condition, "good", "bỏ trống tình trạng → Tốt");
  assert.equal(b.legacyCode, null);
  assert.equal(c.ownerGroupId, "g-cbl");
  assert.equal(c.condition, "major_damage");
});

test("dòng lỗi: thiếu/nhầm nhóm, tên ngắn, nhóm thiết bị lạ, năm sai, tình trạng lạ, quá dài", () => {
  const { rows, summary } = parse(rawRows(
    ["", "Máy hàn", "", "", "", "", "", "", "", "", "", "", ""],
    ["Nhóm không tồn tại", "Máy hàn", "", "", "", "", "", "", "", "", "", "", ""],
    ["CBL", "A", "", "", "", "", "", "", "", "", "", "", ""],
    ["CBL", "Máy hàn", "Nhóm bậy", "", "", "", "", "", "", "", "", "", ""],
    ["CBL", "Máy hàn", "", "", "", "", "", "", "1800", "abc", "", "", ""],
    ["CBL", "Máy hàn", "", "", "", "", "", "", "", "", "", "Tạm ổn", ""],
    ["CBL", "x".repeat(201), "", "", "", "", "", "", "", "", "", "", ""],
  ));
  assert.equal(summary.error, 7);
  assert.equal(summary.ok, 0);
  assert.match(rows[0].messages[0], /Thiếu nhóm/);
  assert.match(rows[1].messages[0], /không có trong danh sách nhóm/);
  assert.match(rows[2].messages[0], /ít nhất 2 ký tự/);
  assert.match(rows[3].messages[0], /Nhóm thiết bị/);
  assert.equal(rows[4].messages.length, 2, "cả hai ô năm đều báo lỗi");
  assert.match(rows[5].messages[0], /Tình trạng/);
  assert.match(rows[6].messages[0], /quá dài/);
  assert.ok(rows.every((r) => r.state === "error" && !r.record));
});

test("trùng tem nhôm/serial với hệ thống hoặc trong file → bỏ qua và báo rõ; '-' không tính là trùng", () => {
  const ctx = context({
    existingLegacy: new Map([["cbl-12", "CBL-0007"]]),
    existingSerial: new Map([["sn-old", "NBS-0003"]]),
  });
  const { rows, summary } = parse(rawRows(
    ["CBL", "Máy 1", "", "", "CBL-12", "", "", "", "", "", "", "", ""],   // trùng DB (tem)
    ["CBL", "Máy 2", "", "", "", "", "", "SN-OLD", "", "", "", "", ""],   // trùng DB (serial)
    ["CBL", "Máy 3", "", "", "tem-1", "", "", "SN-NEW", "", "", "", "", ""],   // ok
    ["CBL", "Máy 4", "", "", "TEM-1", "", "", "", "", "", "", "", ""],   // trùng dòng 4 (không phân biệt hoa thường)
    ["CBL", "Máy 5", "", "", "-", "", "", "N/A", "", "", "", "", ""],     // placeholder, ok
    ["CBL", "Máy 6", "", "", "", "", "", "N/A", "", "", "", "", ""],      // placeholder, ok
    ["CBL", "Máy 7", "", "", "", "", "", "sn-new", "", "", "", "", ""],   // serial trùng dòng 4
  ), ctx);
  assert.deepEqual(rows.map((r) => r.state), ["skip", "skip", "ok", "skip", "ok", "ok", "skip"]);
  assert.match(rows[0].messages[0], /đã có ở CBL-0007/);
  assert.match(rows[1].messages[0], /đã có ở NBS-0003/);
  assert.match(rows[3].messages[0], /trùng dòng 4/);
  assert.match(rows[6].messages[0], /trùng dòng 4/);
  assert.deepEqual(summary, { total: 7, ok: 3, skip: 4, error: 0 });
  assert.equal(rows[4].record!.legacyCode, null);
  assert.equal(rows[4].record!.serial, null);
});

test("dòng trống hoàn toàn bị bỏ qua; collectDuplicateKeys chỉ lấy giá trị thật", () => {
  const rows = rawRows(
    ["CBL", "Máy 1", "", "", "Tem-1", "", "", "SN-1", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["CBL", "Máy 2", "", "", "-", "", "", "N/A", "", "", "", "", ""],
  );
  const found = findHeader(rows);
  assert.equal(found.ok, true);
  if (!found.ok) return;
  const data = toDataRows(rows, found.header);
  assert.equal(data.length, 2);
  assert.deepEqual(collectDuplicateKeys(data), { legacy: ["tem-1"], serial: ["sn-1"] });
});

test("cellToText xử lý chuỗi, số, ngày, công thức, richText, hyperlink", () => {
  assert.equal(cellToText(null), "");
  assert.equal(cellToText("abc"), "abc");
  assert.equal(cellToText(2019), "2019");
  assert.equal(cellToText(new Date("2024-05-06T00:00:00Z")), "2024-05-06");
  assert.equal(cellToText({ formula: "A1&B1", result: "xy" } as unknown as ExcelJS.CellValue), "xy");
  assert.equal(cellToText({ richText: [{ text: "a" }, { text: "b" }] } as unknown as ExcelJS.CellValue), "ab");
  assert.equal(cellToText({ text: "link", hyperlink: "http://x" } as unknown as ExcelJS.CellValue), "link");
});

test("file mẫu dựng được, có ô chọn danh sách, đọc lại đúng tiêu đề và nhận dòng người dùng điền", async () => {
  const bytes = await buildImportTemplate({ groupNames: GROUPS.map((g) => g.name), generatedAt: new Date("2026-11-12T00:00:00Z") });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  assert.deepEqual(workbook.worksheets.map((w) => w.name), [IMPORT_SHEET_NAME, "Hướng dẫn", "Danh mục"]);

  const sheet = workbook.getWorksheet(IMPORT_SHEET_NAME)!;
  assert.equal(String(sheet.getCell(1, 1).value), "Nhóm quản lý *");
  assert.equal(sheet.getCell(2, 1).dataValidation?.type, "list");
  assert.equal(sheet.getCell(2, 3).dataValidation?.type, "list");
  assert.equal(sheet.getCell(2, IMPORT_COLUMNS.findIndex((c) => c.key === "condition") + 1).dataValidation?.type, "list");
  const lists = workbook.getWorksheet("Danh mục")!;
  assert.equal(String(lists.getCell(2, 1).value), GROUPS[0].name);

  // Người dùng điền hai dòng rồi lưu lại: đọc ngược phải ra đúng.
  sheet.getCell(2, 1).value = GROUPS[0].name;
  sheet.getCell(2, 2).value = "Máy hàn Jasic";
  sheet.getCell(2, 5).value = "CBL-12";
  sheet.getCell(2, 9).value = 2019;
  sheet.getCell(3, 1).value = "CBL";
  sheet.getCell(3, 2).value = "Máy mài";
  const filled = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  const raw = await readImportRows(filled);
  const found = findHeader(raw);
  assert.equal(found.ok, true);
  if (!found.ok) return;
  const { rows, summary } = parseImportRows(toDataRows(raw, found.header), context());
  assert.deepEqual(summary, { total: 2, ok: 2, skip: 0, error: 0 });
  assert.equal(rows[0].record!.manufactureYear, 2019);
  assert.equal(rows[0].record!.legacyCode, "CBL-12");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("nhập Excel: chỉ Admin, một transaction, cấp mã liền, ghi nhật ký; form thêm máy dùng chung hàm tạo", async () => {
  const action = await source("src/actions/import.ts");
  assert.match(action, /requireAdmin\(\)/);
  assert.match(action, /db\.transaction\(/);
  assert.match(action, /nextAssetCodes\(/);
  assert.match(action, /summary\.error > 0/, "còn dòng lỗi thì không ghi");
  assert.match(action, /bodySizeLimit|IMPORT_MAX_BYTES/);
  assert.match(await source("next.config.ts"), /bodySizeLimit/);
  assert.match(await source("src/app/(app)/import/page.tsx"), /requireAdmin\(\)/);
  assert.match(await source("src/app/(app)/import/template/route.ts"), /!auth\.isAdmin/);
  assert.match(await source("src/actions/equipment.ts"), /insertEquipmentRecord\(tx/);
  assert.match(await source("src/components/sidebar.tsx"), /"\/import", "Nhập dữ liệu"/);
});
