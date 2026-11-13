/**
 * Xóa hồ sơ tạo nhầm (máy có mã / CCDC theo số lượng) — quy tắc thuần, dùng ở server và giao diện.
 *  - Ai xóa được: Kỹ sư giám sát (operator) trở lên của NHÓM QUẢN LÝ hồ sơ; Quản lý Xưởng / Admin mọi nhóm.
 *    Công nhân kỹ thuật, Người xem, nhóm khác: không.
 *  - Hồ sơ đã có lịch sử (mượn – trả, điều chuyển, sửa chữa, thanh lý, kiểm kê…) thì KHÔNG AI xóa được nữa
 *    (kể cả Quản lý Xưởng / Admin): dùng "Ngừng sử dụng" hoặc quy trình Thanh lý.
 */
export type RecordLevel = "viewer" | "operator" | "manager";

export const HISTORY_BLOCK_MESSAGE =
  "Hồ sơ này đã có lịch sử (mượn – trả, điều chuyển, sửa chữa, thanh lý hoặc kiểm kê) nên không xóa được. Hãy dùng Ngừng sử dụng hoặc quy trình Thanh lý.";
export const PERMISSION_BLOCK_MESSAGE =
  "Chỉ Kỹ sư giám sát trở lên của nhóm quản lý (hoặc Quản lý Xưởng / Admin) được xóa hồ sơ.";

/** Có đủ QUYỀN xóa (chưa xét lịch sử). `level` = bậc của tài khoản ở nhóm quản lý hồ sơ (null = không thuộc nhóm). */
export function hasDeletePermission(input: { isReadOnlyViewer: boolean; isWorkshopAdmin: boolean; level: RecordLevel | null }): boolean {
  if (input.isReadOnlyViewer) return false;
  if (input.isWorkshopAdmin) return true;
  return input.level === "operator" || input.level === "manager";
}

export function canDeleteRecord(input: { isReadOnlyViewer: boolean; isWorkshopAdmin: boolean; level: RecordLevel | null; hasHistory: boolean }): boolean {
  return hasDeletePermission(input) && !input.hasHistory;
}
