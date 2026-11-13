import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { loadAllGroups, loadTools, loadWorkshopEquipment } from "@/lib/equipment-data";
import { describeFilters, filtersHideTools, matchesEquipmentFilters, matchesToolFilters, parseEquipmentFilters } from "@/lib/equipment-filter";
import {
  buildWorkshopTree,
  equipmentSearchValues,
  exportFileName,
  matchesSearch,
  toExportEquipment,
  toolSearchValues,
} from "@/lib/export/equipment-export";
import { buildWorkshopWorkbook } from "@/lib/export/equipment-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Xuất Excel báo cáo từ "Dụng cụ toàn xưởng": một sheet, phân theo nhóm quản lý, trong nhóm
 * gom các loại máy cùng loại. Mọi tài khoản đã đăng nhập xuất được (đúng như quyền xem trang).
 * `?q=` giữ nguyên từ khóa đang tìm trên trang.
 */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);

  const filters = parseEquipmentFilters(new URL(request.url).searchParams);
  const query = filters.q;
  const [allGroups, workshop, tools] = await Promise.all([loadAllGroups(), loadWorkshopEquipment(), loadTools()]);
  const groupById = new Map(allGroups.map((group) => [group.id, { code: group.code, name: group.name }]));

  const rows = workshop.rows
    .map((row) => toExportEquipment(row, {
      groupById,
      loan: workshop.loanByEquipment.get(row.id),
      transfer: workshop.transferByEquipment.get(row.id),
      repair: workshop.repairByEquipment.get(row.id),
    }))
    .filter((row) => matchesEquipmentFilters({ ownerGroupId: row.ownerGroupId, status: row.status, condition: row.condition, categoryCode: row.categoryCode }, filters))
    .filter((row) => matchesSearch(equipmentSearchValues(row), query));
  // CCDC theo số lượng không có trạng thái / tình trạng: lọc hai mục đó thì không xuất bảng này.
  const filteredTools = filtersHideTools(filters)
    ? []
    : tools.filter((tool) => matchesToolFilters(tool, filters)).filter((tool) => matchesSearch(toolSearchValues(tool), query));

  const generatedAt = new Date();
  const buffer = await buildWorkshopWorkbook({
    generatedAt,
    exportedBy: `${auth.fullName} (${auth.employeeCode})`,
    query: describeFilters(filters, { groupName: (id) => groupById.get(id)?.name ?? "—" }).map((item) => item.text).join("; "),
    tree: buildWorkshopTree(rows),
    tools: filteredTools,
  });
  return xlsxResponse(buffer, exportFileName("bao-cao-dung-cu-toan-xuong", null, generatedAt));
}
