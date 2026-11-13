/**
 * Trạng thái "đang mở" / "đã đóng" của các quy trình (hàm/hằng thuần). Dùng chung cho các trang
 * danh sách (luôn tải đủ phiếu đang mở, phiếu đã đóng chỉ lấy gần nhất), `workflows.ts` và các
 * truy vấn khác. `tests/workflow-status.test.ts` đảm bảo "mở + đóng" luôn đủ mọi giá trị enum
 * trong `schema.ts`: thêm trạng thái mới mà quên khai báo ở đây thì test fail.
 *
 * Mượn máy: xem OPEN_MACHINE_LOAN_STATUSES ở `lib/loan-status.ts`.
 */

export const CLOSED_MACHINE_LOAN_STATUSES = ["completed", "rejected", "cancelled"] as const;

export const OPEN_QUICK_LOAN_STATUSES = ["pending_approval", "pending_receipt", "borrowed", "return_reported"] as const;
export const CLOSED_QUICK_LOAN_STATUSES = ["completed", "rejected", "cancelled"] as const;

export const OPEN_TRANSFER_STATUSES = ["pending_source", "pending_target", "pending_ws", "wait_handover"] as const;
export const CLOSED_TRANSFER_STATUSES = ["completed", "rejected", "cancelled"] as const;

export const OPEN_REPAIR_STATUSES = ["pending_acceptance", "repairing", "wait_owner_confirm", "wait_owner_receive"] as const;
export const CLOSED_REPAIR_STATUSES = ["completed", "irreparable", "cancelled"] as const;

/** Dùng cho cả phiếu thanh lý máy (`disposals`) lẫn thanh lý CCDC theo số lượng (`tool_disposals`). */
export const OPEN_DISPOSAL_STATUSES = ["pending_group", "pending_ws", "wait_warehouse"] as const;
export const CLOSED_DISPOSAL_STATUSES = ["completed", "rejected", "cancelled"] as const;

/** Số phiếu đã đóng gần nhất hiển thị kèm phiếu đang mở trên các trang danh sách. */
export const RECENT_CLOSED_LIMIT = 100;
