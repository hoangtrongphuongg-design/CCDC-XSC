import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { buildLoanWorkbook } from "@/lib/export/loan-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";
import { buildMachineLoanRows, buildQuickLoanRows, loanExportFileName } from "@/lib/loans-export";
import { loadLoansForExport } from "@/lib/loans-export-data";
import { parseRepairRange } from "@/lib/repairs-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Xuất Excel Mượn – Trả (sheet Mượn máy + Mượn nhanh + Tổng hợp), lọc tùy chọn theo ngày đề nghị (giờ VN).
 * Chỉ Quản lý Xưởng / Admin. Route handler không đi qua layout nên tự kiểm đăng nhập.
 */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);
  if (!auth.isWorkshopAdmin || auth.isReadOnlyViewer) return new Response("Chỉ Quản lý Xưởng hoặc Admin được xuất phiếu mượn – trả.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const range = parseRepairRange(params.get("from"), params.get("to"));
  const generatedAt = new Date();
  const loaded = await loadLoansForExport({ fromAt: range.fromAt, toAt: range.toAt });
  const bytes = await buildLoanWorkbook({
    generatedAt,
    exportedBy: auth.fullName,
    range: { from: range.from, to: range.to },
    machine: buildMachineLoanRows(loaded.machine, generatedAt),
    quick: buildQuickLoanRows(loaded.quick, generatedAt),
    truncated: loaded.truncated,
  });
  return xlsxResponse(bytes, loanExportFileName(range, generatedAt));
}
