/**
 * Bộ định dạng Excel dùng chung (exceljs): tiêu đề màu thương hiệu, dòng tiêu đề cố định,
 * bộ lọc tự động, viền, in A4 ngang. Dùng cho file thiết bị và file lịch sử hoạt động.
 * Chuỗi người dùng nhập luôn ghi dạng text (shared string), không bao giờ là công thức.
 */
import ExcelJS from "exceljs";
import { safeSheetName } from "@/lib/export/equipment-export";

export const BRAND = "FF004A8F";
export const FILL = { group: "FFD6E4F0", category: "FFE8EFF6", type: "FFF4F7FA", entry: "FFFFFBE6" } as const;
const THIN = { style: "thin" as const, color: { argb: "FFB8C4CE" } };
export const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

export type ColumnDef = { header: string; width: number };

export type SheetContext = {
  ws: ExcelJS.Worksheet;
  headerRow: number;
  columnCount: number;
};

export function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export function startSheet(
  workbook: ExcelJS.Workbook,
  usedNames: Set<string>,
  sheetName: string,
  title: string,
  subtitle: string,
  columns: ColumnDef[],
): SheetContext {
  const headerRow = 4;
  const ws = workbook.addWorksheet(safeSheetName(sheetName, usedNames), {
    views: [{ state: "frozen", ySplit: headerRow }],
  });
  columns.forEach((column, index) => { ws.getColumn(index + 1).width = column.width; });

  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND } };
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF4B5B69" } };

  const header = ws.getRow(headerRow);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill(BRAND);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });
  header.height = 32;

  return { ws, headerRow, columnCount: columns.length };
}

export function addHeading(ctx: SheetContext, text: string, level: keyof typeof FILL) {
  const row = ctx.ws.addRow([text]);
  for (let column = 1; column <= ctx.columnCount; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(FILL[level]);
    cell.border = BORDER;
    cell.font = { bold: true, italic: level === "type", color: { argb: level === "type" ? "FF334155" : "FF0F3A5F" } };
    cell.alignment = { vertical: "middle", wrapText: false };
  }
}

export function addDataRow(ctx: SheetContext, values: Array<string | number>, options: { entryColumns?: number[] } = {}): ExcelJS.Row {
  const row = ctx.ws.addRow(values);
  for (let column = 1; column <= ctx.columnCount; column++) {
    const cell = row.getCell(column);
    cell.border = BORDER;
    cell.alignment = { vertical: "top", wrapText: true };
    if (options.entryColumns?.includes(column)) cell.fill = solidFill(FILL.entry);
  }
  row.getCell(1).alignment = { vertical: "top", horizontal: "center" };
  return row;
}

export function finishSheet(ctx: SheetContext) {
  const { ws, headerRow, columnCount } = ctx;
  const lastRow = Math.max(ws.rowCount, headerRow);
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: columnCount } };
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${headerRow}:${headerRow}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter.oddFooter = "&CTrang &P / &N";
}

export function newWorkbook(generatedAt: Date): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quản lý CCDC - XSC";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  return workbook;
}

/** exceljs trả về Buffer (kiểu Node cũ); chuẩn hóa thành Uint8Array để dùng với Response. */
export function toBytes(buffer: ExcelJS.Buffer): Uint8Array {
  return new Uint8Array(buffer as ArrayBuffer);
}
