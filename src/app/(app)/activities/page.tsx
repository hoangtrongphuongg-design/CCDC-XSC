import { Activity, FileSpreadsheet } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { FEED_LIMIT, actionLabel, defaultExportRange } from "@/lib/activity-log";
import { loadActivities } from "@/lib/activity-query";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Lịch sử đơn giản: hoạt động mới nhất của TOÀN Xưởng cho mọi tài khoản đã đăng nhập.
 * Sự kiện tài khoản/nhóm chỉ Admin thấy, bản sao theo máy bị ẩn (xem lib/activity-query.ts).
 */
export default async function ActivitiesPage() {
  const auth = await requireUser();
  const rows = await loadActivities({ isAdmin: auth.isAdmin, limit: FEED_LIMIT });
  const range = defaultExportRange();

  return (
    <>
      <PageHeader
        title="Lịch sử hoạt động"
        description="Các hoạt động mới nhất của toàn Xưởng: mượn/trả, điều chuyển, sửa chữa, thanh lý, cập nhật CCDC."
      />
      <Card className="table-card">
        <CardHeader><CardTitle>{FEED_LIMIT} hoạt động mới nhất</CardTitle><Activity size={18} /></CardHeader>
        <CardContent>
          {/* Form GET tới route tải file: trình duyệt tải về, trang giữ nguyên. */}
          <form className="activity-export-bar" action="/activities/export" method="get">
            <label>Từ ngày<input type="date" name="from" defaultValue={range.from} required /></label>
            <label>Đến ngày<input type="date" name="to" defaultValue={range.to} required /></label>
            <Button type="submit" variant="secondary"><FileSpreadsheet size={16} aria-hidden="true" /> Xuất Excel theo nghiệp vụ</Button>
          </form>
          <DataTable
            headers={["Thời gian", "Người thực hiện", "Nhóm", "Hành động", "Nội dung"]}
            rows={rows.map((row) => [
              formatDateTime(row.createdAt),
              row.actor || "Hệ thống",
              row.groupName || "—",
              <strong key="action">{actionLabel(row.action)}</strong>,
              <div key="content">
                <div>{row.description}</div>
                {row.reason ? <div className="activity-content-reason">Lý do: {row.reason}</div> : null}
              </div>,
            ])}
            empty={<EmptyState description="Chưa có hoạt động nào." />}
          />
        </CardContent>
      </Card>
    </>
  );
}
