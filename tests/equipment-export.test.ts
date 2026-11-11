import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  buildInventoryTree,
  buildMovementNote,
  buildWorkshopTree,
  exportFileName,
  isInGroupScope,
  matchesSearch,
  safeSheetName,
  shortGroupName,
  slugify,
  toExportEquipment,
  vnDate,
  type ExportEquipment,
  type ExportTool,
} from "../src/lib/export/equipment-export";
import { buildInventoryWorkbook, buildWorkshopWorkbook } from "../src/lib/export/equipment-workbook";

const GROUPS = {
  COI: { id: "g-coi", code: "COI", name: "Bảo trì cơ - Nhóm Cối" },
  CBL: { id: "g-cbl", code: "CBL", name: "Bảo trì cơ - Nhóm CBL" },
  WORKSHOP: { id: "g-ws", code: "WORKSHOP", name: "Bảo trì cơ - Nhóm Workshop" },
};

function machine(code: string, overrides: Partial<ExportEquipment> = {}): ExportEquipment {
  return {
    id: `id-${code}`,
    code,
    legacyCode: null,
    name: `Máy ${code}`,
    brand: null,
    model: null,
    serial: null,
    categoryCode: "CK_HAN_CAT",
    equipmentType: "Máy hàn que",
    ownerGroupId: GROUPS.CBL.id,
    ownerGroupCode: GROUPS.CBL.code,
    ownerGroupName: GROUPS.CBL.name,
    currentGroupName: GROUPS.CBL.name,
    currentLocation: null,
    status: "in_use_owner",
    condition: "good",
    loanStatus: null,
    loanOwnerGroupId: null,
    loanBorrowerGroupId: null,
    loanOwnerGroupName: null,
    loanBorrowerGroupName: null,
    transferStatus: null,
    transferSourceGroupId: null,
    transferTargetGroupId: null,
    transferSourceGroupName: null,
    transferTargetGroupName: null,
    repairStatus: null,
    ...overrides,
  };
}

function inGroup(group: (typeof GROUPS)[keyof typeof GROUPS]): Partial<ExportEquipment> {
  return { ownerGroupId: group.id, ownerGroupCode: group.code, ownerGroupName: group.name, currentGroupName: group.name };
}

async function readBack(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return workbook;
}

/** Giá trị cột A của mọi dòng (để kiểm tra thứ tự dòng tiêu đề nhóm/loại). */
function columnA(ws: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  ws.eachRow((row) => values.push(String(row.getCell(1).value ?? "")));
  return values;
}

test("báo cáo toàn xưởng: nhóm theo thứ tự cơ cấu chuẩn, loại cùng loại liền nhau, máy theo mã tự nhiên", () => {
  const rows = [
    machine("WS-0001", { ...inGroup(GROUPS.WORKSHOP), equipmentType: "Máy mài góc" }),
    machine("CBL-0010", { equipmentType: "Máy hàn que" }),
    machine("CBL-0002", { equipmentType: "máy hàn que " }),
    machine("CBL-0003", { equipmentType: "Máy khoan từ" }),
    machine("COI-0001", { ...inGroup(GROUPS.COI) }),
  ];
  const tree = buildWorkshopTree(rows);

  assert.deepEqual(tree.map((group) => group.groupCode), ["COI", "CBL", "WORKSHOP"]);
  const cbl = tree[1];
  assert.equal(cbl.total, 3);
  assert.deepEqual(cbl.types.map((bucket) => bucket.type), ["Máy hàn que", "Máy khoan từ"]);
  // "Máy hàn que" và "máy hàn que " là cùng một loại, mã 0002 đứng trước 0010.
  assert.deepEqual(cbl.types[0].items.map((item) => item.code), ["CBL-0002", "CBL-0010"]);
});

