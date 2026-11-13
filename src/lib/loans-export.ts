/**
 * Xuất Excel Mượn – Trả (mượn máy + mượn nhanh) và Điều chuyển: hàm thuần, có test.
 * Ngày theo giờ Việt Nam. Khoảng lọc theo NGÀY ĐỀ NGHỊ (dùng chung `parseRepairRange`: để trống = toàn bộ).
 */
import { WORKFLOW_LABELS } from "@/lib/constants";
import { vnDate } from "@/lib/export/equipment-export";
import { daysBetween } from "@/lib/repairs-export";

export const MAX_LOAN_EXPORT_ROWS = 20_000;

const label = (status: string) => WORKFLOW_LABELS[status] ?? status;

export type RawMachineLoanExportRow = {
  code: string; status: string; purpose: string; workLocation: string | null; receiverName: string | null;
  expectedReturnDate: string; handoverCondition: string | null; returnCondition: string | null;
  incidentNotes: string | null; rejectionReason: string | null;
  createdAt: Date; approvedAt: Date | null; handedOverAt: Date | null; receivedAt: Date | null;
  returnRequestedAt: Date | null; closedAt: Date | null;
  equipmentCode: string; equipmentLegacyCode: string | null; equipmentName: string;
  ownerGroupName: string; borrowerGroupName: string; requestedByName: string; approvedByName: string | null;
};
export type RawQuickLoanExportRow = {
  code: string; status: string; itemName: string; specification: string | null; unit: string; toolCode: string | null;
  quantityBorrowed: string | number; returnedGood: string | number; returnedDamaged: string | number; lostQuantity: string | number;
  lenderNote: string | null; borrowerNote: string | null; returnNote: string | null;
  createdAt: Date; approvedAt: Date | null; receivedAt: Date | null; expectedReturnAt: Date | null;
  returnReportedAt: Date | null; closedAt: Date | null;
  sourceGroupName: string; borrowerGroupName: string; requestedByName: string; approvedByName: string | null;
};
export type RawTransferExportRow = {
  code: string; status: string; reason: string; handoverCondition: string | null; rejectionReason: string | null;
  createdAt: Date; counterpartAcceptedAt: Date | null; wsApprovedAt: Date | null; handedOverAt: Date | null; receivedAt: Date | null;
  equipmentCode: string; equipmentLegacyCode: string | null; equipmentName: string;
  sourceGroupName: string; targetGroupName: string; proposedByGroupName: string; proposedByName: string;
};

/** "2026-11-12" của một mốc thời gian (giờ VN). */
const dayOf = (date: Date) => vnDate(date);

/**
 * Số ngày TRỄ so với hạn trả (YYYY-MM-DD): phiếu còn đang giữ → tính đến hôm nay; phiếu đã xong → ngày hoàn tất so với hạn.
 * null = đúng hạn / chưa tới hạn / chưa có hạn.
 */
