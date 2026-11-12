/**
 * "Chú ý hôm nay" (hàm thuần): phiếu mượn mà nhóm mượn còn giữ và đã QUÁ HẠN hoặc SẮP ĐẾN HẠN trả
 * trong DUE_SOON_DAYS ngày, tính theo ngày Việt Nam. Luật rõ ràng từ dữ liệu có sẵn, không đoán.
 *
 * Khác "Việc chờ tôi" (`lib/my-tasks.ts`): đó là việc CHÍNH TÔI phải làm; đây là bức tranh phiếu trễ /
 * sắp trễ trong phạm vi nhóm của tôi (cả bên cho mượn lẫn bên mượn). Để khỏi lặp, phiếu quá hạn đã nằm
 * ở "Việc chờ tôi" được loại ra qua `excludeKeys`.
 */
import { vnDate } from "@/lib/export/equipment-export";
import { isHeldByBorrower } from "@/lib/loan-status";
import { dayDiff } from "@/lib/reports";

export const DUE_SOON_DAYS = 2;

export type AttentionState = "overdue" | "due_soon";

export type AttentionRow = {
  /** `loan:<id>` hoặc `quick:<id>`. */
  key: string;
  kind: "Mượn máy" | "Mượn nhanh";
  code: string;
  label: string;
  borrowerGroup: string;
  ownerGroup: string;
  dueDate: string;
  state: AttentionState;
  /** Quá hạn: số ngày trễ (≥ 1). Sắp đến hạn: số ngày còn lại (0 = hôm nay). */
  days: number;
  href: string;
};

export type AttentionInput = {
  loans: ReadonlyArray<{ id: string; code: string; label: string; status: string; ownerGroupId: string; borrowerGroupId: string; expectedReturnDate: string }>;
  quickLoans: ReadonlyArray<{ id: string; code: string; label: string; status: string; sourceGroupId: string; borrowerGroupId: string; expectedReturnAt: Date | null }>;
  groupNames: ReadonlyMap<string, string>;
  /** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
  today?: string;
  /** Vai trò xem toàn Xưởng thấy mọi phiếu; còn lại chỉ phiếu liên quan nhóm của mình. */
  scope: { whole: boolean; groupIds: ReadonlySet<string> };
  /** Phiếu không hiện lại vì đã nằm ở "Việc chờ tôi". */
  excludeKeys?: ReadonlySet<string>;
};

function classify(dueDate: string, today: string): { state: AttentionState; days: number } | null {
  const diff = dayDiff(today, dueDate); // > 0: còn ngày; 0: hôm nay; < 0: đã trễ
  if (diff < 0) return { state: "overdue", days: -diff };
  if (diff <= DUE_SOON_DAYS) return { state: "due_soon", days: diff };
  return null;
}

/** Quá hạn trước (trễ nhiều nhất lên đầu), rồi sắp đến hạn (gần hạn nhất lên đầu). */
export function buildAttention(input: AttentionInput): AttentionRow[] {
  const today = input.today ?? vnDate();
  const name = (id: string) => input.groupNames.get(id) ?? "—";
  const inScope = (...ids: string[]) => input.scope.whole || ids.some((id) => input.scope.groupIds.has(id));
  const rows: AttentionRow[] = [];

  for (const loan of input.loans) {
    const key = `loan:${loan.id}`;
    if (!isHeldByBorrower(loan.status) || input.excludeKeys?.has(key) || !inScope(loan.ownerGroupId, loan.borrowerGroupId)) continue;
    const hit = classify(loan.expectedReturnDate, today);
    if (!hit) continue;
    rows.push({ key, kind: "Mượn máy", code: loan.code, label: loan.label, borrowerGroup: name(loan.borrowerGroupId), ownerGroup: name(loan.ownerGroupId), dueDate: loan.expectedReturnDate, ...hit, href: "/machine-loans" });
  }
  for (const loan of input.quickLoans) {
    const key = `quick:${loan.id}`;
    if (loan.status !== "borrowed" || !loan.expectedReturnAt || input.excludeKeys?.has(key) || !inScope(loan.sourceGroupId, loan.borrowerGroupId)) continue;
    const dueDate = vnDate(loan.expectedReturnAt);
    const hit = classify(dueDate, today);
    if (!hit) continue;
    rows.push({ key, kind: "Mượn nhanh", code: loan.code, label: loan.label, borrowerGroup: name(loan.borrowerGroupId), ownerGroup: name(loan.sourceGroupId), dueDate, ...hit, href: "/quick-loans" });
  }

  return rows.sort((a, b) => {
    if (a.state !== b.state) return a.state === "overdue" ? -1 : 1;
    if (a.state === "overdue") return b.days - a.days || a.code.localeCompare(b.code);
    return a.days - b.days || a.code.localeCompare(b.code);
  });
}

/** Chữ hiển thị: "Trễ 3 ngày" / "Hạn hôm nay" / "Còn 2 ngày". */
export function attentionText(row: Pick<AttentionRow, "state" | "days">): string {
  if (row.state === "overdue") return `Trễ ${row.days} ngày`;
  return row.days === 0 ? "Hạn hôm nay" : `Còn ${row.days} ngày`;
}

/** Khóa phiếu đã nằm ở "Việc chờ tôi" dạng quá hạn (khóa việc: `loan-overdue:<id>` / `quick-overdue:<id>`). */
export function overdueTaskKeys(taskKeys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of taskKeys) {
    if (key.startsWith("loan-overdue:")) out.add(`loan:${key.slice("loan-overdue:".length)}`);
    else if (key.startsWith("quick-overdue:")) out.add(`quick:${key.slice("quick-overdue:".length)}`);
  }
  return out;
}
