/**
 * Trạng thái phiếu mượn máy dùng chung cho các trang và test. Hàm/hằng thuần,
 * không phụ thuộc DB nên dùng được ở cả server lẫn client component.
 */

/** Phiếu mượn máy còn mở (chưa hoàn thành / từ chối / hủy). */
export const OPEN_MACHINE_LOAN_STATUSES = [
  "pending_owner",
  "approved",
  "wait_handover",
  "on_loan",
  "return_requested",
  "incident",
] as const;

/**
 * Nhóm mượn đang thực sự giữ máy. `return_requested` KHÔNG nằm ở đây: nhóm mượn
 * đã báo trả nên máy rời danh sách của họ, nhóm chủ thấy "Chờ nhận lại".
 */
export const BORROWER_HOLDING_STATUSES = ["on_loan", "incident"] as const;

export type MachineLoanOpenStatus = (typeof OPEN_MACHINE_LOAN_STATUSES)[number];

export function isOpenMachineLoanStatus(status: string | null | undefined): boolean {
  return Boolean(status && (OPEN_MACHINE_LOAN_STATUSES as readonly string[]).includes(status));
}

export function isHeldByBorrower(status: string | null | undefined): boolean {
  return Boolean(status && (BORROWER_HOLDING_STATUSES as readonly string[]).includes(status));
}
