import { getActiveAuthOrNull } from "@/lib/auth/guards";
import {
  buildEquipmentPermissions,
  loadAllGroups,
  loadOperationalGroups,
  loadScopedEquipment,
  loadTools,
} from "@/lib/equipment-data";
import { buildInventoryTree, exportFileName, shortGroupName, toExportEquipment } from "@/lib/export/equipment-export";
import { buildInventoryWorkbook } from "@/lib/export/equipment-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Xuất Excel kiểm kê từ "Dụng cụ nhóm tôi". `?group=<id>` xuất một nhóm (phải nằm trong phạm vi
 * quyền), `?group=all` xuất mọi nhóm trong phạm vi quyền. Danh sách máy dùng cùng bộ truy vấn
 * với màn hình nên file luôn khớp những gì đang thấy.
 */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);

  const operationalGroups = await loadOperationalGroups();
  const permissions = buildEquipmentPermissions(auth, operationalGroups);
  const visibleGroupIds = permissions.map((permission) => permission.groupId);
  if (!visibleGroupIds.length) {
    return new Response("Tài khoản chưa có nhóm nào để xuất dữ liệu.", { status: 403 });
  }

  const groupParam = new URL(request.url).searchParams.get("group") || "all";
  if (groupParam !== "all" && !visibleGroupIds.includes(groupParam)) {
    return new Response("Bạn không có quyền xuất dữ liệu của nhóm này.", { status: 403 });
  }

  const scopeIds = groupParam === "all" ? visibleGroupIds : [groupParam];
  const [allGroups, scoped, tools] = await Promise.all([
    loadAllGroups(),
    loadScopedEquipment(scopeIds),
    loadTools(scopeIds),
  ]);
  const groupById = new Map(allGroups.map((group) => [group.id, { code: group.code, name: group.name }]));

  const rows = scoped.rows.map((row) => toExportEquipment(row, {
    groupById,
    loan: scoped.loanByEquipment.get(row.id),
    transfer: scoped.transferByEquipment.get(row.id),
    repair: scoped.repairByEquipment.get(row.id),
  }));

  const selected = groupParam === "all" ? null : operationalGroups.find((group) => group.id === groupParam) ?? null;
  const tree = buildInventoryTree(rows, selected ? { id: selected.id, code: selected.code, name: selected.name } : undefined);
  const scopeLabel = selected
    ? selected.name
    : permissions.length === operationalGroups.length ? "Tất cả nhóm" : "Các nhóm của tôi";

  const generatedAt = new Date();
  const buffer = await buildInventoryWorkbook({
    generatedAt,
    exportedBy: `${auth.fullName} (${auth.employeeCode})`,
    scopeLabel,
    tree,
    tools,
  });
  return xlsxResponse(buffer, exportFileName("kiem-ke", selected ? shortGroupName(selected.name) : "tat-ca-nhom", generatedAt));
}
