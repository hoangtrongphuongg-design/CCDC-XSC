import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { buildTransferWorkbook } from "@/lib/export/loan-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";
import { buildTransferRows, transferExportFileName } from "@/lib/loans-export";
import { loadTransfersForExport } from "@/lib/loans-export-data";
import { parseRepairRange } from "@/lib/repairs-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Xuất Excel Điều chuyển (sheet Điều chuyển + Tổng hợp), lọc tùy chọn theo ngày đề xuất (giờ VN). Chỉ Quản lý Xưởng / Admin. */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);
  if (!auth.isWorkshopAdmin || auth.isReadOnlyViewer) return new Response("Chỉ Quản lý Xưởng hoặc Admin được xuất phiếu điều chuyển.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const range = parseRepairRange(params.get("from"), params.get("to"));
  const generatedAt = new Date();
  const loaded = await loadTransfersForExport({ fromAt: range.fromAt, toAt: range.toAt });
  const bytes = await buildTransferWorkbook({
    generatedAt,
    exportedBy: auth.fullName,
    range: { from: range.from, to: range.to },
    rows: buildTransferRows(loaded.rows, generatedAt),
    truncated: loaded.truncated,
  });
  return xlsxResponse(bytes, transferExportFileName(range, generatedAt));
}
