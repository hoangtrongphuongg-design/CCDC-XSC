export const APP_NAME = "QUẢN LÝ CCDC - XSC";
export const SESSION_COOKIE = "ccdc_xsc_session_v2";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const USERNAME_PATTERN = /^(?!.*\.\.)[a-z0-9][a-z0-9._]{2,28}[a-z0-9]$/;

export const EQUIPMENT_STATUS_LABELS = {
  in_use_owner: "Sẵn sàng",
  wait_handover: "Chờ bàn giao",
  on_loan: "Đang cho mượn",
  return_requested: "Chờ nhận lại",
  wait_inspection: "Chờ kiểm tra",
  repairing: "Đang sửa chữa",
  wait_repair_confirm: "Chờ xác nhận sửa",
  wait_disposal: "Chờ thanh lý",
  disposal_warehouse: "Kho thanh lý",
  inactive: "Ngừng sử dụng",
} as const;

export const CONDITION_LABELS = {
  good: "Tốt",
  limited: "Cần theo dõi",
  minor_damage: "Hư nhẹ",
  major_damage: "Hư hỏng",
  awaiting_assessment: "Chờ đánh giá",
  irreparable: "Không thể phục hồi",
  unknown: "Chưa đánh giá",
} as const;

export const WORKFLOW_LABELS: Record<string, string> = {
  draft: "Nháp",
  pending_owner: "Chờ nhóm cho duyệt",
  approved: "Đã duyệt",
  wait_handover: "Chờ bàn giao",
  on_loan: "Đang mượn",
  return_requested: "Chờ xác nhận trả",
  completed: "Đã hoàn thành",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
  incident: "Có sự cố",
  pending_source: "Chờ nhóm giao đồng ý",
  pending_target: "Chờ nhóm nhận đồng ý",
  pending_ws: "Chờ WS duyệt",
  pending_approval: "Chờ nhóm cho duyệt",
  pending_receipt: "Đã duyệt · chờ nhận",
  borrowed: "Đang mượn",
  return_reported: "Đã báo trả",
  pending_acceptance: "Chờ tiếp nhận",
  repairing: "Đang sửa chữa",
  wait_owner_confirm: "Chờ nhóm xác nhận",
  irreparable: "Không thể phục hồi",
  pending_group: "Chờ quản lý nhóm",
  wait_warehouse: "Chờ nhập kho thanh lý",
};
