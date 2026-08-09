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
    isWorkshopAdmin: false,
    isReadOnlyViewer: false,
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

test("Công nhân kỹ thuật có quyền cơ bản nhưng không có quyền Kỹ sư giám sát", () => {
  const auth = makeAuth("viewer");
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), true);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), false);
});

test("Kỹ sư giám sát kế thừa quyền cơ bản nhưng chưa có quyền Đốc công", () => {
  const auth = makeAuth("operator");
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), true);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), true);
  assert.equal(hasGroupPermission(auth, "g1", "manager"), false);
});

test("Đốc công có quyền Công nhân, Kỹ sư giám sát và Đốc công trong đúng nhóm", () => {
  const auth = makeAuth("manager");
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), true);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), true);
  assert.equal(hasGroupPermission(auth, "g1", "manager"), true);
});

test("Không có quyền ở nhóm khác", () => {
  assert.equal(hasGroupPermission(makeAuth("manager"), "g2", "viewer"), false);
});

test("Người xem toàn xưởng không có quyền ghi theo nhóm", () => {
  const auth = { ...makeAuth("manager"), isReadOnlyViewer: true };
  assert.equal(hasGroupPermission(auth, "g1", "viewer"), false);
  assert.equal(hasGroupPermission(auth, "g1", "operator"), false);
});

test("Quản lý Xưởng / Admin có quyền nghiệp vụ ở mọi nhóm", () => {
  const auth = { ...makeAuth("viewer"), isWorkshopAdmin: true };
  assert.equal(hasGroupPermission(auth, "g2", "manager"), true);
});