export function lateDays(input: { dueDate: string | null; holding: boolean; closedAt: Date | null; now: Date }): number | null {
  if (!input.dueDate) return null;
  const end = input.holding ? dayOf(input.now) : input.closedAt ? dayOf(input.closedAt) : null;
  if (!end || end <= input.dueDate) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${input.dueDate}T00:00:00Z`)) / 86_400_000);
  return diff > 0 ? diff : null;
}

export type MachineLoanExportRow = RawMachineLoanExportRow & { statusLabel: string; late: number | null };
export type QuickLoanExportRow = RawQuickLoanExportRow & {
  statusLabel: string; dueDate: string | null; late: number | null;
  qtyBorrowed: number; qtyGood: number; qtyDamaged: number; qtyLost: number;
};
export type TransferExportRow = RawTransferExportRow & { statusLabel: string; totalDays: number | null };

const MACHINE_HOLDING = new Set(["on_loan", "incident", "return_requested"]);
const QUICK_HOLDING = new Set(["borrowed", "return_reported"]);
const TRANSFER_OPEN = new Set(["pending_source", "pending_target", "pending_ws", "wait_handover"]);

export function buildMachineLoanRows(raw: readonly RawMachineLoanExportRow[], now: Date = new Date()): MachineLoanExportRow[] {
  return raw.map((row) => ({
    ...row,
    statusLabel: label(row.status),
    late: lateDays({ dueDate: row.expectedReturnDate, holding: MACHINE_HOLDING.has(row.status), closedAt: row.closedAt, now }),
  }));
}

export function buildQuickLoanRows(raw: readonly RawQuickLoanExportRow[], now: Date = new Date()): QuickLoanExportRow[] {
  const num = (value: string | number) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; };
  return raw.map((row) => {
    const dueDate = row.expectedReturnAt ? dayOf(row.expectedReturnAt) : null;
    return {
      ...row,
      statusLabel: label(row.status),
      dueDate,
      late: lateDays({ dueDate, holding: QUICK_HOLDING.has(row.status), closedAt: row.closedAt, now }),
      qtyBorrowed: num(row.quantityBorrowed), qtyGood: num(row.returnedGood), qtyDamaged: num(row.returnedDamaged), qtyLost: num(row.lostQuantity),
    };
  });
}

export function buildTransferRows(raw: readonly RawTransferExportRow[], now: Date = new Date()): TransferExportRow[] {
  return raw.map((row) => {
    const end = row.receivedAt ?? (TRANSFER_OPEN.has(row.status) ? now : null);
    return { ...row, statusLabel: label(row.status), totalDays: end ? daysBetween(row.createdAt, end) : null };
  });
}

export type SummaryLine = { label: string; count: number };
export type SummarySection = { title: string; lines: SummaryLine[] };

function tally<T>(rows: readonly T[], keyOf: (row: T) => string, sort?: (a: SummaryLine, b: SummaryLine) => number): SummaryLine[] {
  const map = new Map<string, SummaryLine>();
  for (const row of rows) {
    const key = keyOf(row);
    const line = map.get(key) ?? { label: key, count: 0 };
    line.count += 1;
    map.set(key, line);
  }
  return [...map.values()].sort(sort ?? ((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi")));
}

const byLabel = (a: SummaryLine, b: SummaryLine) => a.label.localeCompare(b.label, "vi");
const monthOf = (date: Date) => dayOf(date).slice(0, 7);

/** "2026-11" → "11/2026". */
export function monthText(month: string): string {
  const [year, m] = month.split("-");
  return `${m}/${year}`;
}

export function summarizeLoans(machine: readonly MachineLoanExportRow[], quick: readonly QuickLoanExportRow[]): SummarySection[] {
  const groupRows = [
    ...machine.map((row) => ({ lender: row.ownerGroupName, borrower: row.borrowerGroupName })),
    ...quick.map((row) => ({ lender: row.sourceGroupName, borrower: row.borrowerGroupName })),
  ];
  const months = [...machine.map((row) => row.createdAt), ...quick.map((row) => row.createdAt)];
  return [
    { title: "Theo loại phiếu", lines: [{ label: "Mượn máy (có mã)", count: machine.length }, { label: "Mượn nhanh (CCDC lặt vặt)", count: quick.length }] },
    { title: "Phiếu trễ hạn (đang giữ quá hạn hoặc trả trễ)", lines: [
      { label: "Mượn máy", count: machine.filter((row) => row.late !== null).length },
      { label: "Mượn nhanh", count: quick.filter((row) => row.late !== null).length },
    ] },
    { title: "Mượn máy theo trạng thái", lines: tally(machine, (row) => row.statusLabel) },
    { title: "Mượn nhanh theo trạng thái", lines: tally(quick, (row) => row.statusLabel) },
    { title: "Theo nhóm cho mượn", lines: tally(groupRows, (row) => row.lender, byLabel) },
    { title: "Theo nhóm mượn", lines: tally(groupRows, (row) => row.borrower, byLabel) },
    { title: "Theo tháng đề nghị", lines: tally(months, monthOf, byLabel).map((line) => ({ ...line, label: monthText(line.label) })) },
  ];
}

export function summarizeTransfers(rows: readonly TransferExportRow[]): SummarySection[] {
  return [
    { title: "Theo trạng thái", lines: tally(rows, (row) => row.statusLabel) },
    { title: "Theo nhóm giao", lines: tally(rows, (row) => row.sourceGroupName, byLabel) },
    { title: "Theo nhóm nhận", lines: tally(rows, (row) => row.targetGroupName, byLabel) },
    { title: "Theo tháng đề xuất", lines: tally(rows, (row) => monthOf(row.createdAt), byLabel).map((line) => ({ ...line, label: monthText(line.label) })) },
  ];
}

export function loanExportFileName(range: { from: string | null; to: string | null }, now: Date = new Date()): string {
  const span = range.from || range.to ? `-${range.from ?? "dau"}-den-${range.to ?? "nay"}` : "";
  return `muon-tra${span}-${vnDate(now)}.xlsx`;
}

export function transferExportFileName(range: { from: string | null; to: string | null }, now: Date = new Date()): string {
  const span = range.from || range.to ? `-${range.from ?? "dau"}-den-${range.to ?? "nay"}` : "";
  return `dieu-chuyen${span}-${vnDate(now)}.xlsx`;
}
