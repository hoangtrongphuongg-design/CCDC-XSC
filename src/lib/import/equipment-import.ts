/**
 * Nhập máy từ Excel (Admin): hàm thuần đọc tiêu đề, kiểm tra từng dòng, phát hiện trùng.
 * Không đụng DB/exceljs nên test được bằng dữ liệu giả. Phần đọc file nằm ở `read-workbook.ts`,
 * phần ghi DB ở `src/actions/import.ts`.
 *
 * Quy tắc: dòng LỖI chặn việc nhập (sửa file rồi kiểm tra lại); dòng TRÙNG (tem nhôm hoặc serial
 * đã có trong hệ thống / trùng dòng khác trong file) được BỎ QUA và báo rõ; chỉ tạo mới, không
 * cập nhật máy đã có.
 */
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";
import { shortGroupName } from "@/lib/export/equipment-export";

export const IMPORT_SHEET_NAME = "Nhập máy";
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const CONDITION_IMPORT_OPTIONS = [
  { label: "Tốt", value: "good" },
  { label: "Hư hỏng", value: "major_damage" },
  { label: "Chưa đánh giá", value: "awaiting_assessment" },
  { label: "Không thể phục hồi", value: "irreparable" },
] as const;
export type ImportCondition = (typeof CONDITION_IMPORT_OPTIONS)[number]["value"];

export const IMPORT_COLUMNS = [
  { key: "group", header: "Nhóm quản lý", required: true, width: 32, aliases: ["nhom", "nhom quan ly"] },
  { key: "name", header: "Tên CCDC", required: true, width: 32, aliases: ["ten may", "ten"] },
  { key: "category", header: "Nhóm thiết bị", required: false, width: 34, aliases: ["nhom may", "nhom thiet bi"] },
  { key: "type", header: "Loại", required: false, width: 24, aliases: ["loai may", "loai"] },
  { key: "legacyCode", header: "Tem nhôm", required: false, width: 16, aliases: ["tem", "ma hien huu", "tem nhom"] },
  { key: "brand", header: "Hãng", required: false, width: 16, aliases: ["hang", "hang san xuat"] },
  { key: "model", header: "Model", required: false, width: 18, aliases: ["model"] },
  { key: "serial", header: "Serial", required: false, width: 18, aliases: ["serial", "so serial", "so may"] },
  { key: "manufactureYear", header: "Năm sản xuất", required: false, width: 13, aliases: ["nam sx", "nam san xuat"] },
  { key: "commissionYear", header: "Năm đưa vào sử dụng", required: false, width: 16, aliases: ["nam su dung", "nam dua vao su dung"] },
  { key: "location", header: "Vị trí", required: false, width: 24, aliases: ["vi tri", "noi dat"] },
  { key: "condition", header: "Tình trạng", required: false, width: 18, aliases: ["tinh trang"] },
  { key: "notes", header: "Ghi chú", required: false, width: 30, aliases: ["ghi chu"] },
] as const;
export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];

/** Bỏ dấu, hạ chữ thường, gộp khoảng trắng: dùng để so khớp "dễ tính" tiêu đề và danh mục. */
export function foldKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const PLACEHOLDERS = new Set(["-", "--", "---", ".", "n/a", "na", "x", "khong", "khong co", "chua co", "none"]);
/** Ô ghi "-", "N/A", "không"… coi như để trống (tránh coi hai máy cùng serial "N/A" là trùng). */
export function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.has(foldKey(value));
}

export type RawImportRow = { rowNumber: number; cells: string[] };

export type HeaderMap = { headerRowNumber: number; columnIndex: Partial<Record<ImportKey, number>> };

/** Tìm dòng tiêu đề trong 10 dòng đầu; báo lỗi nếu thiếu cột bắt buộc. */
export function findHeader(rows: readonly RawImportRow[]): { ok: true; header: HeaderMap } | { ok: false; message: string } {
  for (const row of rows.slice(0, 10)) {
    const columnIndex: Partial<Record<ImportKey, number>> = {};
    row.cells.forEach((cell, index) => {
      const folded = foldKey(cell);
      if (!folded) return;
      const column = IMPORT_COLUMNS.find((c) => !(c.key in columnIndex) && (foldKey(c.header) === folded || (c.aliases as readonly string[]).includes(folded)));
      if (column) columnIndex[column.key] = index;
    });
    if (columnIndex.name !== undefined && columnIndex.group !== undefined) return { ok: true, header: { headerRowNumber: row.rowNumber, columnIndex } };
  }
  return { ok: false, message: "Không tìm thấy dòng tiêu đề. File phải có cột “Nhóm quản lý” và “Tên CCDC” — hãy dùng file mẫu tải từ trang này." };
}

