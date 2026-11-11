import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HISTORY_LIMIT, canViewEquipmentHistory } from "../src/lib/equipment-history";

const base = {
  wholeWorkshop: false,
  groupIds: ["g-ws"],
  ownerGroupId: "g-cbl",
  heldByBorrowerGroupIds: [] as string[],
  transferGroupIds: [] as string[],
};

test("lịch sử máy: vai trò toàn Xưởng xem được mọi máy", () => {
  assert.equal(canViewEquipmentHistory({ ...base, wholeWorkshop: true }), true);
  assert.equal(canViewEquipmentHistory({ ...base, wholeWorkshop: true, groupIds: [] }), true);
});

test("lịch sử máy: người dùng nhóm chỉ xem máy thuộc nhóm mình", () => {
  assert.equal(canViewEquipmentHistory({ ...base, ownerGroupId: "g-ws" }), true);
  assert.equal(canViewEquipmentHistory(base), false, "máy của nhóm khác, không liên quan");
  assert.equal(canViewEquipmentHistory({ ...base, groupIds: [] , ownerGroupId: "g-ws" }), false, "chưa có nhóm nào");
});

test("lịch sử máy: nhóm đang giữ do mượn hoặc có điều chuyển mở cũng xem được", () => {
  assert.equal(canViewEquipmentHistory({ ...base, heldByBorrowerGroupIds: ["g-ws"] }), true);
  assert.equal(canViewEquipmentHistory({ ...base, transferGroupIds: ["g-cbl", "g-ws"] }), true);
  assert.equal(canViewEquipmentHistory({ ...base, heldByBorrowerGroupIds: ["g-coi"], transferGroupIds: ["g-coi"] }), false);
});

test("trang Dụng cụ nhóm tôi không còn tải sẵn nhật ký của mọi máy; tab Lịch sử gọi server action", async () => {
  const page = await readFile(new URL("../src/app/(app)/my-equipment/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /activityLogs/, "trang không được truy vấn activity_logs");
  const workspace = await readFile(new URL("../src/components/equipment/equipment-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /loadEquipmentHistoryAction/);
  assert.ok(HISTORY_LIMIT > 0 && HISTORY_LIMIT <= 500, "có giới hạn số dòng lịch sử mỗi lần tải");
});
