/**
 * Biên bản kiểm kê (Excel): các mục theo thứ tự cần chú ý — Không thấy, Chưa kiểm, Thừa,
 * Đang ở nơi khác, Có mặt — kèm tóm tắt ở đầu sheet.
 */
import { SECTION_LABELS, SECTION_ORDER, sectionOf, summarizeInventory, INVENTORY_RESULT_LABELS } from "@/lib/inventory";
import { addDataRow, addHeading, finishSheet, newWorkbook, startSheet, toBytes } from "@/lib/export/workbook-kit";
import { vnDateTime } from "@/lib/export/equipment-export";
import type { InventoryDetail } from "@/lib/inventory-data";

export async function buildInventoryWorkbook(input: { generatedAt: Date; exportedBy: string; detail: InventoryDetail }): Promise<Uint8Array> {
  const { session, items } = input.detail;
  const summary = summarizeInventory(items);
  const workbook = newWorkbook(input.generatedAt);

  const state = session.status === "closed" ? `Đã đóng ${session.closedAt ? vnDateTime(session.closedAt) : ""}${session.closedByName ? ` bởi ${session.closedByName}` : ""}` : "ĐANG MỞ (chưa đóng)";
  const subtitle = [
    `${session.groupName}${session.title ? ` · ${session.title}` : ""}`,
    `Mở ${vnDateTime(session.createdAt)}${session.createdByName ? ` bởi ${session.createdByName}` : ""} · ${state}`,
    `Tổng ${summary.total}: ${summary.found} có mặt · ${summary.missing} không thấy · ${summary.pending} chưa kiểm · ${summary.offsitePending} ở nơi khác · ${summary.unexpected} thừa`,
    `Xuất ${vnDateTime(input.generatedAt)} bởi ${input.exportedBy}`,
  ].join(" | ");

  const ctx = startSheet(workbook, new Set<string>(), "Biên bản kiểm kê", `BIÊN BẢN KIỂM KÊ ${session.code}`, subtitle, [
    { header: "STT", width: 6 },
    { header: "Mã hệ thống", width: 16 },
    { header: "Tem nhôm", width: 16 },
    { header: "Tên CCDC", width: 38 },
    { header: "Loại", width: 24 },
    { header: "Kết quả", width: 16 },
    { header: "Ghi chú", width: 34 },
    { header: "Người kiểm", width: 22 },
    { header: "Thời gian kiểm", width: 18 },
  ]);

  const bySection = new Map(SECTION_ORDER.map((section) => [section, [] as typeof items]));
  for (const item of items) bySection.get(sectionOf(item))!.push(item);

  let index = 0;
  for (const section of SECTION_ORDER) {
    const list = bySection.get(section)!;
    if (!list.length) continue;
    addHeading(ctx, `${SECTION_LABELS[section]} (${list.length})`, "group");
    for (const item of list) {
      index += 1;
      const result = item.result ? INVENTORY_RESULT_LABELS[item.result] : item.offsite ? "Nơi khác" : "Chưa kiểm";
      const notes = [item.expectedNote, item.note].filter(Boolean).join(" · ");
      addDataRow(ctx, [index, item.code, item.legacyCode ?? "", item.name, item.type, result, notes, item.checkedByName ?? "", item.checkedAt ? vnDateTime(item.checkedAt) : ""]);
    }
  }
  finishSheet(ctx);
  return toBytes(await workbook.xlsx.writeBuffer());
}
