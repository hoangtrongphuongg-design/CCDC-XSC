import assert from "node:assert/strict";
import test from "node:test";
import {
  disposalStatusEnum,
  lossStatusEnum,
  machineLoanStatusEnum,
  quickLoanStatusEnum,
  repairStatusEnum,
  transferStatusEnum,
} from "../src/lib/db/schema";
import { OPEN_MACHINE_LOAN_STATUSES } from "../src/lib/loan-status";
import {
  CLOSED_DISPOSAL_STATUSES,
  CLOSED_LOSS_STATUSES,
  CLOSED_MACHINE_LOAN_STATUSES,
  CLOSED_QUICK_LOAN_STATUSES,
  CLOSED_REPAIR_STATUSES,
  CLOSED_TRANSFER_STATUSES,
  OPEN_DISPOSAL_STATUSES,
  OPEN_LOSS_STATUSES,
  OPEN_QUICK_LOAN_STATUSES,
  OPEN_REPAIR_STATUSES,
  OPEN_TRANSFER_STATUSES,
} from "../src/lib/workflow-status";

function assertPartition(name: string, all: readonly string[], open: readonly string[], closed: readonly string[]) {
  const overlap = open.filter((status) => closed.includes(status));
  assert.deepEqual(overlap, [], `${name}: trạng thái vừa mở vừa đóng: ${overlap.join(", ")}`);
  assert.deepEqual([...open, ...closed].sort(), [...all].sort(), `${name}: "mở + đóng" phải đủ mọi giá trị enum trong schema.ts`);
}

test("trạng thái mở/đóng của mọi quy trình phủ đủ enum trong schema (không sót, không trùng)", () => {
  assertPartition("machine_loans", machineLoanStatusEnum.enumValues, OPEN_MACHINE_LOAN_STATUSES, CLOSED_MACHINE_LOAN_STATUSES);
  assertPartition("quick_loans", quickLoanStatusEnum.enumValues, OPEN_QUICK_LOAN_STATUSES, CLOSED_QUICK_LOAN_STATUSES);
  assertPartition("transfers", transferStatusEnum.enumValues, OPEN_TRANSFER_STATUSES, CLOSED_TRANSFER_STATUSES);
  assertPartition("repairs", repairStatusEnum.enumValues, OPEN_REPAIR_STATUSES, CLOSED_REPAIR_STATUSES);
  assertPartition("disposals", disposalStatusEnum.enumValues, OPEN_DISPOSAL_STATUSES, CLOSED_DISPOSAL_STATUSES);
  assertPartition("loss_reports", lossStatusEnum.enumValues, OPEN_LOSS_STATUSES, CLOSED_LOSS_STATUSES);
});
