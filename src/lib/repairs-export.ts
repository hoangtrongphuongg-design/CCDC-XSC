/**
 * Xuất Excel toàn bộ phiếu sửa chữa (hàm thuần, có test): dựng dòng xuất, số ngày, tổng hợp.
 * Ngày theo giờ Việt Nam (`vnDate`), không dùng UTC.
 */
import { vnDayEnd, vnDayStart } from "@/lib/activity-log";
import { isIsoDate } from "@/lib/date-check";
import { vnDate } from "@/lib/export/equipment-export";
import { repairStatusLabel } from "@/lib/repair-display";
import { OPEN_REPAIR_STATUSES } from "@/lib/workflow-status";

export const MAX_REPAIR_EXPORT_ROWS = 20_000;

export type RepairKind = "Nội bộ" | "Thuê ngoài" | "Chưa tiếp nhận";

/** Một phiếu sửa lấy từ DB (đã nối tên máy, nhóm, người). */
export type RawRepairExportRow = {
  code: string;
  status: string;
  repairType: string | null;
  vendor: string | null;
  issueDescription: string;
  workDescription: string | null;
  resultNotes: string | null;
  cost: string | number | null;
  createdAt: Date;
  receivedAt: Date | null;
  completedAt: Date | null;
  ownerConfirmedAt: Date | null;
  /** Ngày gửi thuê ngoài: lấy từ nhật ký `repair.external` (phiếu không có cột riêng). */
  externalSentAt: Date | null;
  equipmentCode: string;
  equipmentLegacyCode: string | null;
  equipmentName: string;
  ownerGroupName: string;
  reportedGroupName: string;
  reportedByName: string;
  receivedByName: string | null;
  completedByName: string | null;
};

export type RepairExportRow = RawRepairExportRow & {
  kind: RepairKind;
  statusLabel: string;
  /** Chi phí đã nhập (> 0); null = chưa nhập (ô để trống). */
  costValue: number | null;
  waitDays: number | null;
  repairDays: number | null;
  totalDays: number | null;
};

/** `from`/`to` (YYYY-MM-DD, giờ VN) theo ngày BÁO HỎNG; để trống = không giới hạn. Đảo lại nếu from > to. */
export function parseRepairRange(fromRaw: string | null | undefined, toRaw: string | null | undefined): {
  from: string | null;
  to: string | null;
  fromAt: Date | null;
  toAt: Date | null;
} {
  let from = fromRaw && isIsoDate(fromRaw) ? fromRaw : null;
  let to = toRaw && isIsoDate(toRaw) ? toRaw : null;
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to, fromAt: from ? vnDayStart(from) : null, toAt: to ? vnDayEnd(to) : null };
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Số ngày (theo ngày VN) từ `from` đến `to`; không âm. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, dayNumber(vnDate(to)) - dayNumber(vnDate(from)));
}

export function repairKind(row: Pick<RawRepairExportRow, "repairType" | "receivedAt">): RepairKind {
  if (row.repairType === "external") return "Thuê ngoài";
  return row.receivedAt ? "Nội bộ" : "Chưa tiếp nhận";
}

function isOpen(status: string): boolean {
  return (OPEN_REPAIR_STATUSES as readonly string[]).includes(status);
}

export function buildRepairRows(raw: readonly RawRepairExportRow[], now: Date = new Date()): RepairExportRow[] {
  return raw.map((row) => {
    const cost = Number(row.cost ?? 0);
    const open = isOpen(row.status);
    const waitDays = row.receivedAt ? daysBetween(row.createdAt, row.receivedAt) : open ? daysBetween(row.createdAt, now) : null;
    const repairDays = row.receivedAt && row.completedAt ? daysBetween(row.receivedAt, row.completedAt) : null;
    const end = row.ownerConfirmedAt ?? (open ? now : row.completedAt);
    return {
      ...row,
      kind: repairKind(row),
      statusLabel: repairStatusLabel(row.status, row.repairType),
      costValue: Number.isFinite(cost) && cost > 0 ? cost : null,
      waitDays,
      repairDays,
      totalDays: end ? daysBetween(row.createdAt, end) : null,
    };
  });
}

export type SummaryLine = { label: string; count: number; cost: number };
export type RepairSummary = {
  total: { count: number; cost: number };
  byStatus: SummaryLine[];
  byKind: SummaryLine[];
  byMonth: SummaryLine[];
  byGroup: SummaryLine[];
};

const STATUS_ORDER = ["pending_acceptance", "repairing", "wait_owner_confirm", "completed", "irreparable", "cancelled"];

function tally(rows: readonly RepairExportRow[], keyOf: (row: RepairExportRow) => string): SummaryLine[] {
  const map = new Map<string, SummaryLine>();
  for (const row of rows) {
    const label = keyOf(row);
    const line = map.get(label) ?? { label, count: 0, cost: 0 };
    line.count += 1;
    line.cost += row.costValue ?? 0;
    map.set(label, line);
  }
  return [...map.values()];
}

/** Tổng hợp theo trạng thái, hình thức, tháng báo hỏng (giờ VN) và nhóm quản lý máy. */
export function summarizeRepairs(rows: readonly RepairExportRow[]): RepairSummary {
  const byStatus = tally(rows, (row) => row.statusLabel);
  const statusRank = new Map<string, number>();
  for (const row of rows) {
    const rank = STATUS_ORDER.indexOf(row.status);
    const current = statusRank.get(row.statusLabel);
    if (current === undefined || rank < current) statusRank.set(row.statusLabel, rank < 0 ? 99 : rank);
  }
  byStatus.sort((a, b) => (statusRank.get(a.label) ?? 99) - (statusRank.get(b.label) ?? 99) || a.label.localeCompare(b.label, "vi"));

  const kindOrder: RepairKind[] = ["Nội bộ", "Thuê ngoài", "Chưa tiếp nhận"];
  const byKind = tally(rows, (row) => row.kind).sort((a, b) => kindOrder.indexOf(a.label as RepairKind) - kindOrder.indexOf(b.label as RepairKind));
  const byMonth = tally(rows, (row) => vnDate(row.createdAt).slice(0, 7)).sort((a, b) => a.label.localeCompare(b.label));
  const byGroup = tally(rows, (row) => row.ownerGroupName).sort((a, b) => a.label.localeCompare(b.label, "vi"));
  return {
    total: { count: rows.length, cost: rows.reduce((sum, row) => sum + (row.costValue ?? 0), 0) },
    byStatus, byKind, byMonth, byGroup,
  };
}

/** "2026-11" → "11/2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${m}/${year}`;
}

export function repairExportFileName(range: { from: string | null; to: string | null }, now: Date = new Date()): string {
  const span = range.from || range.to ? `-${range.from ?? "dau"}-den-${range.to ?? "nay"}` : "";
  return `phieu-sua-chua${span}-${vnDate(now)}.xlsx`;
}
