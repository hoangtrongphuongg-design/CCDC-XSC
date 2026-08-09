import test from "node:test";
import assert from "node:assert/strict";
import { getRoleSummary, getSystemRoleLabels, hasSystemRole } from "../src/lib/auth/roles";
import type { AuthContext } from "../src/lib/auth/session";

function makeAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    username: "user1",
    fullName: "User 1",
    employeeCode: "NV001",
    accountStatus: "active",
    isAdmin: false,
    isWsManager: false,
    isWorkshopAdmin: false,
    isReadOnlyViewer: false,
    mustChangePassword: false,
    sessionVersion: 1,
    primaryGroupId: "g1",
    primaryGroupName: "Bảo trì cơ - Nhóm Workshop",
    permissions: [{
      groupId: "g1",
      groupCode: "WORKSHOP",
      groupName: "Bảo trì cơ - Nhóm Workshop",
      level: "viewer",
      isPrimary: true,
    }],
    ...overrides,
  };
}

test("Quản lý Xưởng / Admin là một vai trò hệ thống gộp", () => {
  const auth = makeAuth({ isAdmin: true, isWorkshopAdmin: true });
  assert.equal(hasSystemRole(auth, "workshopAdmin"), true);
  assert.deepEqual(getSystemRoleLabels(auth), ["Quản lý Xưởng / Admin"]);
  assert.match(getRoleSummary(auth), /Quản lý Xưởng \/ Admin/);
});

test("Người xem toàn xưởng là vai trò đọc độc lập", () => {
  const auth = makeAuth({
    isReadOnlyViewer: true,
    primaryGroupId: null,
    primaryGroupName: null,
    permissions: [],
  });
  assert.equal(hasSystemRole(auth, "readOnlyViewer"), true);
  assert.deepEqual(getSystemRoleLabels(auth), ["Người xem toàn xưởng"]);
  assert.equal(getRoleSummary(auth), "Người xem toàn xưởng");
});

test("vai trò nhóm hiển thị theo chức danh thực tế của Xưởng", () => {
  const auth = makeAuth({ permissions: [{
    groupId: "g1",
    groupCode: "WORKSHOP",
    groupName: "Bảo trì cơ - Nhóm Workshop",
    level: "operator",
    isPrimary: true,
  }] });
  assert.match(getRoleSummary(auth), /Kỹ sư giám sát/);
});
