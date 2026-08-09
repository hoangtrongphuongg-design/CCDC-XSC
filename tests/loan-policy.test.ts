import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("mượn máy: mọi thành viên nhóm được tạo/nhận/báo trả, GS hoặc Đốc công nhóm cho duyệt", async () => {
  const text = await source("src/actions/machine-loans.ts");
  assert.match(text, /requireGroupPermission\(borrowerGroupId, "viewer"\)/);
  assert.match(text, /requireGroupPermission\(loan\.ownerGroupId, "operator"\)/);
  assert.match(text, /requireGroupPermission\(loan\.borrowerGroupId, "viewer"\)/);
  assert.match(text, /confirmMachineReturnAction[\s\S]*requireGroupPermission\(loan\.ownerGroupId, "viewer"\)/);
});

test("mượn nhanh có bước chờ nhóm cho mượn duyệt trước khi xác nhận nhận", async () => {
  const text = await source("src/actions/quick-loans.ts");
  assert.match(text, /status: "pending_approval"/);
  assert.match(text, /approveQuickLoanAction/);
  assert.match(text, /requireGroupPermission\(loan\.sourceGroupId, "operator"\)/);
  assert.match(text, /closeQuickLoanAction[\s\S]*requireGroupPermission\(loan\.sourceGroupId, "viewer"\)/);
});
