import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { loadAllGroups, loadTools, loadWorkshopEquipment } from "@/lib/equipment-data";
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

  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
  const [allGroups, workshop, tools] = await Promise.all([loadAllGroups(), loadWorkshopEquipment(), loadTools()]);
  const groupById = new Map(allGroups.map((group) => [group.id, { code: group.code, name: group.name }]));

  const rows = workshop.rows
    .map((row) => toExportEquipment(row, {
      groupById,
      loan: workshop.loanByEquipment.get(row.id),
      transfer: workshop.transferByEquipment.get(row.id),
      repair: workshop.repairByEquipment.get(row.id),
    }))
    .filter((row) => matchesSearch(equipmentSearchValues(row), query));
  const filteredTools = tools.filter((tool) => matchesSearch(toolSearchValues(tool), query));

  const generatedAt = new Date();
  const buffer = await buildWorkshopWorkbook({
    generatedAt,
    exportedBy: `${auth.fullName} (${auth.employeeCode})`,
    query,
    tree: buildWorkshopTree(rows),
    tools: filteredTools,
  });
  return xlsxResponse(buffer, exportFileName("bao-cao-dung-cu-toan-xuong", null, generatedAt));
}
