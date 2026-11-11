/** Quy tắc thuần cho trang hồ sơ máy `/equipment/[id]`. */
import { isHeldByBorrower } from "@/lib/loan-status";

export const ORIGIN_LABELS: Record<string, string> = {
  existing: "CCDC hiện hữu",
  new_purchase: "Mua mới / Cấp phát ban đầu",
  other: "Khác",
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Nhóm đang giữ máy do mượn (phiếu on_loan / incident); không có thì máy ở nhóm quản lý. */
export function heldByGroupId(loans: ReadonlyArray<{ status: string; borrowerGroupId: string }>): string | null {
  return loans.find((loan) => isHeldByBorrower(loan.status))?.borrowerGroupId ?? null;
}

/**
 * Giá mua, PO, nhà cung cấp chỉ hiện cho Admin / Quản lý Xưởng hoặc thành viên nhóm quản lý máy
 * (file Excel toàn xưởng cũng không xuất đơn giá). Người xem toàn xưởng và nhóm khác không thấy.
 */
export function canSeeFinancials(input: {
  isWorkshopAdmin: boolean;
  isReadOnlyViewer: boolean;
  groupIds: readonly string[];
  ownerGroupId: string;
}): boolean {
  if (input.isReadOnlyViewer) return false;
  return input.isWorkshopAdmin || input.groupIds.includes(input.ownerGroupId);
}

/** Tài khoản có thao tác được với máy này ở "Dụng cụ nhóm tôi" không (nhóm chủ hoặc nhóm đang giữ). */
export function isInMyScope(input: { isReadOnlyViewer: boolean; isWorkshopAdmin: boolean; groupIds: readonly string[]; ownerGroupId: string; heldByGroupId: string | null }): boolean {
  if (input.isReadOnlyViewer) return false;
  if (input.isWorkshopAdmin) return true;
  return input.groupIds.includes(input.ownerGroupId) || (input.heldByGroupId !== null && input.groupIds.includes(input.heldByGroupId));
}
