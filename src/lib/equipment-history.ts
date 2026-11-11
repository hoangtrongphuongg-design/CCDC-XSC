/**
 * Quyền xem lịch sử thay đổi của một máy (hàm thuần). Khớp với cách trang "Dụng cụ nhóm tôi"
 * chọn máy: nhóm chủ, nhóm đang giữ do mượn (phiếu on_loan/incident) hoặc bên giao/nhận của
 * điều chuyển đang mở; vai trò xem toàn Xưởng xem được mọi máy.
 */
export const HISTORY_LIMIT = 200;

export function canViewEquipmentHistory(input: {
  /** Admin / Quản lý Xưởng / Người xem toàn xưởng (`canViewWholeWorkshop`). */
  wholeWorkshop: boolean;
  /** Các nhóm tài khoản được phân quyền. */
  groupIds: readonly string[];
  ownerGroupId: string;
  /** Nhóm mượn của các phiếu mượn đang giữ máy (on_loan / incident). */
  heldByBorrowerGroupIds: readonly string[];
  /** Nhóm giao và nhận của các điều chuyển đang mở. */
  transferGroupIds: readonly string[];
}): boolean {
  if (input.wholeWorkshop) return true;
  const mine = new Set(input.groupIds);
  return mine.has(input.ownerGroupId)
    || input.heldByBorrowerGroupIds.some((id) => mine.has(id))
    || input.transferGroupIds.some((id) => mine.has(id));
}
