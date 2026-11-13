/**
 * Số CCDC theo số lượng CHƯA đếm của một đợt kiểm kê (server): CCDC đang hoạt động của nhóm mà đợt chưa có dòng đếm.
 * Dùng NOT EXISTS (không phải "tổng − số dòng đã đếm") để CCDC đã đếm rồi bị ngừng/xóa không làm số liệu lệch.
 * Dùng chung cho tóm tắt đóng đợt, tự đóng và danh sách đợt.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolCatalog } from "@/lib/db/schema";

type Reader = Pick<typeof db, "select">;

export async function countUncountedTools(reader: Reader, sessionId: string, groupId: string): Promise<number> {
  const [row] = await reader.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(toolCatalog)
    .where(and(
      eq(toolCatalog.groupId, groupId),
      eq(toolCatalog.isActive, true),
      eq(toolCatalog.recordStatus, "active"),
      sql`not exists (select 1 from inventory_tool_counts c where c.session_id = ${sessionId} and c.tool_id = ${toolCatalog.id})`,
    ));
  return row?.n ?? 0;
}
