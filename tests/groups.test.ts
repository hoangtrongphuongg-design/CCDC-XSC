import assert from "node:assert/strict";
import test from "node:test";
import { getGroupCategory, STANDARD_GROUPS, normalizeGroupCode } from "../src/lib/group-structure";

test("cơ cấu chuẩn có 13 nhóm nghiệp vụ và 1 nhóm hệ thống", () => {
  assert.equal(STANDARD_GROUPS.filter((group) => !group.isSystem).length, 13);
  assert.equal(STANDARD_GROUPS.filter((group) => group.isSystem).length, 1);
  assert.equal(STANDARD_GROUPS.find((group) => group.isSystem)?.code, "KHO_TL");
});

test("cơ cấu nghiệp vụ gồm 8 nhóm cơ, 4 nhóm điện và 1 nhóm khác", () => {
  const operational = STANDARD_GROUPS.filter((group) => !group.isSystem);
  assert.equal(operational.filter((group) => group.category === "mechanical").length, 8);
  assert.equal(operational.filter((group) => group.category === "electrical").length, 4);
  assert.equal(operational.filter((group) => group.category === "external").length, 1);
  assert.equal(getGroupCategory("WORKSHOP"), "mechanical");
});

test("mã nhóm chuẩn là duy nhất", () => {
  const codes = STANDARD_GROUPS.map((group) => group.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("chuẩn hóa mã nhóm", () => {
  assert.equal(normalizeGroupCode(" Cơ khí 2 "), "CO_KHI_2");
});
