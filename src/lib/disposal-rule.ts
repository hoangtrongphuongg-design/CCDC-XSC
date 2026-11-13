/**
 * Máy nào được đề xuất thanh lý (hàm thuần, dùng chung trang Thanh lý và Server Action):
 * tình trạng Hư hỏng hoặc Không thể phục hồi (nhóm tự xác định không còn khả năng sửa, hoặc máy sửa không được đã về nhóm),
 * và máy chưa nằm ở bước khác của vòng đời. `wait_disposal` giữ cho hồ sơ cũ (máy từng bị đặt thẳng Chờ thanh lý).
 * Việc "máy không có phiếu nào đang mở" do `assertEquipmentHasNoOtherOpenWorkflow` kiểm trong transaction.
 */
export const DISPOSABLE_CONDITIONS = ["irreparable", "major_damage", "minor_damage"] as const;
export const DISPOSABLE_STATUSES = ["in_use_owner", "wait_inspection", "wait_disposal"] as const;

export function canProposeDisposal(item: { status: string; condition: string }): boolean {
  if (!(DISPOSABLE_STATUSES as readonly string[]).includes(item.status)) return false;
  return item.status === "wait_disposal" || (DISPOSABLE_CONDITIONS as readonly string[]).includes(item.condition);
}
