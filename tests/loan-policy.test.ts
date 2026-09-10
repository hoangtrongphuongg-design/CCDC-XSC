import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("mượn máy: thành viên nhóm mượn tạo/báo trả (viewer), GS hoặc Đốc công nhóm cho duyệt và xác nhận nhận lại (operator)", async () => {
  const text = await source("src/actions/machine-loans.ts");
  assert.match(text, /requireGroupPermission\(borrowerGroupId, "viewer"\)/);
  assert.match(text, /requireGroupPermission\(loan\.ownerGroupId, "operator"\)/);
  assert.match(text, /requireGroupPermission\(loan\.borrowerGroupId, "viewer"\)/);
  // V1.6.4: chỉ operator+ của nhóm sở hữu được xác nhận nhận lại.
  assert.match(text, /confirmMachineReturnAction[\s\S]*requireGroupPermission\(loan\.ownerGroupId, "operator"\)/);
});

test("mượn nhanh có bước chờ nhóm cho mượn duyệt trước khi xác nhận nhận", async () => {
  const text = await source("src/actions/quick-loans.ts");
  assert.match(text, /status: "pending_approval"/);
  assert.match(text, /approveQuickLoanAction/);
  assert.match(text, /requireGroupPermission\(loan\.sourceGroupId, "operator"\)/);
  // V1.6.7: chỉ thành viên có quyền thao tác (operator+) của nhóm cho mượn được chốt nhận lại.
  assert.match(text, /closeQuickLoanAction[\s\S]*requireGroupPermission\(loan\.sourceGroupId, "operator"\)/);
});
