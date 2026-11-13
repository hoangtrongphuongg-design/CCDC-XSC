/**
 * Hệ màu trạng thái DUY NHẤT cho toàn bộ giao diện (hàm thuần). Trước đây mỗi trang tự quyết:
 * cùng "Đang sửa chữa" lúc cam lúc xanh, "Chờ thanh lý" lúc đỏ lúc xanh.
 *
 *   success (xanh lá)   Sẵn sàng, Tốt, Đã hoàn thành
 *   info    (xanh dương) Đang mượn, Đang điều chuyển, Đã duyệt — đang diễn ra bình thường
 *   warning (cam)       Đang sửa, Chờ duyệt / chờ xác nhận / chờ nhận lại — cần ai đó xử lý
 *   danger  (đỏ)        Hư hỏng, Không thể phục hồi, Có sự cố, Từ chối, Quá hạn
 *   neutral (xám)       Chưa đánh giá, Ngừng sử dụng, Kho thanh lý, Đã hủy
 *
 * `StatusBadge` luôn hiện chữ + một ký hiệu theo tông (✓ ! ✕ ● ○) nên không phụ thuộc riêng vào màu.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Trạng thái máy (`equipment.status`). */
export function equipmentStatusTone(status: string): Tone {
  switch (status) {
    case "in_use_owner":
      return "success";
    case "on_loan":
    case "wait_handover":
      return "info";
    case "return_requested":
    case "wait_inspection":
    case "repairing":
    case "wait_repair_confirm":
    case "wait_disposal":
      return "warning";
    case "disposal_warehouse":
    case "inactive":
      return "neutral";
    default:
      return "info";
  }
}

/** Tình trạng máy (`equipment.condition`, gồm các giá trị cũ cùng nhãn với giá trị mới). */
export function conditionTone(condition: string): Tone {
  switch (condition) {
    case "good":
      return "success";
    case "major_damage":
    case "minor_damage":
    case "irreparable":
      return "danger";
    default:
      return "neutral"; // awaiting_assessment, limited, unknown: "Chưa đánh giá"
  }
}

/** Trạng thái phiếu (mượn máy, mượn nhanh, điều chuyển, sửa chữa, thanh lý). */
export function workflowTone(status: string): Tone {
  switch (status) {
    case "completed":
      return "success";
    case "rejected":
    case "incident":
    case "irreparable":
      return "danger";
    case "cancelled":
    case "draft":
      return "neutral";
    case "pending_owner":
    case "pending_source":
    case "pending_target":
    case "pending_ws":
    case "pending_approval":
    case "pending_receipt":
    case "pending_acceptance":
    case "pending_group":
    case "wait_handover":
    case "wait_owner_confirm":
    case "wait_owner_receive":
    case "wait_warehouse":
    case "return_requested":
    case "return_reported":
      return "warning";
    default:
      return "info"; // approved, on_loan, borrowed, repairing
  }
}

/** Ký hiệu đi kèm từng tông (cùng nội dung với CSS `.status-badge[data-tone]::before`). */
export const TONE_GLYPHS: Record<Tone, string> = {
  success: "✓",
  warning: "!",
  danger: "✕",
  info: "●",
  neutral: "○",
};
