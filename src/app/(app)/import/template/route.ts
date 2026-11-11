import { asc } from "drizzle-orm";
import { getActiveAuthOrNull } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { buildImportTemplate } from "@/lib/export/import-template";
import { redirectToLogin, xlsxResponse } from "@/lib/export/xlsx-response";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tải file Excel mẫu để nhập máy. Chỉ Admin hệ thống (khớp quyền của trang /import). */
export async function GET(request: Request) {
  const auth = await getActiveAuthOrNull();
  if (!auth) return redirectToLogin(request);
  if (!auth.isAdmin || auth.isReadOnlyViewer) return new Response("Chỉ Admin hệ thống được tải file mẫu nhập dữ liệu.", { status: 403 });

  const rows = await db.select({ code: groups.code, name: groups.name, isSystem: groups.isSystem, isActive: groups.isActive }).from(groups).orderBy(asc(groups.name));
  const groupNames = rows.filter((g) => !g.isSystem && g.isActive && isOfficialOperationalGroupCode(g.code)).map((g) => g.name);
  const buffer = await buildImportTemplate({ groupNames, generatedAt: new Date() });
  return xlsxResponse(buffer, "mau-nhap-may-tu-excel.xlsx");
}
