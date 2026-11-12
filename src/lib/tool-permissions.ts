/**
 * Quyền với CCDC quản lý theo số lượng (hàm thuần, dùng được cả client lẫn server). Backend LUÔN kiểm lại bằng
 * `requireGroupPermission`; hàm ở đây chỉ để quyết định hiện nút nào.
 *
 * - Sửa thông tin (tên, quy cách, tình trạng, vị trí, ghi chú): Kỹ sư giám sát (operator) trở lên của nhóm.
 * - Hiệu chỉnh số lượng trực tiếp: Đốc công (manager) trở lên, bắt buộc ghi lý do.
 * - Admin / Quản lý Xưởng đã được `buildEquipmentPermissions` cấp bậc manager ở mọi nhóm; Người xem toàn xưởng chỉ viewer.
 */
export type ToolPermissionLevel = "viewer" | "operator" | "manager";

export type ToolPermission = { groupId: string; level: ToolPermissionLevel };

export const MIN_ADJUST_REASON_LENGTH = 5;

function rank(level: ToolPermissionLevel): number {
  return level === "manager" ? 2 : level === "operator" ? 1 : 0;
}

function levelOf(permissions: ToolPermission[], groupId: string): number {
  const found = permissions.find((permission) => permission.groupId === groupId);
  return found ? rank(found.level) : -1;
}

export function canEditTool(permissions: ToolPermission[], groupId: string): boolean {
  return levelOf(permissions, groupId) >= 1;
}

export function canAdjustToolQuantity(permissions: ToolPermission[], groupId: string): boolean {
  return levelOf(permissions, groupId) >= 2;
}

export type QuantityAdjustmentCheck = { ok: true; reason: string } | { ok: false; message: string };

/** Số mới phải là số hữu hạn ≥ 0, khác số cũ; lý do tối thiểu 5 ký tự (sau khi bỏ khoảng trắng thừa). */
export function validateQuantityAdjustment(input: { oldQty: number; newQty: number; reason: string }): QuantityAdjustmentCheck {
  const { oldQty, newQty } = input;
  if (!Number.isFinite(newQty)) return { ok: false, message: "Số lượng mới không hợp lệ." };
  if (newQty < 0) return { ok: false, message: "Số lượng mới không được âm." };
  if (Math.round(newQty * 100) === Math.round(oldQty * 100)) return { ok: false, message: "Số lượng mới đang trùng số hiện tại." };
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < MIN_ADJUST_REASON_LENGTH) return { ok: false, message: `Hãy ghi lý do hiệu chỉnh (ít nhất ${MIN_ADJUST_REASON_LENGTH} ký tự).` };
  return { ok: true, reason };
}
