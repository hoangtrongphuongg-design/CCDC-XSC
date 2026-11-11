/**
 * Lịch sử hoạt động (hàm/hằng thuần, dùng chung cho trang, route Excel và test):
 * từ điển mã hành động → nhãn tiếng Việt + nghiệp vụ, và các hàm ngày theo giờ Việt Nam.
 *
 * Mỗi mã `action` ghi bởi `writeAudit` trong `src/actions/*` PHẢI có mặt ở ACTIVITY_ACTIONS
 * (tests/activity-log.test.ts quét mã nguồn để bắt thiếu sót khi thêm sự kiện mới).
 */
import { isIsoDate } from "@/lib/date-check";
import { vnDate } from "@/lib/export/equipment-export";

export type ActivityCategory = "loan" | "transfer" | "repair" | "disposal" | "ccdc" | "account" | "other";

/** Thứ tự sheet trong file Excel; nhãn cũng là tên sheet. */
export const CATEGORY_ORDER: ActivityCategory[] = ["loan", "transfer", "repair", "disposal", "ccdc", "account", "other"];

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  loan: "Cho mượn",
  transfer: "Điều chuyển",
  repair: "Sửa chữa",
  disposal: "Thanh lý",
  ccdc: "CCDC",
  account: "Tài khoản & nhóm",
  other: "Khác",
};

type ActionInfo = {
  label: string;
  category: ActivityCategory;
  /** Bản sao ghi theo máy của một bước mượn/trả — chỉ để hiện ở tab Lịch sử từng máy, ẩn khỏi bảng chung. */
  mirror?: true;
  loanKind?: "Mượn máy" | "Mượn nhanh";
};

const machineLoan = (label: string): ActionInfo => ({ label, category: "loan", loanKind: "Mượn máy" });
const quickLoan = (label: string): ActionInfo => ({ label, category: "loan", loanKind: "Mượn nhanh" });
const mirror = (label: string): ActionInfo => ({ label, category: "loan", loanKind: "Mượn máy", mirror: true });

export const ACTIVITY_ACTIONS: Record<string, ActionInfo> = {
  // Mượn máy
  "machine_loan.create": machineLoan("Tạo đề nghị mượn máy"),
  "machine_loan.approve_and_handover": machineLoan("Duyệt và bàn giao máy"),
  "machine_loan.reject": machineLoan("Từ chối cho mượn máy"),
  "machine_loan.return_request": machineLoan("Báo trả máy"),
  "machine_loan.complete": machineLoan("Nhận lại máy"),
  "machine_loan.close_irreparable": { label: "Đóng phiếu mượn (máy không thể phục hồi)", category: "repair" },
  "equipment.loan_requested": mirror("Đề nghị mượn (ghi theo máy)"),
  "equipment.loan_started": mirror("Bàn giao cho nhóm mượn (ghi theo máy)"),
  "equipment.loan_rejected": mirror("Từ chối cho mượn (ghi theo máy)"),
  "equipment.return_requested": mirror("Báo trả (ghi theo máy)"),
  "equipment.loan_completed": mirror("Hoàn tất mượn/trả (ghi theo máy)"),
  // Mượn nhanh
  "quick_loan.create": quickLoan("Tạo đề nghị mượn nhanh"),
  "quick_loan.approve": quickLoan("Duyệt cho mượn nhanh"),
  "quick_loan.reject": quickLoan("Từ chối mượn nhanh"),
  "quick_loan.receive": quickLoan("Xác nhận đã nhận CCDC"),
  "quick_loan.return_report": quickLoan("Báo trả CCDC"),
  "quick_loan.complete": quickLoan("Nhận lại CCDC"),
  // Điều chuyển
  "transfer.create": { label: "Đề xuất điều chuyển", category: "transfer" },
  "transfer.counterpart_accept": { label: "Nhóm đối ứng đồng ý điều chuyển", category: "transfer" },
  "transfer.ws_approve": { label: "Quản lý Xưởng duyệt điều chuyển", category: "transfer" },
  "transfer.handover": { label: "Bàn giao điều chuyển", category: "transfer" },
  "transfer.complete": { label: "Hoàn tất điều chuyển", category: "transfer" },
  // Sửa chữa
  "repair.create": { label: "Báo hỏng / đề nghị sửa chữa", category: "repair" },
  "repair.accept": { label: "Tiếp nhận sửa chữa", category: "repair" },
  "repair.complete": { label: "Hoàn tất sửa chữa", category: "repair" },
  "repair.external": { label: "Chuyển thuê ngoài sửa chữa", category: "repair" },
  "repair.irreparable": { label: "Kết luận không thể phục hồi", category: "repair" },
  "repair.owner_confirm": { label: "Nhóm nhận lại máy sau sửa", category: "repair" },
  // Thanh lý
  "disposal.create": { label: "Đề xuất thanh lý", category: "disposal" },
  "disposal.group_confirm": { label: "Nhóm xác nhận thanh lý", category: "disposal" },
  "disposal.ws_approve": { label: "Quản lý Xưởng duyệt thanh lý", category: "disposal" },
  "disposal.warehouse_receive": { label: "Nhập Kho thanh lý", category: "disposal" },
  "tool_disposal.create": { label: "Đề xuất thanh lý CCDC theo số lượng", category: "disposal" },
  "tool_disposal.complete": { label: "Duyệt thanh lý CCDC theo số lượng", category: "disposal" },
  // CCDC
  "equipment.create": { label: "Tạo CCDC", category: "ccdc" },
  "equipment.initial_allocation": { label: "Cấp phát ban đầu", category: "ccdc" },
  "equipment.import": { label: "Nhập CCDC từ Excel", category: "ccdc" },
  "inventory.create": { label: "Mở đợt kiểm kê", category: "ccdc" },
  "inventory.close": { label: "Đóng đợt kiểm kê", category: "ccdc" },
  // Kết quả kiểm từng máy: chỉ cho tab Lịch sử của máy, ẩn khỏi bảng tin để khỏi ngập khi kiểm cả nhóm.
  "inventory.check": { label: "Kiểm kê máy (ghi theo máy)", category: "ccdc", mirror: true },
  // Bản ghi theo từng máy của đợt nhập Excel: chỉ cho tab Lịch sử của máy, ẩn khỏi bảng tin để khỏi ngập.
  "equipment.import_create": { label: "Tạo CCDC (nhập Excel, ghi theo máy)", category: "ccdc", mirror: true },
  "equipment.update": { label: "Cập nhật CCDC", category: "ccdc" },
  "equipment.admin_correction": { label: "Admin hiệu chỉnh CCDC", category: "ccdc" },
  "equipment.condition.update": { label: "Cập nhật tình trạng CCDC", category: "ccdc" },
  "tool_catalog.create": { label: "Thêm CCDC theo số lượng", category: "ccdc" },
  // Tài khoản & nhóm (chỉ Admin hệ thống thấy)
  "user.approve": { label: "Duyệt tài khoản", category: "account" },
  "user.status.update": { label: "Đổi trạng thái tài khoản", category: "account" },
  "user.permission.assign": { label: "Cấp quyền nhóm", category: "account" },
  "user.permission.revoke": { label: "Thu hồi quyền nhóm", category: "account" },
  "user.password.reset": { label: "Đặt lại mật khẩu tạm", category: "account" },
  "user.password.change": { label: "Đổi mật khẩu", category: "account" },
  "user.system_role.update": { label: "Đổi vai trò hệ thống", category: "account" },
  "group.structure.sync": { label: "Đồng bộ cơ cấu nhóm", category: "account" },
  "group.create": { label: "Thêm nhóm", category: "account" },
  "group.rename": { label: "Đổi tên nhóm", category: "account" },
  "group.status.update": { label: "Bật/tắt nhóm", category: "account" },
};

