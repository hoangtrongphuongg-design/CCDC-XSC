import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOCATION_EMPTY, displayLocation } from "../src/lib/location-display";
import { toExportEquipment } from "../src/lib/export/equipment-export";

const loan = (status: string, workLocation: string | null = null) => ({ status, borrowerGroupName: "Nhóm Lò", workLocation });

test("máy đang do nhóm mượn giữ: hiện nhóm mượn (+ vị trí sử dụng), không còn vị trí gốc", () => {
  assert.equal(displayLocation({ stored: "Workshop", loan: loan("on_loan") }), "Tại Nhóm Lò");
  assert.equal(displayLocation({ stored: "Workshop", loan: loan("on_loan", "Xưởng 2") }), "Tại Nhóm Lò · Xưởng 2");
  assert.equal(displayLocation({ stored: "Workshop", loan: loan("incident", " Xưởng 2 ") }), "Tại Nhóm Lò · Xưởng 2");
});

test("trả máy / phiếu chưa giao máy thì về vị trí đã lưu", () => {
  for (const status of ["pending_owner", "approved", "return_requested", "completed", "rejected"]) {
    assert.equal(displayLocation({ stored: "Workshop", loan: loan(status) }), "Workshop", status);
  }
  assert.equal(displayLocation({ stored: "Workshop", loan: null }), "Workshop");
});

test("đang điều chuyển (chờ bàn giao): hiện nhóm nhận; phiếu khác thì bỏ qua", () => {
  assert.equal(displayLocation({ stored: "Workshop", transfer: { status: "wait_handover", targetGroupName: "Nhóm Lò" } }), "Đang điều chuyển → Nhóm Lò");
  assert.equal(displayLocation({ stored: "Workshop", transfer: { status: "pending_ws", targetGroupName: "Nhóm Lò" } }), "Workshop", "chưa duyệt thì máy vẫn ở nơi cũ");
  assert.equal(displayLocation({ stored: "Workshop", loan: loan("on_loan"), transfer: { status: "wait_handover", targetGroupName: "Nhóm Lò" } }), "Tại Nhóm Lò", "đang mượn ưu tiên");
});

test("chưa có vị trí: hiện 'Chưa cập nhật' (hoặc chuỗi rỗng khi xuất Excel)", () => {
  assert.equal(displayLocation({ stored: null }), LOCATION_EMPTY);
  assert.equal(displayLocation({ stored: "   " }), LOCATION_EMPTY);
  assert.equal(displayLocation({ stored: undefined, empty: "" }), "");
});

test("file Excel dùng cùng quy tắc: đang mượn / đang điều chuyển không ghi vị trí gốc, chưa có vị trí thì để trống", () => {
  const groupById = new Map([["g1", { code: "WS", name: "Workshop" }], ["g2", { code: "LO", name: "Nhóm Lò" }]]);
  const raw = {
    id: "e1", code: "WS-0001", legacyCode: null, name: "Máy hàn", brand: null, model: null, serial: null,
    categoryCode: "KHAC", equipmentType: "Máy hàn", ownerGroupId: "g1", currentGroupId: "g1", currentLocation: "Kho Workshop",
    status: "on_loan", condition: "good",
  } as Parameters<typeof toExportEquipment>[0];
  const lent = toExportEquipment(raw, { groupById, loan: { status: "on_loan", ownerGroupId: "g1", borrowerGroupId: "g2", workLocation: "Xưởng 2" } });
  assert.equal(lent.currentLocation, "Tại Nhóm Lò · Xưởng 2");
  const moving = toExportEquipment(raw, { groupById, transfer: { status: "wait_handover", sourceGroupId: "g1", targetGroupId: "g2" } });
  assert.equal(moving.currentLocation, "Đang điều chuyển → Nhóm Lò");
  assert.equal(toExportEquipment(raw, { groupById }).currentLocation, "Kho Workshop");
  assert.equal(toExportEquipment({ ...raw, currentLocation: null }, { groupById }).currentLocation, null);
});

async function source(relativePath: string) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("nhận điều chuyển: ghi vị trí tại nhóm nhận (xóa vị trí cũ nếu không nhập) và trạng thái theo tình trạng; các trang dùng chung hàm hiển thị", async () => {
  const actions = await source("src/actions/transfers.ts");
  const receive = actions.slice(actions.indexOf("export async function confirmTransferReceiptAction"));
  assert.match(receive, /formData\.get\("currentLocation"\)/);
  assert.match(receive, /currentLocation: newLocation/);
  assert.match(receive, /: null;/, "không nhập thì để trống, không giữ vị trí cũ");
  assert.match(receive, /statusForCondition\("in_use_owner", lockedMachine\.condition\)/);
  assert.match(await source("src/app/(app)/transfers/page.tsx"), /name="currentLocation"[^>]*placeholder="Vị trí tại nhóm nhận/);
  assert.match(await source("src/app/(app)/my-equipment/page.tsx"), /locationText: displayLocation\(/);
  assert.match(await source("src/components/equipment/equipment-workspace.tsx"), /\{row\.locationText\}/);
  assert.match(await source("src/app/(app)/equipment/page.tsx"), /locationText\(row\)/);
  assert.match(await source("src/lib/machine-profile-data.ts"), /displayLocation\(/);
  assert.match(await source("src/app/(app)/equipment/[id]/page.tsx"), /\{locationText\}/);
  assert.match(await source("src/lib/equipment-data.ts"), /workLocation: machineLoans\.workLocation/);
});
