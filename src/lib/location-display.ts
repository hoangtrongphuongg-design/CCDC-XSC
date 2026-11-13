/**
 * Vị trí HIỂN THỊ của máy, suy ra theo nghiệp vụ (hàm thuần) — không ghi đè dữ liệu `current_location`:
 *  - đang do nhóm mượn giữ (phiếu `on_loan` / `incident`): "Tại {nhóm mượn}" (+ "· {vị trí sử dụng}" nếu phiếu có ghi);
 *    trả xong thì tự trở lại vị trí đã lưu;
 *  - đang điều chuyển (phiếu chờ bàn giao): "Đang điều chuyển → {nhóm nhận}";
 *  - còn lại: vị trí đã lưu; chưa có thì `empty` (mặc định "Chưa cập nhật").
 */
import { isHeldByBorrower } from "@/lib/loan-status";

export const LOCATION_EMPTY = "Chưa cập nhật";

export type LocationLoan = { status: string; borrowerGroupName: string; workLocation: string | null };
export type LocationTransfer = { status: string; targetGroupName: string };

export function displayLocation(input: {
  stored: string | null | undefined;
  loan?: LocationLoan | null;
  transfer?: LocationTransfer | null;
  empty?: string;
}): string {
  if (input.loan && isHeldByBorrower(input.loan.status)) {
    const where = input.loan.workLocation?.trim();
    return where ? `Tại ${input.loan.borrowerGroupName} · ${where}` : `Tại ${input.loan.borrowerGroupName}`;
  }
  if (input.transfer && input.transfer.status === "wait_handover") return `Đang điều chuyển → ${input.transfer.targetGroupName}`;
  return input.stored?.trim() || (input.empty ?? LOCATION_EMPTY);
}
