import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { buildRepairWorkbook } from "@/lib/export/repair-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";
import { buildRepairRows, parseRepairRange, repairExportFileName } from "@/lib/repairs-export";
import { loadRepairsForExport } from "@/lib/repairs-export-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Xuất Excel toàn bộ phiếu sửa chữa (2 sheet: từng phiếu + tổng hợp), lọc tùy chọn theo ngày báo hỏng (giờ VN).
 * Chỉ Quản lý Xưởng / Admin. Route handler không đi qua layout nên tự kiểm đăng nhập.
 */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);
  if (!auth.isWorkshopAdmin || auth.isReadOnlyViewer) return new Response("Chỉ Quản lý Xưởng hoặc Admin được xuất phiếu sửa chữa.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const range = parseRepairRange(params.get("from"), params.get("to"));
  const generatedAt = new Date();
  const { rows, truncated } = await loadRepairsForExport({ fromAt: range.fromAt, toAt: range.toAt });
  const bytes = await buildRepairWorkbook({
    generatedAt,
    exportedBy: auth.fullName,
    range: { from: range.from, to: range.to },
    rows: buildRepairRows(rows, generatedAt),
    truncated,
  });
  return xlsxResponse(bytes, repairExportFileName(range, generatedAt));
}
