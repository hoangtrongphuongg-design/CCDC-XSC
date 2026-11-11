/**
 * Dựng file Excel (exceljs) từ cây dữ liệu đã chuẩn bị ở equipment-export.ts.
 * Mọi chuỗi người dùng nhập được ghi dạng text (shared string), không bao giờ là công thức;
 * công thức duy nhất là cột "Chênh lệch" do hệ thống tạo.
 */
import ExcelJS from "exceljs";
import {
  brandModel,
  buildMovementNote,
  conditionLabel,
  safeSheetName,
  sortTools,
  statusLabel,
  vnDateTime,
  type ExportEquipment,
  type ExportTool,
  type GroupBucket,
  type TypeBucket,
} from "@/lib/export/equipment-export";
import { getEquipmentCategoryLabel } from "@/lib/equipment-categories";

const BRAND = "FF004A8F";
const FILL = { group: "FFD6E4F0", category: "FFE8EFF6", type: "FFF4F7FA", entry: "FFFFFBE6" } as const;
const THIN = { style: "thin" as const, color: { argb: "FFB8C4CE" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

type ColumnDef = { header: string; width: number };

type SheetContext = {
  ws: ExcelJS.Worksheet;
  headerRow: number;
  columnCount: number;
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function startSheet(
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

function addHeading(ctx: SheetContext, text: string, level: keyof typeof FILL) {
  const row = ctx.ws.addRow([text]);
  for (let column = 1; column <= ctx.columnCount; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(FILL[level]);
    cell.border = BORDER;
    cell.font = { bold: true, italic: level === "type", color: { argb: level === "type" ? "FF334155" : "FF0F3A5F" } };
    cell.alignment = { vertical: "middle", wrapText: false };
  }
}

function addDataRow(ctx: SheetContext, values: Array<string | number>, options: { entryColumns?: number[] } = {}): ExcelJS.Row {
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

function finishSheet(ctx: SheetContext) {
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

function newWorkbook(generatedAt: Date): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quản lý CCDC - XSC";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  return workbook;
}

/** exceljs trả về Buffer (kiểu Node cũ); chuẩn hóa thành Uint8Array để dùng với Response. */
function toBytes(buffer: ExcelJS.Buffer): Uint8Array {
  return new Uint8Array(buffer as ArrayBuffer);
}

function totalOf(tree: GroupBucket[]): number {
  return tree.reduce((sum, group) => sum + group.total, 0);
}

/* ------------------------------ báo cáo toàn xưởng ------------------------------ */

const WORKSHOP_COLUMNS: ColumnDef[] = [
  { header: "STT", width: 6 },
  { header: "Mã hệ thống", width: 15 },
  { header: "Mã hiện hữu", width: 14 },
  { header: "Tên máy", width: 34 },
  { header: "Hãng / Model", width: 22 },
  { header: "Nhóm thiết bị", width: 26 },
  { header: "Loại", width: 22 },
  { header: "Nhóm quản lý", width: 26 },
  { header: "Nhóm đang giữ", width: 26 },
  { header: "Vị trí", width: 18 },
  { header: "Tình trạng", width: 13 },
  { header: "Trạng thái", width: 16 },
  { header: "Ghi chú mượn / trả", width: 34 },
];

function workshopValues(index: number, row: ExportEquipment, typeLabel: string): Array<string | number> {
  return [
    index,
    row.code,
    row.legacyCode ?? "",
    row.name,
    brandModel(row),
    getEquipmentCategoryLabel(row.categoryCode),
    typeLabel,
    row.ownerGroupName,
    row.currentGroupName,
    row.currentLocation ?? "",
    conditionLabel(row.condition),
    statusLabel(row.status),
    buildMovementNote(row),
  ];
}

function addTypeBuckets(ctx: SheetContext, types: TypeBucket[], counter: { value: number }, toValues: (index: number, row: ExportEquipment, typeLabel: string) => Array<string | number>, entryColumns?: number[]) {
  for (const bucket of types) {
    addHeading(ctx, `${bucket.type} (${bucket.items.length})`, "type");
    for (const item of bucket.items) addDataRow(ctx, toValues(++counter.value, item, bucket.type), { entryColumns });
  }
}

export async function buildWorkshopWorkbook(input: {
  generatedAt: Date;
  exportedBy: string;
  query: string;
  tree: GroupBucket[];
  tools: ExportTool[];
}): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const total = totalOf(input.tree);
  const filter = input.query.trim() ? ` · Từ khóa lọc: "${input.query.trim()}"` : "";

  const ctx = startSheet(
    workbook,
    used,
    "Toàn xưởng",
    "BÁO CÁO DỤNG CỤ TOÀN XƯỞNG – XƯỞNG SỬA CHỮA",
    `Ngày xuất: ${vnDateTime(input.generatedAt)} · Người xuất: ${input.exportedBy} · Tổng: ${total} máy/CCDC có mã${filter}`,
    WORKSHOP_COLUMNS,
  );
  const counter = { value: 0 };
  for (const group of input.tree) {
    addHeading(ctx, `${group.groupName} — ${group.total} máy/CCDC`, "group");
    addTypeBuckets(ctx, group.types, counter, workshopValues);
  }
  finishSheet(ctx);

  if (input.tools.length) addToolsSheet(workbook, used, input.tools, "report", input.generatedAt, input.exportedBy, "TOÀN XƯỞNG");
  return toBytes(await workbook.xlsx.writeBuffer());
}

/* ------------------------------ kiểm kê nhóm tôi ------------------------------ */

const INVENTORY_COLUMNS: ColumnDef[] = [
  { header: "STT", width: 6 },
  { header: "Mã hệ thống", width: 15 },
  { header: "Mã hiện hữu", width: 14 },
  { header: "Tên CCDC", width: 34 },
  { header: "Hãng / Model", width: 22 },
  { header: "Serial", width: 16 },
  { header: "Nhóm quản lý", width: 24 },
  { header: "Vị trí (hồ sơ)", width: 16 },
  { header: "Tình trạng (hồ sơ)", width: 13 },
  { header: "Trạng thái", width: 15 },
  { header: "Ghi chú mượn / trả", width: 32 },
  { header: "Có mặt", width: 9 },
  { header: "Tình trạng thực tế", width: 18 },
  { header: "Vị trí thực tế", width: 16 },
  { header: "Ghi chú kiểm kê", width: 26 },
];
const INVENTORY_ENTRY_COLUMNS = [12, 13, 14, 15];

function inventoryValues(index: number, row: ExportEquipment): Array<string | number> {
  return [
    index,
    row.code,
    row.legacyCode ?? "",
    row.name,
    brandModel(row),
    row.serial ?? "",
    row.ownerGroupName,
    row.currentLocation ?? "",
    conditionLabel(row.condition),
    statusLabel(row.status),
    buildMovementNote(row),
    "", "", "", "",
  ];
}

export async function buildInventoryWorkbook(input: {
  generatedAt: Date;
  exportedBy: string;
  scopeLabel: string;
  tree: GroupBucket[];
  tools: ExportTool[];
}): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const total = totalOf(input.tree);

  const ctx = startSheet(
    workbook,
    used,
    "Kiểm kê máy",
    `DANH SÁCH KIỂM KÊ CCDC – ${input.scopeLabel.toUpperCase()}`,
    `Ngày xuất: ${vnDateTime(input.generatedAt)} · Người xuất: ${input.exportedBy} · Tổng: ${total} máy/CCDC có mã · Điền các cột nền vàng khi kiểm kê`,
    INVENTORY_COLUMNS,
  );
  const counter = { value: 0 };
  const showGroupLevel = input.tree.length > 1;
  for (const group of input.tree) {
    if (showGroupLevel) addHeading(ctx, `${group.groupName} — ${group.total} máy/CCDC`, "group");
    for (const category of group.categories) {
      addHeading(ctx, `${category.categoryName} — ${category.total} máy/CCDC`, "category");
      for (const bucket of category.types) {
        addHeading(ctx, `${bucket.type} (${bucket.items.length})`, "type");
        for (const item of bucket.items) {
          const row = addDataRow(ctx, inventoryValues(++counter.value, item), { entryColumns: INVENTORY_ENTRY_COLUMNS });
          // "Có mặt" chọn từ danh sách để kiểm kê nhanh và thống nhất.
          row.getCell(12).dataValidation = { type: "list", allowBlank: true, formulae: ['"Có,Không"'] };
          row.getCell(12).alignment = { vertical: "top", horizontal: "center" };
        }
      }
    }
  }
  finishSheet(ctx);

  if (input.tools.length) addToolsSheet(workbook, used, input.tools, "inventory", input.generatedAt, input.exportedBy, input.scopeLabel.toUpperCase());
  return toBytes(await workbook.xlsx.writeBuffer());
}

/* --------------------------- CCDC theo số lượng --------------------------- */

function addToolsSheet(
  workbook: ExcelJS.Workbook,
  used: Set<string>,
  tools: ExportTool[],
  mode: "report" | "inventory",
  generatedAt: Date,
  exportedBy: string,
  scopeLabel: string,
) {
  const sorted = sortTools(tools);
  const columns: ColumnDef[] = mode === "inventory"
    ? [
        { header: "STT", width: 6 },
        { header: "Mã", width: 15 },
        { header: "Tên dụng cụ", width: 34 },
        { header: "Quy cách", width: 22 },
        { header: "ĐVT", width: 8 },
        { header: "Nhóm quản lý", width: 26 },
        { header: "SL sổ sách", width: 12 },
        { header: "SL thực tế", width: 12 },
        { header: "Chênh lệch", width: 12 },
        { header: "Ghi chú kiểm kê", width: 28 },
      ]
    : [
        { header: "STT", width: 6 },
        { header: "Mã", width: 15 },
        { header: "Tên dụng cụ", width: 34 },
        { header: "Quy cách", width: 22 },
        { header: "ĐVT", width: 8 },
        { header: "Nhóm thiết bị", width: 26 },
        { header: "Loại", width: 22 },
        { header: "Nhóm quản lý", width: 26 },
        { header: "Số lượng", width: 12 },
      ];

  const ctx = startSheet(
    workbook,
    used,
    "CCDC theo số lượng",
    mode === "inventory" ? `KIỂM KÊ CCDC THEO SỐ LƯỢNG – ${scopeLabel}` : "DỤNG CỤ QUẢN LÝ THEO SỐ LƯỢNG – TOÀN XƯỞNG",
    `Ngày xuất: ${vnDateTime(generatedAt)} · Người xuất: ${exportedBy} · Tổng: ${sorted.length} mặt hàng`,
    columns,
  );

  sorted.forEach((tool, index) => {
    if (mode === "inventory") {
      const row = addDataRow(ctx, [index + 1, tool.code ?? "", tool.name, tool.specification ?? "", tool.unit, tool.groupName, tool.quantity, "", "", ""], { entryColumns: [8, 10] });
      const excelRow = row.number;
      row.getCell(9).value = { formula: `IF(H${excelRow}="","",H${excelRow}-G${excelRow})` };
      row.getCell(7).numFmt = "#,##0.##";
      row.getCell(8).numFmt = "#,##0.##";
      row.getCell(9).numFmt = "#,##0.##;-#,##0.##;0";
    } else {
      const row = addDataRow(ctx, [index + 1, tool.code ?? "", tool.name, tool.specification ?? "", tool.unit, getEquipmentCategoryLabel(tool.categoryCode), tool.equipmentType, tool.groupName, tool.quantity]);
      row.getCell(9).numFmt = "#,##0.##";
    }
  });
  finishSheet(ctx);
}
