import assert from "node:assert/strict";
import test from "node:test";
import {
  BORROWER_HOLDING_STATUSES,
  OPEN_MACHINE_LOAN_STATUSES,
  isHeldByBorrower,
  isOpenMachineLoanStatus,
} from "../src/lib/loan-status";
import { isIsoDate, isNotPastDate } from "../src/lib/date-check";

test("nhóm mượn chỉ giữ máy khi đang mượn hoặc có sự cố", () => {
  assert.equal(isHeldByBorrower("on_loan"), true);
  assert.equal(isHeldByBorrower("incident"), true);
});

test("đã báo trả hoặc phiếu đã đóng thì nhóm mượn không còn giữ máy", () => {
  for (const status of ["return_requested", "completed", "rejected", "cancelled", "pending_owner", null, undefined, ""]) {
    assert.equal(isHeldByBorrower(status), false, `status=${String(status)}`);
  }
});

test("trạng thái giữ máy luôn là trạng thái phiếu còn mở", () => {
  for (const status of BORROWER_HOLDING_STATUSES) assert.equal(isOpenMachineLoanStatus(status), true);
  assert.equal(isOpenMachineLoanStatus("return_requested"), true);
  assert.equal(isOpenMachineLoanStatus("completed"), false);
  assert.equal(OPEN_MACHINE_LOAN_STATUSES.includes("completed" as never), false);
});

test("isIsoDate chỉ nhận ngày có thật dạng YYYY-MM-DD", () => {
  assert.equal(isIsoDate("2026-11-11"), true);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("11/11/2026"), false);
  assert.equal(isIsoDate("abc"), false);
  assert.equal(isIsoDate(""), false);
});

test("isNotPastDate chặn ngày quá khứ nhưng nhận hôm nay và tương lai", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  assert.equal(isNotPastDate("2026-11-11", now), true);
  assert.equal(isNotPastDate("2026-11-12", now), true);
  assert.equal(isNotPastDate("2026-11-10", now), false);
  assert.equal(isNotPastDate("không hợp lệ", now), false);
});
