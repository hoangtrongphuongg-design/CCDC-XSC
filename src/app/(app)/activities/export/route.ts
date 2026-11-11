import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { MAX_EXPORT_ROWS, parseExportRange } from "@/lib/activity-log";
import { loadActivities } from "@/lib/activity-query";
import { buildActivityWorkbook } from "@/lib/export/activity-workbook";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Xuất Excel lịch sử hoạt động theo khoảng ngày (giờ VN), mỗi nghiệp vụ một sheet.
 * Mọi tài khoản đã đăng nhập xuất được phần mình được xem (sự kiện tài khoản/nhóm chỉ Admin).
 */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);

  const params = new URL(request.url).searchParams;
  const range = parseExportRange(params.get("from"), params.get("to"));

  const fetched = await loadActivities({
    isAdmin: auth.isAdmin,
    limit: MAX_EXPORT_ROWS + 1,
    range: { fromAt: range.fromAt, toAt: range.toAt },
  });
  const truncated = fetched.length > MAX_EXPORT_ROWS;
  const rows = truncated ? fetched.slice(0, MAX_EXPORT_ROWS) : fetched;

  const bytes = await buildActivityWorkbook({
    generatedAt: new Date(),
    exportedBy: auth.fullName,
    fromIso: range.from,
    toIso: range.to,
    rows,
    truncated,
  });
  return xlsxResponse(bytes, `lich-su-hoat-dong-${range.from}-den-${range.to}.xlsx`);
}
