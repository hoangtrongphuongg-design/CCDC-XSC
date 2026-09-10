import { desc, eq, inArray } from "drizzle-orm";
import { Activity } from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, groups, users } from "@/lib/db/schema";
import { canViewWholeWorkshop, requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const auth = await requireUser();
  const wholeWorkshop = canViewWholeWorkshop(auth);
  const allowedGroupIds = auth.permissions.map((permission) => permission.groupId);

  // Người dùng theo nhóm chỉ xem nhật ký của các nhóm mình được phân quyền;
  // vai trò xem toàn Xưởng thấy tất cả (kể cả thao tác cấp Xưởng không gắn nhóm).
  // inArray(..., []) sinh điều kiện `false` -> không lộ dòng nào khi user chưa có nhóm.
  const scopeFilter = wholeWorkshop
    ? undefined
    : inArray(activityLogs.actorGroupId, allowedGroupIds);

  const rows = await db.select({
    createdAt: activityLogs.createdAt,
    actor: users.fullName,
    employeeCode: users.employeeCode,
    actorRole: activityLogs.actorRole,
    groupName: groups.name,
    action: activityLogs.action,
    entityType: activityLogs.entityType,
    description: activityLogs.description,
    reason: activityLogs.reason,
  }).from(activityLogs)
    .leftJoin(users, eq(activityLogs.actorUserId, users.id))
    .leftJoin(groups, eq(activityLogs.actorGroupId, groups.id))
    .where(scopeFilter)
    .orderBy(desc(activityLogs.createdAt)).limit(300);

  const scopeLabel = wholeWorkshop
    ? "toàn XSC"
    : auth.permissions.length === 1
      ? auth.permissions[0].groupName
      : "các nhóm được phân quyền";

  return (
    <>
      <PageHeader title="Lịch sử hoạt động" description={`Nhật ký không xóa của các thao tác quan trọng trong ${scopeLabel}.`} />
      <Card className="table-card">
        <CardHeader><CardTitle>300 hoạt động gần nhất · {scopeLabel}</CardTitle><Activity size={18} /></CardHeader>
        <CardContent>
          <DataTable
            headers={["Thời gian", "Người thực hiện", "Số danh bộ", "Vai trò", "Nhóm", "Hành động", "Đối tượng", "Nội dung", "Lý do"]}
            rows={rows.map((r) => [
              formatDateTime(r.createdAt),
              r.actor || "Hệ thống",
              r.employeeCode || "—",
              r.actorRole || "—",
              r.groupName || "—",
              r.action,
              r.entityType,
              r.description,
              r.reason || "—",
            ])}
            empty={<EmptyState description="Chưa có lịch sử hoạt động." />}
          />
        </CardContent>
      </Card>
    </>
  );
}
