import test from "node:test";
import assert from "node:assert/strict";
import { hasGroupPermission } from "../src/lib/auth/guards";
import type { AuthContext } from "../src/lib/auth/session";

const auth: AuthContext = {
  userId: "u1",
  username: "test_user",
  fullName: "Test User",
  employeeCode: "NV001",
  accountStatus: "active",
  isAdmin: false,
  isWsManager: false,
  mustChangePassword: false,
  sessionVersion: 1,
  primaryGroupId: "g1",
  primaryGroupName: "NBS",
  permissions: [{ groupId: "g1", groupCode: "NBS", groupName: "NBS", level: "manager", isPrimary: true }],
};

test("manager có quyền operator và manager trong đúng nhóm", () => {
  assert.equal(hasGroupPermission(auth, "g1", "operator"), true);
  assert.equal(hasGroupPermission(auth, "g1", "manager"), true);
});

test("không có quyền ở nhóm khác", () => {
  assert.equal(hasGroupPermission(auth, "g2", "operator"), false);
});
