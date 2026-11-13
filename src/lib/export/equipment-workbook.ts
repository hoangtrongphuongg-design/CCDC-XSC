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
  sortTools,
  statusLabel,
  vnDateTime,
  type ExportEquipment,
  type ExportTool,
  type GroupBucket,
  type TypeBucket,
} from "@/lib/export/equipment-export";
import { getEquipmentCategoryLabel } from "@/lib/equipment-categories";
import {
  addDataRow,
  addHeading,
  finishSheet,
  newWorkbook,
  startSheet,
  toBytes,
  type ColumnDef,
  type SheetContext,
} from "@/lib/export/workbook-kit";


function totalOf(tree: GroupBucket[]): number {
  return tree.reduce((sum, group) => sum + group.total, 0);
}

/* ------------------------------ báo cáo toàn xưởng ------------------------------ */

const WORKSHOP_COLUMNS: ColumnDef[] = [
  { header: "STT", width: 6 },
  { header: "Mã hệ thống", width: 15 },
  { header: "Tem nhôm", width: 14 },
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
  /** Tab thanh lý / đã mất: tên sheet + tiêu đề riêng (mặc định là báo cáo toàn xưởng). */
  heading?: { sheetName: string; title: string };
}): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();
  const total = totalOf(input.tree);
  const filter = input.query.trim() ? ` · Từ khóa lọc: "${input.query.trim()}"` : "";

  const ctx = startSheet(
    workbook,
    used,
    input.heading?.sheetName ?? "Toàn xưởng",
    input.heading?.title ?? "BÁO CÁO DỤNG CỤ TOÀN XƯỞNG – XƯỞNG SỬA CHỮA",
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
  { header: "Tem nhôm", width: 14 },
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