/** Mã hành động chưa có trong từ điển vẫn hiển thị (bằng chính mã) và rơi vào sheet "Khác". */
export function actionLabel(action: string): string {
  return ACTIVITY_ACTIONS[action]?.label ?? action;
}

export function categoryOf(action: string): ActivityCategory {
  return ACTIVITY_ACTIONS[action]?.category ?? "other";
}

export function loanKindOf(action: string): string {
  return ACTIVITY_ACTIONS[action]?.loanKind ?? "";
}

export const MIRROR_ACTIONS: string[] = Object.entries(ACTIVITY_ACTIONS)
  .filter(([, info]) => info.mirror)
  .map(([action]) => action);

/** Tiền tố mã chỉ Admin hệ thống được thấy (khớp nghiệp vụ "Tài khoản & nhóm"). */
export const ADMIN_ONLY_ACTION_PREFIXES = ["user.", "group."] as const;

export function isAdminOnlyAction(action: string): boolean {
  return ADMIN_ONLY_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix)) || categoryOf(action) === "account";
}

/** Có hiển thị dòng này cho người xem hay không (bản sao theo máy luôn ẩn; quản trị chỉ Admin). */
export function isVisibleActivity(action: string, isAdmin: boolean): boolean {
  if (ACTIVITY_ACTIONS[action]?.mirror) return false;
  return isAdmin || !isAdminOnlyAction(action);
}

/* ------------------------------ ngày theo giờ VN ------------------------------ */

export const FEED_LIMIT = 100;
export const MAX_EXPORT_ROWS = 20_000;

/** 00:00:00.000 giờ Việt Nam của ngày `YYYY-MM-DD`. */
export function vnDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000+07:00`);
}

/** 23:59:59.999 giờ Việt Nam của ngày `YYYY-MM-DD`. */
export function vnDayEnd(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999+07:00`);
}

/** Từ đầu tháng (giờ VN) đến hôm nay (giờ VN). */
export function defaultExportRange(now: Date = new Date()): { from: string; to: string } {
  const today = vnDate(now);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/**
 * Đọc `from`/`to` từ query: phần nào sai/thiếu thì dùng mặc định; nếu `from` > `to` thì đảo lại.
 */
export function parseExportRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  now: Date = new Date(),
): { from: string; to: string; fromAt: Date; toAt: Date } {
  const fallback = defaultExportRange(now);
  let from = fromRaw && isIsoDate(fromRaw) ? fromRaw : fallback.from;
  let to = toRaw && isIsoDate(toRaw) ? toRaw : fallback.to;
  if (from > to) [from, to] = [to, from];
  return { from, to, fromAt: vnDayStart(from), toAt: vnDayEnd(to) };
}

/**
 * Giờ treo tường Việt Nam dạng Date (cộng 7 tiếng) để ghi vào ô Excel: Excel không có múi giờ
 * nên ô sẽ hiện đúng giờ VN, vẫn là giá trị ngày giờ thật (sắp xếp/lọc được).
 */
export function toVnWallClock(date: Date): Date {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}