test("kiểm kê: nhóm thiết bị theo thứ tự danh mục, rồi loại; một nhóm gộp cả máy đang mượn", () => {
  const rows = [
    machine("CBL-0001", { categoryCode: "KHAC", equipmentType: "Thiết bị chuyên dụng" }),
    machine("CBL-0002", { categoryCode: "CK_DO_KIEM", equipmentType: "Thước cặp" }),
    machine("CBL-0003", { categoryCode: "CK_HAN_CAT" }),
    machine("WS-0007", { ...inGroup(GROUPS.WORKSHOP), categoryCode: "CK_HAN_CAT", loanStatus: "on_loan" }),
  ];
  const tree = buildInventoryTree(rows, GROUPS.CBL);

  assert.equal(tree.length, 1);
  assert.equal(tree[0].total, 4);
  assert.deepEqual(tree[0].categories.map((category) => category.categoryCode), ["CK_HAN_CAT", "CK_DO_KIEM", "KHAC"]);
  assert.equal(tree[0].categories[0].total, 2);

  const byOwner = buildInventoryTree(rows);
  assert.deepEqual(byOwner.map((group) => group.groupCode), ["CBL", "WORKSHOP"]);
});

test("phạm vi nhóm: chủ, nhóm đang giữ do mượn, bên giao/nhận điều chuyển mở", () => {
  const lent = machine("CBL-0001", { loanStatus: "on_loan", loanOwnerGroupId: GROUPS.CBL.id, loanBorrowerGroupId: GROUPS.WORKSHOP.id });
  assert.equal(isInGroupScope(lent, GROUPS.CBL.id), true);
  assert.equal(isInGroupScope(lent, GROUPS.WORKSHOP.id), true);
  assert.equal(isInGroupScope(lent, GROUPS.COI.id), false);

  const returned = { ...lent, loanStatus: "return_requested" };
  assert.equal(isInGroupScope(returned, GROUPS.WORKSHOP.id), false, "đã báo trả thì nhóm mượn không còn giữ");
  assert.equal(isInGroupScope(returned, GROUPS.CBL.id), true);

  const transferring = machine("CBL-0002", { transferStatus: "pending_ws", transferSourceGroupId: GROUPS.CBL.id, transferTargetGroupId: GROUPS.COI.id });
  assert.equal(isInGroupScope(transferring, GROUPS.COI.id), true);
});

test("ghi chú mượn/trả/điều chuyển/sửa chữa", () => {
  assert.equal(buildMovementNote(machine("A")), "");
  assert.equal(
    buildMovementNote(machine("A", { loanStatus: "on_loan", loanOwnerGroupName: GROUPS.CBL.name, loanBorrowerGroupName: GROUPS.WORKSHOP.name })),
    "Đang mượn: Nhóm Workshop mượn của Nhóm CBL",
  );
  assert.match(
    buildMovementNote(machine("A", { loanStatus: "return_requested", loanOwnerGroupName: GROUPS.CBL.name, loanBorrowerGroupName: GROUPS.WORKSHOP.name })),
    /Đã báo trả, chờ Nhóm CBL nhận lại/,
  );
  assert.equal(
    buildMovementNote(machine("A", { transferStatus: "pending_target", transferSourceGroupName: GROUPS.CBL.name, transferTargetGroupName: GROUPS.COI.name, repairStatus: "repairing" })),
    "Đang điều chuyển: Nhóm CBL → Nhóm Cối; Đang sửa chữa",
  );
  assert.equal(shortGroupName("Bảo trì điện - Nhóm điện Mỏ"), "Nhóm điện Mỏ");
});

test("tên sheet hợp lệ của Excel: ≤31 ký tự, bỏ ký tự cấm, không trùng", () => {
  const used = new Set<string>();
  const a = safeSheetName("Bảo trì điện - Nhóm Nghiền XM - Trạm điện - Phụ trợ", used);
  assert.ok(a.length <= 31);
  assert.equal(safeSheetName("A/B:C*D?[E]", used), "A B C D E");
  const b = safeSheetName("Kiểm kê", used);
  const c = safeSheetName("kiểm kê", used);
  assert.notEqual(b.toLowerCase(), c.toLowerCase());
  assert.ok(c.length <= 31);
  assert.equal(safeSheetName("", new Set()), "Sheet");
});

