import { canViewWholeWorkshop, getActiveAuthOrNull } from "@/lib/auth/guards";
import { buildReportWorkbook } from "@/lib/export/report-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";
import { vnDate } from "@/lib/export/equipment-export";
import { loadOperationsReport } from "@/lib/reports-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Xuất Excel báo cáo điều hành. Chỉ vai trò xem toàn Xưởng (khớp quyền của trang /reports). */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);
  if (!canViewWholeWorkshop(auth)) return new Response("Báo cáo này chỉ dành cho vai trò xem toàn Xưởng.", { status: 403 });

  const generatedAt = new Date();
  const report = await loadOperationsReport(generatedAt);
  const bytes = await buildReportWorkbook({ generatedAt, exportedBy: auth.fullName, report });
  return xlsxResponse(bytes, `bao-cao-dieu-hanh-${vnDate(generatedAt)}.xlsx`);
}
