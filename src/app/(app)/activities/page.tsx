import { desc, eq } from "drizzle-orm";
import { Activity } from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, groups, users } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";

export default async function ActivitiesPage() {
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
    .orderBy(desc(activityLogs.createdAt)).limit(300);

  return (
    <>
      <PageHeader title="Lịch sử hoạt động" description="Nhật ký không xóa của các thao tác quan trọng trong hệ thống." />
      <Card className="table-card">
        <CardHeader><CardTitle>300 hoạt động gần nhất</CardTitle><Activity size={18} /></CardHeader>
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
