/**
 * Đọc file .xlsx người dùng tải lên thành các dòng chữ (chỉ chạy ở server). Mọi ô được chuyển về
 * chuỗi: công thức lấy kết quả, ô ngày → YYYY-MM-DD, không bao giờ "thực thi" nội dung ô.
 */
import ExcelJS from "exceljs";
import { IMPORT_MAX_ROWS, IMPORT_SHEET_NAME, type RawImportRow } from "@/lib/import/equipment-import";

/** Số dòng tối đa chịu đọc (tiêu đề + dữ liệu + dòng trống thừa); vượt quá coi là file không phải mẫu. */
const MAX_SCAN_ROWS = IMPORT_MAX_ROWS * 4 + 50;

export function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) return (obj.richText as Array<{ text?: string }>).map((part) => part.text ?? "").join("");
    if ("result" in obj) return cellToText(obj.result as ExcelJS.CellValue);
    if (typeof obj.text === "string") return obj.text;
    if ("error" in obj) return "";
  }
  return "";
}

export async function readImportRows(bytes: Uint8Array): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet(IMPORT_SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) throw new Error("File không có sheet nào.");
  if (sheet.rowCount > MAX_SCAN_ROWS) throw new Error(`File có quá nhiều dòng (tối đa ${IMPORT_MAX_ROWS} máy mỗi lần nhập).`);

  const rows: RawImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let column = 1; column <= Math.min(row.cellCount, 40); column++) cells.push(cellToText(row.getCell(column).value));
    rows.push({ rowNumber, cells });
  });
  return rows;
}