test("tên file không dấu và dùng ngày giờ Việt Nam (không lệch ngày UTC)", () => {
  assert.equal(slugify("Bảo trì cơ - Nhóm Đức"), "bao-tri-co-nhom-duc");
  // 20:30 UTC ngày 11 = 03:30 ngày 12 theo giờ Việt Nam.
  const now = new Date("2026-11-11T20:30:00Z");
  assert.equal(vnDate(now), "2026-11-12");
  assert.equal(exportFileName("kiem-ke", "Nhóm CBL", now), "kiem-ke-nhom-cbl-2026-11-12.xlsx");
  assert.equal(exportFileName("bao-cao", null, now), "bao-cao-2026-11-12.xlsx");
});

test("tìm kiếm không phân biệt hoa thường theo tiếng Việt", () => {
  assert.equal(matchesSearch(["Máy HÀN que", null], "hàn QUE"), true);
  assert.equal(matchesSearch(["Máy mài"], "hàn"), false);
  assert.equal(matchesSearch(["bất kỳ"], "   "), true);
});

test("workbook toàn xưởng: 1 sheet danh sách phân nhóm → loại, đọc lại đúng", async () => {
  const rows = [
    machine("CBL-0001", { name: "=SUM(1+1)", brand: "Hồng Ký", model: "HK300A", loanStatus: "on_loan", loanOwnerGroupName: GROUPS.CBL.name, loanBorrowerGroupName: GROUPS.WORKSHOP.name }),
    machine("CBL-0002", { equipmentType: "Máy khoan từ" }),
    machine("WS-0001", { ...inGroup(GROUPS.WORKSHOP), equipmentType: "Máy mài góc" }),
  ];
  const bytes = await buildWorkshopWorkbook({
    generatedAt: new Date("2026-11-11T05:00:00Z"),
    exportedBy: "Nguyễn Văn A (1001)",
    query: "",
    tree: buildWorkshopTree(rows),
    tools: [],
  });
  const workbook = await readBack(bytes);

  assert.deepEqual(workbook.worksheets.map((ws) => ws.name), ["Toàn xưởng"]);
  const ws = workbook.getWorksheet("Toàn xưởng")!;
  assert.match(String(ws.getCell("A1").value), /BÁO CÁO DỤNG CỤ TOÀN XƯỞNG/);
  assert.match(String(ws.getCell("A2").value), /Tổng: 3 máy/);
  assert.equal(ws.getCell("B4").value, "Mã hệ thống");
  assert.equal(ws.getCell("A4").fill?.type, "pattern");

  const labels = columnA(ws);
  const iCbl = labels.findIndex((value) => value.startsWith("Bảo trì cơ - Nhóm CBL"));
  const iWs = labels.findIndex((value) => value.startsWith("Bảo trì cơ - Nhóm Workshop"));
  assert.ok(iCbl > 0 && iWs > iCbl, "nhóm CBL đứng trước Workshop");
  assert.ok(labels.some((value) => value.startsWith("Máy hàn que (1)")));
  assert.ok(labels.some((value) => value.startsWith("Máy khoan từ (1)")));

  // Chuỗi bắt đầu bằng "=" phải là text, không phải công thức.
  let injected: ExcelJS.Cell | undefined;
  ws.eachRow((row) => { if (row.getCell(2).value === "CBL-0001") injected = row.getCell(4); });
  assert.ok(injected);
  assert.equal(injected!.type, ExcelJS.ValueType.String);
  assert.equal(injected!.value, "=SUM(1+1)");

  assert.ok(ws.autoFilter, "có bộ lọc tự động");
  assert.equal(ws.views[0]?.state, "frozen");
  assert.equal(ws.views[0]?.ySplit, 4);
  assert.equal(ws.pageSetup.orientation, "landscape");
  assert.equal(ws.pageSetup.fitToWidth, 1);
});

