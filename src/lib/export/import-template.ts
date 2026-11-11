/**
 * File Excel mẫu cho "Nhập máy từ Excel": sheet "Nhập máy" (tiêu đề ở dòng 1, có ô chọn danh sách
 * cho Nhóm quản lý / Nhóm thiết bị / Tình trạng), sheet "Hướng dẫn" và sheet "Danh mục".
 */
import ExcelJS from "exceljs";
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";
import { BORDER, BRAND, newWorkbook, solidFill, toBytes } from "@/lib/export/workbook-kit";
import { CONDITION_IMPORT_OPTIONS, IMPORT_COLUMNS, IMPORT_MAX_ROWS, IMPORT_SHEET_NAME } from "@/lib/import/equipment-import";

const LIST_SHEET = "Danh mục";

export async function buildImportTemplate(input: { groupNames: string[]; generatedAt: Date }): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);

  const data = workbook.addWorksheet(IMPORT_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  const guide = workbook.addWorksheet("Hướng dẫn");
  const lists = workbook.addWorksheet(LIST_SHEET);

  // --- Danh mục (nguồn cho ô chọn) ---
  const categoryNames = EQUIPMENT_CATEGORIES.map((c) => c.name);
  const conditionNames = CONDITION_IMPORT_OPTIONS.map((c) => c.label);
  lists.columns = [{ width: 38 }, { width: 46 }, { width: 22 }];
  [["Nhóm quản lý", "Nhóm thiết bị", "Tình trạng"]].forEach((header) => {
    const row = lists.addRow(header);
    row.eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = solidFill(BRAND); });
  });
  const listLength = Math.max(input.groupNames.length, categoryNames.length, conditionNames.length);
  for (let i = 0; i < listLength; i++) lists.addRow([input.groupNames[i] ?? "", categoryNames[i] ?? "", conditionNames[i] ?? ""]);

  // --- Sheet nhập ---
  IMPORT_COLUMNS.forEach((column, index) => {
    data.getColumn(index + 1).width = column.width;
    const cell = data.getCell(1, index + 1);
    cell.value = column.required ? `${column.header} *` : column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill(BRAND);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER;
  });
  data.getRow(1).height = 34;

  const columnIndex = (key: string) => IMPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
  const listRule = (column: "A" | "B" | "C", last: number): ExcelJS.DataValidation => ({
    type: "list",
    allowBlank: true,
    formulae: [`'${LIST_SHEET}'!$${column}$2:$${column}$${Math.max(2, last + 1)}`],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Giá trị ngoài danh sách",
    error: "Hãy chọn đúng giá trị trong danh sách, nếu không dòng này sẽ báo lỗi khi kiểm tra.",
  });
  const rules: Array<[string, ExcelJS.DataValidation]> = [
    ["group", listRule("A", input.groupNames.length)],
    ["category", listRule("B", categoryNames.length)],
    ["condition", listRule("C", conditionNames.length)],
  ];
  for (let row = 2; row <= IMPORT_MAX_ROWS + 1; row++) {
    for (const [key, rule] of rules) data.getCell(row, columnIndex(key)).dataValidation = rule;
    // Tem nhôm và serial nhập dạng chữ để Excel không tự đổi "00123" thành số 123.
    data.getCell(row, columnIndex("legacyCode")).numFmt = "@";
    data.getCell(row, columnIndex("serial")).numFmt = "@";
  }

  // --- Hướng dẫn ---
  guide.getColumn(1).width = 110;
  const lines: Array<[string, boolean?]> = [
    ["Hướng dẫn nhập máy từ Excel", true],
    ["1. Điền mỗi máy một dòng ở sheet “Nhập máy”, bắt đầu từ dòng 2. Cột có dấu * là bắt buộc (Nhóm quản lý, Tên CCDC).", false],
    ["2. Nhóm quản lý, Nhóm thiết bị, Tình trạng: chọn trong danh sách thả xuống (hoặc gõ đúng tên trong sheet “Danh mục”).", false],
    ["3. Bỏ trống “Nhóm thiết bị” thì máy vào nhóm “Khác”; bỏ trống “Loại” thì lấy theo tên CCDC; bỏ trống “Tình trạng” thì là “Tốt”.", false],
    ["4. Tem nhôm là mã đã bấm/khắc trên máy. Mã hệ thống do chương trình tự cấp, KHÔNG nhập ở đây.", false],
    ["5. Dòng trùng Tem nhôm hoặc Serial với máy đã có (hoặc trùng dòng khác trong file) sẽ được BỎ QUA và báo rõ. Ô ghi “-” hoặc “N/A” coi như để trống.", false],
    ["6. Chỉ tạo máy mới. Muốn sửa máy đã có, hãy sửa trực tiếp trên màn hình “Dụng cụ nhóm tôi”.", false],
    [`7. Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} máy, file .xlsx không quá 2 MB. Bấm “Kiểm tra file” trước; chỉ khi không còn dòng lỗi mới nhập được.`, false],
  ];
  lines.forEach(([text, bold], index) => {
    const cell = guide.getCell(index + 1, 1);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = bold ? { bold: true, size: 14, color: { argb: BRAND } } : { size: 11 };
  });

  return toBytes(await workbook.xlsx.writeBuffer());
}