export function toDataRows(rows: readonly RawImportRow[], header: HeaderMap): Array<{ rowNumber: number; values: Partial<Record<ImportKey, string>> }> {
  const out: Array<{ rowNumber: number; values: Partial<Record<ImportKey, string>> }> = [];
  for (const row of rows) {
    if (row.rowNumber <= header.headerRowNumber) continue;
    const values: Partial<Record<ImportKey, string>> = {};
    let any = false;
    for (const column of IMPORT_COLUMNS) {
      const index = header.columnIndex[column.key];
      const text = index === undefined ? "" : cleanText(row.cells[index]);
      if (text) any = true;
      values[column.key] = text;
    }
    if (any) out.push({ rowNumber: row.rowNumber, values });
  }
  return out;
}

export type ImportGroup = { id: string; code: string; name: string };

export type ImportContext = {
  groups: readonly ImportGroup[];
  /** Tem nhôm (chữ thường) đã có trong hệ thống → mã hệ thống của máy đó. */
  existingLegacy: ReadonlyMap<string, string>;
  /** Serial (chữ thường) đã có trong hệ thống → mã hệ thống của máy đó. */
  existingSerial: ReadonlyMap<string, string>;
};

export type ImportRecord = {
  ownerGroupId: string;
  groupCode: string;
  groupName: string;
  name: string;
  equipmentType: string;
  categoryCode: string;
  legacyCode: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  manufactureYear: number | null;
  commissionYear: number | null;
  currentLocation: string | null;
  condition: ImportCondition;
  notes: string | null;
};

export type ImportRowState = "ok" | "skip" | "error";

export type ParsedImportRow = {
  rowNumber: number;
  state: ImportRowState;
  messages: string[];
  preview: { group: string; name: string; type: string; legacyCode: string; serial: string };
  record?: ImportRecord;
};

export type ImportSummary = { total: number; ok: number; skip: number; error: number };

const LIMITS = { name: 200, type: 120, legacyCode: 100, brand: 150, model: 180, serial: 150, location: 255, notes: 4000 } as const;

