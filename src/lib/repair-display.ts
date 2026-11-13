/**
 * Nhãn hiển thị cho máy / phiếu đang SỬA (hàm thuần). Trạng thái máy trong DB chỉ có một giá trị `repairing`;
 * máy đang sửa NỘI BỘ hay THUÊ NGOÀI suy ra từ phiếu sửa đang mở (`repairs.repair_type`), không đổi cơ sở dữ liệu.
 */
import { EQUIPMENT_STATUS_LABELS, WORKFLOW_LABELS } from "@/lib/constants";

export const REPAIR_INTERNAL_LABEL = "Đang SC nội bộ";
export const REPAIR_EXTERNAL_LABEL = "Đang thuê ngoài sửa";

/** Nhãn của phiếu sửa: đang sửa thì tách nội bộ / thuê ngoài, trạng thái khác dùng nhãn chung. */
export function repairStatusLabel(status: string, repairType: string | null | undefined): string {
  if (status === "repairing") return repairType === "external" ? REPAIR_EXTERNAL_LABEL : REPAIR_INTERNAL_LABEL;
  return WORKFLOW_LABELS[status] ?? status;
}

/**
 * Nhãn trạng thái của MÁY. Máy `repairing`: theo phiếu đang mở (`repairType`); chưa biết phiếu thì giữ
 * "Đang sửa chữa". Các trạng thái khác dùng nhãn chung.
 */
export function equipmentStatusDisplay(machineStatus: string, repairType?: string | null): string {
  if (machineStatus === "repairing" && repairType) return repairType === "external" ? REPAIR_EXTERNAL_LABEL : REPAIR_INTERNAL_LABEL;
  return (EQUIPMENT_STATUS_LABELS as Record<string, string>)[machineStatus] ?? machineStatus;
}
