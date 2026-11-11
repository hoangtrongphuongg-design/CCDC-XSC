import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { buildInventoryWorkbook } from "@/lib/export/inventory-workbook";
import { vnDate } from "@/lib/export/equipment-export";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";
import { loadInventoryDetail } from "@/lib/inventory-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Biên bản kiểm kê (Excel) của một đợt; chỉ tài khoản được xem đợt đó (thành viên nhóm hoặc vai trò toàn Xưởng). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);

  const { id } = await params;
  const detail = await loadInventoryDetail(auth, id);
  if (!detail) return new Response("Không tìm thấy đợt kiểm kê hoặc bạn không có quyền xem.", { status: 404 });

  const generatedAt = new Date();
  const bytes = await buildInventoryWorkbook({ generatedAt, exportedBy: auth.fullName, detail });
  return xlsxResponse(bytes, `bien-ban-kiem-ke-${detail.session.code.toLowerCase()}-${vnDate(generatedAt)}.xlsx`);
}
