/**
 * Số liệu báo cáo điều hành (hàm thuần, không DB): phiếu quá hạn trả, chi phí sửa chữa theo
 * tháng / theo nhóm, máy nằm không. Mọi "ngày" tính theo giờ Việt Nam (server chạy UTC).
 */
import { isHeldByBorrower } from "@/lib/loan-status";
import { vnDate } from "@/lib/export/equipment-export";

export const REPORT_MONTHS = 12;
export const IDLE_DAYS = 180;
export const IDLE_LIST_LIMIT = 50;

export function dayDiff(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function vnMonthKey(date: Date): string {
  return vnDate(date).slice(0, 7);
}

/** `count` tháng gần nhất (YYYY-MM), cũ → mới, kết thúc ở tháng hiện tại theo giờ VN. */
export function lastMonths(now: Date, count = REPORT_MONTHS): string[] {
  const [year, month] = vnMonthKey(now).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const total = year * 12 + (month - 1) - offset;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/** Mốc bắt đầu của cửa sổ báo cáo (0h ngày 1 của tháng đầu tiên, giờ VN) để lọc truy vấn. */
export function monthsWindowStart(now: Date, count = REPORT_MONTHS): Date {
  return new Date(`${lastMonths(now, count)[0]}-01T00:00:00+07:00`);
}

export function formatVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value))} đ`;
}

export function dmy(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// ---------- Quá hạn trả ----------

export type OverdueInput = {
  loans: ReadonlyArray<{ code: string; label: string; status: string; ownerGroupId: string; borrowerGroupId: string; expectedReturnDate: string }>;
  quickLoans: ReadonlyArray<{ code: string; label: string; status: string; sourceGroupId: string; borrowerGroupId: string; expectedReturnAt: Date | null }>;
  groupNames: ReadonlyMap<string, string>;
  today: string;
};

export type OverdueRow = {
  kind: "Mượn máy" | "Mượn nhanh";
  code: string;
  label: string;
  borrowerGroup: string;
  ownerGroup: string;
  dueDate: string;
  daysLate: number;
};

/** Phiếu mượn mà nhóm mượn còn đang giữ và đã quá hạn trả; trễ nhiều ngày nhất lên đầu. */
export function buildOverdueRows(input: OverdueInput): OverdueRow[] {
  const name = (id: string) => input.groupNames.get(id) ?? "—";
  const rows: OverdueRow[] = [];
  for (const loan of input.loans) {
    if (!isHeldByBorrower(loan.status) || !(loan.expectedReturnDate < input.today)) continue;
    rows.push({
      kind: "Mượn máy", code: loan.code, label: loan.label,
      borrowerGroup: name(loan.borrowerGroupId), ownerGroup: name(loan.ownerGroupId),
      dueDate: loan.expectedReturnDate, daysLate: dayDiff(loan.expectedReturnDate, input.today),
    });
  }
  for (const loan of input.quickLoans) {
    if (loan.status !== "borrowed" || !loan.expectedReturnAt) continue;
    const due = vnDate(loan.expectedReturnAt);
    if (!(due < input.today)) continue;
    rows.push({
      kind: "Mượn nhanh", code: loan.code, label: loan.label,
      borrowerGroup: name(loan.borrowerGroupId), ownerGroup: name(loan.sourceGroupId),
      dueDate: due, daysLate: dayDiff(due, input.today),
    });
  }
  return rows.sort((a, b) => b.daysLate - a.daysLate || a.code.localeCompare(b.code));
}

// ---------- Chi phí sửa chữa ----------

export type RepairCostInput = { completedAt: Date | null; cost: string | number | null; ownerGroupId: string };
export type RepairCostMonth = { month: string; count: number; total: number };
export type RepairCostGroup = { groupId: string; name: string; count: number; total: number };

const toNumber = (value: string | number | null) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Mỗi tháng (12 tháng gần nhất, kể cả tháng không có phiếu) một dòng: số phiếu hoàn tất và tổng chi phí. */
export function repairCostByMonth(rows: readonly RepairCostInput[], now: Date, months = REPORT_MONTHS): RepairCostMonth[] {
  const buckets = new Map(lastMonths(now, months).map((month) => [month, { month, count: 0, total: 0 }]));
  for (const row of rows) {
    if (!row.completedAt) continue;
    const bucket = buckets.get(vnMonthKey(row.completedAt));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.total += toNumber(row.cost);
  }
  return [...buckets.values()];
}

/** Theo nhóm quản lý máy trong cùng cửa sổ tháng; chi phí cao nhất lên đầu, chỉ nhóm có phiếu. */
export function repairCostByGroup(
  rows: readonly RepairCostInput[],
  groupNames: ReadonlyMap<string, string>,
  now: Date,
  months = REPORT_MONTHS,
): RepairCostGroup[] {
  const inWindow = new Set(lastMonths(now, months));
  const byGroup = new Map<string, RepairCostGroup>();
  for (const row of rows) {
    if (!row.completedAt || !inWindow.has(vnMonthKey(row.completedAt))) continue;
    const entry = byGroup.get(row.ownerGroupId) ?? { groupId: row.ownerGroupId, name: groupNames.get(row.ownerGroupId) ?? "—", count: 0, total: 0 };
    entry.count += 1;
    entry.total += toNumber(row.cost);
    byGroup.set(row.ownerGroupId, entry);
  }
  return [...byGroup.values()].sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, "vi"));
}

// ---------- Máy nằm không ----------

export type IdleInput = { id: string; code: string; name: string; ownerGroupId: string; recordedDate: string; lastLoanAt: Date | null };
export type IdleRow = { code: string; name: string; group: string; since: string; idleDays: number; neverBorrowed: boolean };

/**
 * Máy đang Sẵn sàng mà từ "days" ngày nay không có phiếu mượn nào (tính từ lần mượn gần nhất,
 * chưa từng mượn thì tính từ ngày ghi nhận hồ sơ). Trả danh sách đã cắt theo "limit" và tổng số máy thỏa.
 */
export function idleMachines(
  rows: readonly IdleInput[],
  groupNames: ReadonlyMap<string, string>,
  today: string,
  days = IDLE_DAYS,
  limit = IDLE_LIST_LIMIT,
): { rows: IdleRow[]; total: number } {
  const all: IdleRow[] = [];
  for (const row of rows) {
    const since = row.lastLoanAt ? vnDate(row.lastLoanAt) : row.recordedDate;
    const idleDays = dayDiff(since, today);
    if (idleDays < days) continue;
    all.push({ code: row.code, name: row.name, group: groupNames.get(row.ownerGroupId) ?? "—", since, idleDays, neverBorrowed: !row.lastLoanAt });
  }
  all.sort((a, b) => b.idleDays - a.idleDays || a.code.localeCompare(b.code));
  return { rows: all.slice(0, limit), total: all.length };
}
