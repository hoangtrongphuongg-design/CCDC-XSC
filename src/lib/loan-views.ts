/**
 * Thanh lọc nhanh của trang Mượn – Trả (hàm thuần): chia phiếu ĐANG MỞ (mượn máy + mượn nhanh) thành
 * Chờ duyệt / Đang mượn / Chờ nhận lại / Trễ hạn. Dùng chung hai loại phiếu nên chỉ cần `status` + hạn trả
 * (YYYY-MM-DD, theo ngày Việt Nam). Chọn thẻ qua `?view=` nên không cần JavaScript.
 */
import { vnDate } from "@/lib/export/equipment-export";
import { dayDiff } from "@/lib/reports";

export const LOAN_VIEW_KEYS = ["all", "pending", "active", "return", "overdue"] as const;
export type LoanViewKey = (typeof LOAN_VIEW_KEYS)[number];

export const LOAN_VIEW_LABELS: Record<LoanViewKey, string> = {
  all: "Tất cả chờ xử lý",
  pending: "Chờ duyệt",
  active: "Đang mượn",
  return: "Chờ nhận lại",
  overdue: "Trễ hạn",
};

/** Mượn máy `pending_owner` / mượn nhanh `pending_approval`; `approved`, `wait_handover`, `pending_receipt` là bước đệm cũ. */
const PENDING = new Set(["pending_owner", "pending_approval", "approved", "wait_handover", "pending_receipt"]);
/** Nhóm mượn đang giữ: mượn máy `on_loan` / `incident`, mượn nhanh `borrowed`. */
const HOLDING = new Set(["on_loan", "incident", "borrowed"]);
const RETURNING = new Set(["return_requested", "return_reported"]);

export type LoanViewRow = { status: string; /** YYYY-MM-DD hoặc null nếu không có hạn. */ dueDate: string | null };

export function parseLoanView(value: string | string[] | undefined): LoanViewKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return (LOAN_VIEW_KEYS as readonly string[]).includes(raw ?? "") ? (raw as LoanViewKey) : "all";
}

/** Số ngày trễ (≥ 1) nếu phiếu đang được giữ và quá hạn trả; ngược lại 0. */
export function loanDaysLate(row: LoanViewRow, today: string = vnDate()): number {
  if (!HOLDING.has(row.status) || !row.dueDate) return 0;
  const diff = dayDiff(today, row.dueDate);
  return diff < 0 ? -diff : 0;
}

export function matchesLoanView(row: LoanViewRow, view: LoanViewKey, today: string = vnDate()): boolean {
  switch (view) {
    case "all": return true;
    case "pending": return PENDING.has(row.status);
    case "active": return HOLDING.has(row.status);
    case "return": return RETURNING.has(row.status);
    case "overdue": return loanDaysLate(row, today) > 0;
  }
}

export function countLoanViews(rows: readonly LoanViewRow[], today: string = vnDate()): Record<LoanViewKey, number> {
  const counts: Record<LoanViewKey, number> = { all: 0, pending: 0, active: 0, return: 0, overdue: 0 };
  for (const row of rows) {
    for (const key of LOAN_VIEW_KEYS) if (matchesLoanView(row, key, today)) counts[key] += 1;
  }
  return counts;
}