function matchGroup(input: string, groups: readonly ImportGroup[]): ImportGroup | "ambiguous" | null {
  const key = foldKey(input);
  const exact = groups.filter((g) => foldKey(g.name) === key || foldKey(g.code) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return "ambiguous";
  const short = groups.filter((g) => foldKey(shortGroupName(g.name)) === key);
  if (short.length === 1) return short[0];
  return short.length > 1 ? "ambiguous" : null;
}

function matchCategory(input: string): string | null {
  const key = foldKey(input);
  const found = EQUIPMENT_CATEGORIES.find((c) => {
    const tail = c.name.includes(" - ") ? c.name.split(" - ").slice(1).join(" - ") : c.name;
    return foldKey(c.code) === key || foldKey(c.name) === key || foldKey(tail) === key;
  });
  return found?.code ?? null;
}

function matchCondition(input: string): ImportCondition | null {
  const key = foldKey(input);
  const found = CONDITION_IMPORT_OPTIONS.find((o) => foldKey(o.label) === key || o.value === key);
  return found?.value ?? null;
}

function parseYear(input: string, label: string, errors: string[]): number | null {
  if (!input) return null;
  const value = Number(input.replace(",", "."));
  if (!Number.isInteger(value) || value < 1900 || value > 2200) {
    errors.push(`${label} “${input}” không hợp lệ (nhập năm 4 chữ số, ví dụ 2019).`);
    return null;
  }
  return value;
}

function tooLong(value: string, max: number, label: string, errors: string[]) {
  if (value.length > max) errors.push(`${label} quá dài (tối đa ${max} ký tự).`);
}

export function parseImportRows(
  dataRows: ReadonlyArray<{ rowNumber: number; values: Partial<Record<ImportKey, string>> }>,
  context: ImportContext,
): { rows: ParsedImportRow[]; summary: ImportSummary } {
  const seenLegacy = new Map<string, number>();
  const seenSerial = new Map<string, number>();
  const rows: ParsedImportRow[] = [];

  for (const { rowNumber, values } of dataRows) {
    const v = (key: ImportKey) => values[key] ?? "";
    const errors: string[] = [];
    const legacyRaw = isPlaceholder(v("legacyCode")) ? "" : v("legacyCode");
    const serialRaw = isPlaceholder(v("serial")) ? "" : v("serial");
    const name = v("name");
    const preview = { group: v("group"), name, type: v("type"), legacyCode: legacyRaw, serial: serialRaw };

    let group: ImportGroup | null = null;
    if (!v("group")) errors.push("Thiếu nhóm quản lý.");
    else {
      const matched = matchGroup(v("group"), context.groups);
      if (matched === "ambiguous") errors.push(`Nhóm quản lý “${v("group")}” khớp nhiều nhóm; hãy chọn đúng tên trong danh sách.`);
      else if (!matched) errors.push(`Nhóm quản lý “${v("group")}” không có trong danh sách nhóm.`);
      else group = matched;
    }

    if (name.length < 2) errors.push("Tên CCDC phải có ít nhất 2 ký tự.");
    tooLong(name, LIMITS.name, "Tên CCDC", errors);

    let categoryCode = "KHAC";
    if (v("category")) {
      const matched = matchCategory(v("category"));
      if (!matched) errors.push(`Nhóm thiết bị “${v("category")}” không có trong danh sách.`);
      else categoryCode = matched;
    }

    const equipmentType = v("type") || name;
    tooLong(equipmentType, LIMITS.type, "Loại", errors);
    tooLong(legacyRaw, LIMITS.legacyCode, "Tem nhôm", errors);
    tooLong(v("brand"), LIMITS.brand, "Hãng", errors);
    tooLong(v("model"), LIMITS.model, "Model", errors);
    tooLong(serialRaw, LIMITS.serial, "Serial", errors);
    tooLong(v("location"), LIMITS.location, "Vị trí", errors);
    tooLong(v("notes"), LIMITS.notes, "Ghi chú", errors);

    const manufactureYear = parseYear(v("manufactureYear"), "Năm sản xuất", errors);
    const commissionYear = parseYear(v("commissionYear"), "Năm đưa vào sử dụng", errors);

    let condition: ImportCondition = "good";
    if (v("condition")) {
      const matched = matchCondition(v("condition"));
      if (!matched) errors.push(`Tình trạng “${v("condition")}” không hợp lệ (Tốt / Hư hỏng / Chưa đánh giá / Không thể phục hồi).`);
      else condition = matched;
    }

    if (errors.length || !group) {
      rows.push({ rowNumber, state: "error", messages: errors, preview });
      continue;
    }

    const skipReasons: string[] = [];
    const legacyKey = legacyRaw.toLowerCase();
    const serialKey = serialRaw.toLowerCase();
    if (legacyKey) {
      const existing = context.existingLegacy.get(legacyKey);
      const earlier = seenLegacy.get(legacyKey);
      if (existing) skipReasons.push(`Tem nhôm “${legacyRaw}” đã có ở ${existing}.`);
      else if (earlier) skipReasons.push(`Tem nhôm “${legacyRaw}” trùng dòng ${earlier} trong file.`);
    }
    if (serialKey) {
      const existing = context.existingSerial.get(serialKey);
      const earlier = seenSerial.get(serialKey);
      if (existing) skipReasons.push(`Serial “${serialRaw}” đã có ở ${existing}.`);
      else if (earlier) skipReasons.push(`Serial “${serialRaw}” trùng dòng ${earlier} trong file.`);
    }
    if (skipReasons.length) {
      rows.push({ rowNumber, state: "skip", messages: skipReasons, preview });
      continue;
    }
    if (legacyKey) seenLegacy.set(legacyKey, rowNumber);
    if (serialKey) seenSerial.set(serialKey, rowNumber);

    rows.push({
      rowNumber,
      state: "ok",
      messages: [],
      preview,
      record: {
        ownerGroupId: group.id,
        groupCode: group.code,
        groupName: group.name,
        name,
        equipmentType,
        categoryCode,
        legacyCode: legacyRaw || null,
        brand: v("brand") || null,
        model: v("model") || null,
        serial: serialRaw || null,
        manufactureYear,
        commissionYear,
        currentLocation: v("location") || null,
        condition,
        notes: v("notes") || null,
      },
    });
  }

  return { rows, summary: summarize(rows) };
}

export function summarize(rows: readonly ParsedImportRow[]): ImportSummary {
  return {
    total: rows.length,
    ok: rows.filter((r) => r.state === "ok").length,
    skip: rows.filter((r) => r.state === "skip").length,
    error: rows.filter((r) => r.state === "error").length,
  };
}

/** Tem nhôm / serial (chữ thường, đã bỏ ô "-", "N/A") có trong file, để truy vấn trùng với DB. */
export function collectDuplicateKeys(dataRows: ReadonlyArray<{ values: Partial<Record<ImportKey, string>> }>): { legacy: string[]; serial: string[] } {
  const legacy = new Set<string>();
  const serial = new Set<string>();
  for (const { values } of dataRows) {
    const l = values.legacyCode ?? "";
    const s = values.serial ?? "";
    if (l && !isPlaceholder(l)) legacy.add(l.toLowerCase());
    if (s && !isPlaceholder(s)) serial.add(s.toLowerCase());
  }
  return { legacy: [...legacy], serial: [...serial] };
}
