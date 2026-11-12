import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalKey, cleanLabel, createCanonicalizer, pickCanonicalSpellings, rankLabels } from "../src/lib/canonical-text";
import { applyCanonicalText, type ParsedImportRow } from "../src/lib/import/equipment-import";

test("cleanLabel gộp khoảng trắng; canonicalKey không phân biệt hoa/thường nhưng vẫn phân biệt dấu", () => {
  assert.equal(cleanLabel("  Máy   hàn \t que  "), "Máy hàn que");
  assert.equal(cleanLabel(null), "");
  assert.equal(canonicalKey("MÁY HÀN  QUE"), canonicalKey("máy hàn que"));
  assert.notEqual(canonicalKey("Máy hàn que"), canonicalKey("May han que"));
  assert.equal(canonicalKey("ĐÈN"), canonicalKey("đèn"), "chữ Việt hoa/thường khớp nhau");
});

test("createCanonicalizer: dùng đúng cách viết đã biết, loại mới giữ nguyên và được ghi nhớ", () => {
  const canon = createCanonicalizer(["Máy hàn que", "Máy mài góc"]);
  assert.equal(canon("máy hàn  que "), "Máy hàn que");
  assert.equal(canon("MÁY MÀI GÓC"), "Máy mài góc");
  assert.equal(canon("Máy cắt mới"), "Máy cắt mới", "loại chưa có vẫn thêm được");
  assert.equal(canon("máy cắt MỚI"), "Máy cắt mới", "lần sau theo cách viết đã ghi nhớ");
  assert.equal(canon("   "), "");
  const withDupes = createCanonicalizer(["Tủ số 2", "tủ số 2"]);
  assert.equal(withDupes("TỦ SỐ 2"), "Tủ số 2", "trùng trong danh mục thì cách viết đứng trước thắng");
});

test("pickCanonicalSpellings: nhiều nhất thắng; hòa thì chữ hoa đầu, rồi thứ tự chữ cái", () => {
  const picked = pickCanonicalSpellings([
    "máy hàn que", "Máy hàn que", "Máy hàn que ", "MÁY HÀN QUE",   // Máy hàn que = 2 lần
    "kho a", "Kho A",                                              // hòa 1-1 → chữ hoa đầu
    "xưởng 1", "Xưởng 1", "Xưởng 1", "xưởng 1",                    // hòa 2-2 → chữ hoa đầu
  ]);
  assert.equal(picked.get(canonicalKey("Máy hàn que")), "Máy hàn que");
  assert.equal(picked.get(canonicalKey("kho a")), "Kho A");
  assert.equal(picked.get(canonicalKey("xưởng 1")), "Xưởng 1");
  assert.equal(pickCanonicalSpellings(["", "   ", null, undefined]).size, 0);
});

test("rankLabels: mỗi giá trị một lần, dùng nhiều nhất lên đầu", () => {
  const ranked = rankLabels(["Kho A", "kho a", "Xưởng 1", "Xưởng 1", "Xưởng 1", "Tủ 2", "", null]);
  assert.deepEqual(ranked, ["Xưởng 1", "Kho A", "Tủ 2"]);
});

function okRow(over: Partial<NonNullable<ParsedImportRow["record"]>>): ParsedImportRow {
  const record = {
    ownerGroupId: "g", groupCode: "CBL", groupName: "Nhóm CBL", name: "Máy hàn", equipmentType: "máy hàn que", categoryCode: "CK_HAN_CAT",
    legacyCode: null, brand: null, model: null, serial: null, manufactureYear: null, commissionYear: null,
    currentLocation: "kho  a", condition: "good" as const, notes: null, ...over,
  };
  return { rowNumber: 2, state: "ok", messages: [], preview: { group: "g", name: record.name, type: record.equipmentType, legacyCode: "", serial: "" }, record };
}

test("nhập Excel: Loại/Vị trí về cách viết đã có, cập nhật cả bảng xem trước; dòng lỗi không bị đụng", () => {
  const rows = [
    okRow({}),
    okRow({ equipmentType: "MÁY HÀN QUE", currentLocation: "KHO A" }),
    okRow({ equipmentType: "Máy lạ", currentLocation: "Tủ 9" }),
    okRow({ equipmentType: "Máy lạ", currentLocation: null }),
    { rowNumber: 9, state: "error" as const, messages: ["lỗi"], preview: { group: "", name: "", type: "máy hàn que", legacyCode: "", serial: "" } },
  ];
  const typeCanon = createCanonicalizer(["Máy hàn que"]);
  const locationCanon = createCanonicalizer(["Kho A"]);
  applyCanonicalText(rows, { canonicalType: (_category, value) => typeCanon(value), canonicalLocation: locationCanon });
  assert.deepEqual(rows.slice(0, 4).map((r) => r.record!.equipmentType), ["Máy hàn que", "Máy hàn que", "Máy lạ", "Máy lạ"]);
  assert.deepEqual(rows.slice(0, 4).map((r) => r.record!.currentLocation), ["Kho A", "Kho A", "Tủ 9", null]);
  assert.equal(rows[0].preview.type, "Máy hàn que");
  assert.equal(rows[4].preview.type, "máy hàn que", "dòng lỗi giữ nguyên");
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("form lưu máy và nhập Excel đều chuẩn hóa; ô Vị trí có gợi ý; update.sql có khối dọn trùng", async () => {
  const action = await source("src/actions/equipment.ts");
  assert.match(action, /loadCanonicalizers\(\)/);
  assert.match(action, /canonicalType\(data\.categoryCode, data\.equipmentType\)/);
  assert.match(action, /canonicalLocation\(data\.currentLocation\)/);
  assert.match(await source("src/actions/import.ts"), /applyCanonicalText\(rows, await loadCanonicalizers\(\)\)/);
  const workspace = await source("src/components/equipment/equipment-workspace.tsx");
  assert.match(workspace, /list="equipment-locations"/);
  assert.match(workspace, /rankLabels\(equipmentRows\.map/);
  const sql = await source("database/update.sql");
  assert.match(sql, /V1\.6\.13/);
  assert.match(sql, /-- SELECT r\.category_code/, "có câu SELECT xem trước");
  assert.match(sql, /UPDATE equipment e\s+SET equipment_type/);
  const v1613 = sql.slice(sql.indexOf("V1.6.13"), sql.indexOf("V1.7.0") > 0 ? sql.indexOf("V1.7.0") : undefined);
  assert.doesNotMatch(v1613, /DELETE FROM|DROP /i, "không xóa dữ liệu");
});
