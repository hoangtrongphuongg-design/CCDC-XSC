/**
 * Truy vấn lịch sử hoạt động dùng chung cho trang /activities và route xuất Excel, để hai nơi
 * luôn cùng một quy tắc hiển thị. Chỉ chạy ở server.
 */
import { and, desc, eq, gte, lte, notInArray, notLike, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLogs, groups, users } from "@/lib/db/schema";
import { ADMIN_ONLY_ACTION_PREFIXES, MIRROR_ACTIONS } from "@/lib/activity-log";

export type ActivityRow = {
  createdAt: Date;
  actor: string | null;
  groupName: string | null;
  action: string;
  description: string;
  reason: string | null;
};

/**
 * Quy tắc hiển thị (khớp `isVisibleActivity` ở lib/activity-log.ts):
 * - luôn ẩn bản sao ghi theo máy của bước mượn/trả (tránh hiện trùng 2 dòng cho 1 thao tác);
 * - sự kiện tài khoản/nhóm (`user.*`, `group.*`) chỉ Admin hệ thống thấy.
 */
function visibilityCondition(isAdmin: boolean, range?: { fromAt: Date; toAt: Date }): SQL | undefined {
  const conditions: SQL[] = [notInArray(activityLogs.action, MIRROR_ACTIONS)];
  if (!isAdmin) {
    for (const prefix of ADMIN_ONLY_ACTION_PREFIXES) conditions.push(notLike(activityLogs.action, `${prefix}%`));
  }
  if (range) conditions.push(gte(activityLogs.createdAt, range.fromAt), lte(activityLogs.createdAt, range.toAt));
  return and(...conditions);
}

/** Hoạt động mới nhất lên trên, toàn Xưởng. `range` giới hạn theo thời điểm (đã đổi từ ngày giờ VN). */
export async function loadActivities(options: {
  isAdmin: boolean;
  limit: number;
  range?: { fromAt: Date; toAt: Date };
}): Promise<ActivityRow[]> {
  return db.select({
    createdAt: activityLogs.createdAt,
    actor: users.fullName,
    groupName: groups.name,
    action: activityLogs.action,
    description: activityLogs.description,
    reason: activityLogs.reason,
  }).from(activityLogs)
    .leftJoin(users, eq(activityLogs.actorUserId, users.id))
    .leftJoin(groups, eq(activityLogs.actorGroupId, groups.id))
    .where(visibilityCondition(options.isAdmin, options.range))
    .orderBy(desc(activityLogs.createdAt))
    .limit(options.limit);
}