test("workbook kiểm kê: nhóm thiết bị → loại, cột kiểm kê trống, sheet số lượng có công thức chênh lệch", async () => {
  const rows = [
    machine("CBL-0001", { categoryCode: "CK_HAN_CAT", equipmentType: "Máy hàn que" }),
    machine("CBL-0002", { categoryCode: "CK_DO_KIEM", equipmentType: "Thước cặp" }),
  ];
  const tools: ExportTool[] = [
    { code: "CBL-VT-0001", name: "Mũi khoan Ø12", specification: "HSS", unit: "Cái", quantity: 12, categoryCode: "KHAC", equipmentType: "Dụng cụ khác", groupId: GROUPS.CBL.id, groupCode: "CBL", groupName: GROUPS.CBL.name },
  ];
  const bytes = await buildInventoryWorkbook({
    generatedAt: new Date("2026-11-11T05:00:00Z"),
    exportedBy: "Nguyễn Văn A (1001)",
    scopeLabel: GROUPS.CBL.name,
    tree: buildInventoryTree(rows, GROUPS.CBL),
    tools,
  });
  const workbook = await readBack(bytes);

  assert.deepEqual(workbook.worksheets.map((ws) => ws.name), ["Kiểm kê máy", "CCDC theo số lượng"]);
  const ws = workbook.getWorksheet("Kiểm kê máy")!;
  assert.match(String(ws.getCell("A1").value), /KIỂM KÊ CCDC – BẢO TRÌ CƠ - NHÓM CBL/);
  const headers = Array.from({ length: 15 }, (_, i) => String(ws.getRow(4).getCell(i + 1).value));
  assert.deepEqual(headers.slice(-4), ["Có mặt", "Tình trạng thực tế", "Vị trí thực tế", "Ghi chú kiểm kê"]);

  const labels = columnA(ws);
  // Một nhóm duy nhất: không có dòng tiêu đề nhóm, chỉ có nhóm thiết bị → loại.
  assert.ok(!labels.some((value) => value.startsWith("Bảo trì cơ - Nhóm CBL —")));
  const iHan = labels.findIndex((value) => value.startsWith("Cơ khí - Hàn, cắt và gia nhiệt"));
  const iDo = labels.findIndex((value) => value.startsWith("Cơ khí - Đo lường và kiểm tra"));
  assert.ok(iHan > 0 && iDo > iHan);

  let machineRow: ExcelJS.Row | undefined;
  ws.eachRow((row) => { if (row.getCell(2).value === "CBL-0001") machineRow = row; });
  assert.ok(machineRow);
  for (const column of [12, 13, 14, 15]) assert.ok(!machineRow!.getCell(column).value, "cột kiểm kê để trống");

  const toolsSheet = workbook.getWorksheet("CCDC theo số lượng")!;
  const toolRow = toolsSheet.getRow(5);
  assert.equal(toolRow.getCell(7).value, 12);
  const diff = toolRow.getCell(9).value as { formula?: string };
  assert.match(String(diff.formula), /^IF\(H5="","",H5-G5\)$/);
});

test("nhóm đang giữ suy ra từ phiếu mượn, không tin current_group_id lệch", () => {
  const groupById = new Map(Object.values(GROUPS).map((group) => [group.id, { code: group.code, name: group.name }]));
  const raw = {
    id: "x", code: "CBL-0001", legacyCode: null, name: "Máy", brand: null, model: null, serial: null,
    categoryCode: "CK_HAN_CAT", equipmentType: "Máy hàn que",
    ownerGroupId: GROUPS.CBL.id, currentGroupId: GROUPS.WORKSHOP.id, // dữ liệu cũ lệch: current = Workshop
    currentLocation: null, status: "in_use_owner", condition: "good",
  };

  const noLoan = toExportEquipment(raw, { groupById });
  assert.equal(noLoan.currentGroupName, GROUPS.CBL.name, "không còn phiếu mượn thì máy ở nhóm chủ");

  const held = toExportEquipment(raw, { groupById, loan: { status: "on_loan", ownerGroupId: GROUPS.CBL.id, borrowerGroupId: GROUPS.WORKSHOP.id } });
  assert.equal(held.currentGroupName, GROUPS.WORKSHOP.name);
  assert.equal(held.loanBorrowerGroupName, GROUPS.WORKSHOP.name);

  const returned = toExportEquipment(raw, { groupById, loan: { status: "return_requested", ownerGroupId: GROUPS.CBL.id, borrowerGroupId: GROUPS.WORKSHOP.id } });
  assert.equal(returned.currentGroupName, GROUPS.CBL.name, "đã báo trả thì không còn ở nhóm mượn");
});
