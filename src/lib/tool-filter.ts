import { matchesSearch, toolSearchValues, type ExportTool } from "@/lib/export/equipment-export";

/** Một dòng CCDC theo số lượng trên "Dụng cụ nhóm tôi" (đủ trường để sửa). */
export type ToolRow = ExportTool & {
  id: string;
  condition: string;
  currentLocation: string | null;
  notes: string | null;
  /** ISO — dùng làm "phiên bản" để chống ghi đè đồng thời khi sửa. */
  updatedAt: string;
};

export type ToolFilter = {
  /** "all" hoặc id nhóm quản lý. */
  groupId: string;
  search: string;
  /** "all" hoặc mã nhóm thiết bị. */
  categoryCode: string;
};

/** Lọc theo ô nhóm + ô tìm kiếm + nhóm thiết bị của trang. Tình trạng/trạng thái/KPI chỉ áp cho máy có mã. */
export function filterTools(rows: ToolRow[], filter: ToolFilter): ToolRow[] {
  return rows.filter((row) =>
    (filter.groupId === "all" || row.groupId === filter.groupId)
    && (filter.categoryCode === "all" || row.categoryCode === filter.categoryCode)
    && matchesSearch(toolSearchValues(row), filter.search));
}
