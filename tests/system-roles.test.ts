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

test("Admin không tự động là Quản lý Xưởng", () => {
  const auth = makeAuth({ isAdmin: true, isWsManager: false });
  assert.equal(hasSystemRole(auth, "admin"), true);
  assert.equal(hasSystemRole(auth, "wsManager"), false);
  assert.deepEqual(getSystemRoleLabels(auth), ["Quản trị hệ thống"]);
});

test("Quản lý Xưởng không tự động là Admin", () => {
  const auth = makeAuth({ isAdmin: false, isWsManager: true });
  assert.equal(hasSystemRole(auth, "admin"), false);
  assert.equal(hasSystemRole(auth, "wsManager"), true);
  assert.deepEqual(getSystemRoleLabels(auth), ["Quản lý Xưởng"]);
});

test("Nếu một người được cấp cả hai vai trò thì giao diện hiển thị riêng cả hai", () => {
  const auth = makeAuth({ isAdmin: true, isWsManager: true });
  assert.match(getRoleSummary(auth), /Quản trị hệ thống/);
  assert.match(getRoleSummary(auth), /Quản lý Xưởng/);
});
