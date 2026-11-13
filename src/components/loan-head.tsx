import Link from "next/link";
import { LoanTabs } from "@/components/loan-tabs";
import { LOAN_VIEW_KEYS, LOAN_VIEW_LABELS, type LoanViewKey } from "@/lib/loan-views";
import { cn } from "@/lib/utils";

/** Hàng đầu trang Mượn – Trả: tiêu đề + hai tab (Máy có mã | CCDC lặt vặt) + nút xuất Excel (nếu có quyền) trên một dòng. */
export function LoanHead({ active, exportSlot }: { active: "machine" | "quick"; exportSlot?: React.ReactNode }) {
  return (
    <div className="loan-head">
      <div className="loan-head-main">
        <h1>Mượn – Trả</h1>
        <LoanTabs active={active} />
      </div>
      {exportSlot ? <div className="loan-head-export">{exportSlot}</div> : null}
    </div>
  );
}

/**
 * Thanh lọc nhanh bấm được (thay cho ô thống kê lớn): mỗi thẻ là một liên kết `?view=…` kèm số phiếu;
 * thẻ "Đã hoàn thành" nhảy tới bảng phiếu đã đóng bên dưới.
 */
export function LoanFilterBar({
  basePath,
  view,
  counts,
  doneCount,
}: {
  basePath: string;
  view: LoanViewKey;
  counts: Record<LoanViewKey, number>;
  doneCount: number;
}) {
  return (
    <nav className="loan-chips" aria-label="Lọc phiếu đang xử lý">
      {LOAN_VIEW_KEYS.map((key) => (
        <Link
          key={key}
          href={key === "all" ? basePath : `${basePath}?view=${key}`}
          scroll={false}
          className={cn("loan-chip", view === key && "is-active", key === "overdue" && counts.overdue > 0 && "is-alert")}
          aria-current={view === key ? "true" : undefined}
        >
          {LOAN_VIEW_LABELS[key]} <b>{counts[key]}</b>
        </Link>
      ))}
      <a className="loan-chip is-done" href="#da-hoan-thanh">Đã hoàn thành <b>{doneCount}</b></a>
    </nav>
  );
}
