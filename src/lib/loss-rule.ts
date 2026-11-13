/**
 * Quy tắc Báo mất (hàm thuần, dùng chung trang, Server Action và test).
 *
 * Máy được báo mất khi đang ở nhóm quản lý (Sẵn sàng / Chờ kiểm tra / Ngừng sử dụng) hoặc đang cho mượn
 * (phiếu mượn sẽ tự đóng khi báo mất được duyệt). Máy đang sửa, chờ thanh lý, trong Kho thanh lý, đang điều chuyển
 * hoặc đã mất thì không báo mất được (đã có quy trình riêng / đã xử lý).
 */
export const LOSS_REPORTABLE_STATUSES = ["in_use_owner", "wait_inspection", "inactive", "on_loan", "return_requested"] as const;

/** Phiếu mượn máy còn mở mà máy báo mất sẽ kéo theo đóng phiếu. */
export const LOSS_LOAN_STATUSES = ["on_loan", "return_requested", "incident"] as const;

export function canReportLoss(machineStatus: string): boolean {
  return (LOSS_REPORTABLE_STATUSES as readonly string[]).includes(machineStatus);
}

export const LOSS_MIN_CIRCUMSTANCES = 5;

export function parseLossCircumstances(raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (value.length < LOSS_MIN_CIRCUMSTANCES) return { ok: false, message: `Vui lòng ghi hoàn cảnh mất (ít nhất ${LOSS_MIN_CIRCUMSTANCES} ký tự).` };
  return { ok: true, value: value.slice(0, 1000) };
}

/** Số lượng CCDC báo mất: > 0, tối đa 2 chữ số thập phân, không vượt số tồn hiện có. */
export function parseLossQuantity(raw: unknown, onHand: number): { ok: true; value: number } | { ok: false; message: string } {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, message: "Số lượng mất phải lớn hơn 0." };
  if (Math.round(value * 100) !== value * 100 && Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return { ok: false, message: "Số lượng mất chỉ nhận tối đa 2 chữ số thập phân." };
  if (value > onHand + 1e-9) return { ok: false, message: `Số lượng mất (${value}) vượt số tồn hiện có (${onHand}).` };
  return { ok: true, value: Math.round(value * 100) / 100 };
}

/** Số lượng tồn còn lại sau khi trừ phần mất (làm tròn 2 chữ số, không âm). */
export function remainingAfterLoss(onHand: number, lost: number): number {
  return Math.max(0, Math.round((onHand - lost) * 100) / 100);
}
