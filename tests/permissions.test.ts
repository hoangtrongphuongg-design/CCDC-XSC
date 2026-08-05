import test from "node:test";
import assert from "node:assert/strict";
import { hasGroupPermission } from "../src/lib/auth/guards";
import type { AuthContext } from "../src/lib/auth/session";

function makeAuth(level: "viewer" | "operator" | "manager"): AuthContext {
  return {
    userId: `u-${level}`,
    username: `${level}_user`,
    fullName: `User ${level}`,
    employeeCode: `NV-${level}`,
    accountStatus: "active",
    isAdmin: false,
    isWsManager: false,
    mustChangePassword: false,
    sessionVersion: 1,
    primaryGroupId: "g1",
    primaryGroupName: "Bảo trì cơ - Nhóm Cối",
    permissions: [{
      groupId: "g1",
      groupCode: "COI",
      groupName: "Bảo trì cơ - Nhóm Cối",
      level,
      isPrimary: true,
    }],
  };
}

test("Nhân viên có quyền viewer nhưng không có quyền operator", () => {
  const auth = makeAuth("viewer");
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), true);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), false);
});

test("Operator kế thừa quyền viewer nhưng không có quyền manager", () => {
  const auth = makeAuth("operator");
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), true);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), true);
  assert.equal(hasGroupPermission(auth, "g1", "manager"), false);
});

test("Manager có quyền viewer, operator và manager trong đúng nhóm", () => {
  const auth = makeAuth("manager");
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), true);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), true);
  assert.equal(hasGroupPermission(auth, "g1", "manager"), true);
});

test("Không có quyền ở nhóm khác", () => {
  assert.equal(hasGroupPermission(makeAuth("manager"), "g2", "viewer"), false);
});
