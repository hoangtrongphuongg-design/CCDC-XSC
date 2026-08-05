import test from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT_CATEGORIES } from "../src/lib/equipment-categories";

test("danh mục thiết bị giữ ở mức vừa đủ: 9 nhóm", () => {
  assert.equal(EQUIPMENT_CATEGORIES.length, 9);
  assert.equal(EQUIPMENT_CATEGORIES.filter((item) => item.discipline === "mechanical").length, 6);
  assert.equal(EQUIPMENT_CATEGORIES.filter((item) => item.discipline === "electrical").length, 2);
  assert.equal(EQUIPMENT_CATEGORIES.filter((item) => item.discipline === "other").length, 1);
});

test("có các nhóm thiết bị trọng tâm", () => {
  const codes = new Set(EQUIPMENT_CATEGORIES.map((item) => item.code));
  assert.equal(codes.has("CK_HAN_CAT"), true);
  assert.equal(codes.has("CK_NANG_HA"), true);
  assert.equal(codes.has("CK_DO_KIEM"), true);
  assert.equal(codes.has("DIEN_DO_KIEM"), true);
});
