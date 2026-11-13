/**
 * "Danh tính" của một máy / CCDC đã có mã hệ thống (hàm thuần, dùng được cả client lẫn server).
 *
 * Mã hệ thống là số căn cước của đúng MỘT vật thể: không đổi, không cấp lại. Vì lịch sử (phiếu mượn, sửa chữa, điều
 * chuyển, nhật ký) gắn theo mã, nên Tên / Nhóm thiết bị / Loại — thứ nói "đây là cái gì" — khóa sau khi có mã. Muốn đổi
 * chủng loại nghĩa là máy khác → tạo mã mới. Nhập sai thì Quản lý Xưởng / Admin hiệu chỉnh, bắt buộc lý do, có nhật ký.
 *
 * Tem nhôm là nhãn vật lý của đúng một máy: không dùng lại số tem của máy đã thanh lý, không một tem cho hai máy.
 */

/** So sánh chữ: bỏ khoảng trắng thừa, không phân biệt hoa/thường (vẫn phân biệt dấu). */
export function foldIdentityText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

/** Khóa so khớp tem nhôm. Rỗng = không có tem. */
export function normalizeLegacyCode(value: string | null | undefined): string {
  return foldIdentityText(value);
}

export type IdentityFields = { name: string; equipmentType: string; categoryCode: string };

export const IDENTITY_FIELD_LABELS: Record<keyof IdentityFields, string> = {
  name: "Tên",
  categoryCode: "Nhóm thiết bị",
  equipmentType: "Loại",
};

/** Các trường danh tính thay đổi giữa bản đang lưu và bản gửi lên (nhãn tiếng Việt, rỗng = không đổi). */
export function changedIdentityFields(before: IdentityFields, next: IdentityFields): string[] {
  const changed: string[] = [];
  if (foldIdentityText(before.name) !== foldIdentityText(next.name)) changed.push(IDENTITY_FIELD_LABELS.name);
  if (before.categoryCode !== next.categoryCode) changed.push(IDENTITY_FIELD_LABELS.categoryCode);
  if (foldIdentityText(before.equipmentType) !== foldIdentityText(next.equipmentType)) changed.push(IDENTITY_FIELD_LABELS.equipmentType);
  return changed;
}

/** Quyền đổi danh tính: chỉ Quản lý Xưởng / Admin (và vẫn phải ghi lý do). */
export function canChangeIdentity(subject: { isAdmin: boolean; isWsManager: boolean; isReadOnlyViewer: boolean }): boolean {
  return (subject.isAdmin || subject.isWsManager) && !subject.isReadOnlyViewer;
}

export type LegacyConflict = { code: string; status: string };

/** Thông báo khi tem nhôm đã thuộc máy khác; máy đã vào Kho thanh lý có lời nhắc riêng. */
export function legacyConflictMessage(legacyCode: string, other: LegacyConflict): string {
  if (other.status === "disposal_warehouse") {
    return `Tem nhôm “${legacyCode}” thuộc máy đã thanh lý ${other.code}, không dùng lại số tem này cho máy khác. Nếu tem thật đã gỡ ra, nhờ Quản lý Xưởng xóa tem ở hồ sơ ${other.code} trước.`;
  }
  return `Tem nhôm “${legacyCode}” đang gắn cho máy ${other.code}. Mỗi tem chỉ thuộc một máy; kiểm tra lại tem thực tế.`;
}
