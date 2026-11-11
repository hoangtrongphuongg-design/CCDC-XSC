/**
 * File Excel lịch sử hoạt động: mỗi nghiệp vụ một sheet (chỉ tạo sheet có dòng), mới nhất ở trên.
 * Chỉ có tên người thực hiện (không số danh bộ).
 */
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  actionLabel,
  categoryOf,
  loanKindOf,
  toVnWallClock,
  type ActivityCategory,
} from "@/lib/activity-log";
import { addDataRow, finishSheet, newWorkbook, startSheet, toBytes, type ColumnDef } from "@/lib/export/workbook-kit";
import { vnDateTime } from "@/lib/export/equipment-export";
import type { ActivityRow } from "@/lib/activity-query";

const DATE_TIME_FORMAT = "dd/mm/yyyy hh:mm";

function dmy(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function columnsFor(category: ActivityCategory): ColumnDef[] {
  const columns: ColumnDef[] = [
    { header: "Thời gian", width: 17 },
    { header: "Người thực hiện", width: 24 },
    { header: "Nhóm", width: 26 },
  ];
  if (category === "loan") columns.push({ header: "Loại", width: 12 });
  columns.push(
    { header: "Hành động", width: 32 },
    { header: "Nội dung", width: 64 },
    { header: "Lý do", width: 30 },
  );
  return columns;
}

export async function buildActivityWorkbook(input: {
  generatedAt: Date;
  exportedBy: string;
  fromIso: string;
  toIso: string;
  rows: ActivityRow[];
  /** true khi số dòng vượt giới hạn xuất nên phần cũ nhất bị cắt. */
  truncated: boolean;
}): Promise<Uint8Array> {
  const workbook = newWorkbook(input.generatedAt);
  const used = new Set<string>();

  const byCategory = new Map<ActivityCategory, ActivityRow[]>();
  for (const row of input.rows) {
    const category = categoryOf(row.action);
    byCategory.set(category, [...(byCategory.get(category) || []), row]);
  }

  const period = `Từ ${dmy(input.fromIso)} đến ${dmy(input.toIso)}`;
  const meta = `Ngày xuất: ${vnDateTime(input.generatedAt)} · Người xuất: ${input.exportedBy}`;
  const truncatedNote = input.truncated ? " · Đã cắt bớt phần cũ nhất do quá nhiều dòng, hãy chọn khoảng ngày ngắn hơn" : "";

  for (const category of CATEGORY_ORDER) {
    const rows = byCategory.get(category);
    if (!rows?.length) continue;
    const ctx = startSheet(
      workbook,
      used,
      CATEGORY_LABELS[category],
      `LỊCH SỬ HOẠT ĐỘNG – ${CATEGORY_LABELS[category].toUpperCase()}`,
      `${period} · ${meta} · Tổng: ${rows.length} dòng${truncatedNote}`,
      columnsFor(category),
    );
    for (const row of rows) {
      const values: Array<string | Date> = [toVnWallClock(row.createdAt), row.actor || "Hệ thống", row.groupName || "—"];
      if (category === "loan") values.push(loanKindOf(row.action));
      values.push(actionLabel(row.action), row.description, row.reason || "");
      const excelRow = addDataRow(ctx, values as Array<string | number>);
      const timeCell = excelRow.getCell(1);
      timeCell.numFmt = DATE_TIME_FORMAT;
      timeCell.alignment = { vertical: "top", horizontal: "center" };
    }
    finishSheet(ctx);
  }

  if (!workbook.worksheets.length) {
    const ctx = startSheet(
      workbook,
      used,
      "Lịch sử",
      "LỊCH SỬ HOẠT ĐỘNG",
      `${period} · ${meta} · Không có hoạt động nào trong khoảng thời gian này`,
      columnsFor("other"),
    );
    finishSheet(ctx);
  }

  return toBytes(await workbook.xlsx.writeBuffer());
}
