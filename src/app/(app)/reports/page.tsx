import { and, count, eq } from "drizzle-orm";
import { AlertTriangle, BarChart3, Boxes, Download, Handshake, PauseCircle, Wallet, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, repairs, disposals } from "@/lib/db/schema";
import { requireWholeWorkshopView } from "@/lib/auth/guards";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DistributionBars } from "@/components/distribution-bars";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { IDLE_DAYS, dmy, formatVnd } from "@/lib/reports";
import { loadOperationsReport } from "@/lib/reports-data";

export const dynamic = "force-dynamic";

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return `${m}/${year}`;
}

export default async function ReportsPage() {
  await requireWholeWorkshopView();

  const [statusRows, groupRows, [loanTotal], [repairTotal], [disposalTotal], operations] = await Promise.all([
    db.select({ status: equipment.status, total: count() }).from(equipment).where(eq(equipment.recordStatus, "active")).groupBy(equipment.status).orderBy(equipment.status),
    db.select({ groupId: groups.id, groupName: groups.name, total: count(equipment.id) })
      .from(groups).leftJoin(equipment, and(eq(groups.id, equipment.ownerGroupId), eq(equipment.recordStatus, "active"))).groupBy(groups.id, groups.name).orderBy(groups.name),
    db.select({ value: count() }).from(machineLoans),
    db.select({ value: count() }).from(repairs),
    db.select({ value: count() }).from(disposals),
    loadOperationsReport(),
  ]);
  const totalEquipment = statusRows.reduce((sum, row) => sum + Number(row.total), 0);
  const statusItems = statusRows.map((row) => ({ label: EQUIPMENT_STATUS_LABELS[row.status], value: Number(row.total) }));
  const groupItems = groupRows.map((row) => ({ label: row.groupName, value: Number(row.total) }));

  const { overdue, repairByMonth, repairByGroup, idle } = operations;
  const repairTotalCost = repairByMonth.reduce((sum, row) => sum + row.total, 0);
  const repairTotalTickets = repairByMonth.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="reports-page">
      <PageHeader
        title="Báo cáo quản trị"
        description="Việc cần chú ý (quá hạn trả, máy nằm không), chi phí sửa chữa và cơ cấu máy phục vụ điều hành Xưởng Sửa chữa."
        actions={<a className="btn btn-secondary" href="/reports/export"><Download size={16} /> Xuất Excel</a>}
      />
      <section className="stat-grid six">
        <StatCard title="Phiếu quá hạn trả" value={overdue.length} icon={AlertTriangle} tone="danger" note="Nhóm mượn còn giữ, đã quá hạn" />
        <StatCard title="Máy nằm không" value={idle.total} icon={PauseCircle} tone="warning" note={`Sẵn sàng, không ai mượn > ${IDLE_DAYS} ngày`} />
        <StatCard title="Chi phí sửa 12 tháng" value={formatVnd(repairTotalCost)} icon={Wallet} tone="violet" note={`${repairTotalTickets} phiếu hoàn tất`} />
        <StatCard title="Tổng máy có mã" value={totalEquipment} icon={Boxes} tone="primary" />
        <StatCard title="Tổng lượt mượn máy" value={loanTotal.value} icon={Handshake} tone="cyan" />
        <StatCard title="Tổng lượt sửa / thanh lý" value={`${repairTotal.value} / ${disposalTotal.value}`} icon={Wrench} tone="success" note="Số phiếu sửa / số phiếu thanh lý" />
      </section>

      <Card id="qua-han">
        <CardHeader><CardTitle>Phiếu quá hạn trả</CardTitle><AlertTriangle size={18} /></CardHeader>
        <CardContent>
          <div className="report-table">
            <DataTable
              headers={["Loại", "Mã phiếu", "Máy / CCDC", "Nhóm mượn", "Nhóm cho mượn", "Hạn trả", "Trễ (ngày)"]}
              rows={overdue.map((r) => [r.kind, r.code, r.label, r.borrowerGroup, r.ownerGroup, dmy(r.dueDate), <strong key="late" className="report-late">{r.daysLate}</strong>])}
              empty={<EmptyState title="Không có phiếu quá hạn" description="Mọi phiếu mượn đang giữ đều còn trong hạn." />}
            />
          </div>
        </CardContent>
      </Card>

      <div className="content-grid equal">
        <Card>
          <CardHeader><CardTitle>Chi phí sửa chữa theo tháng</CardTitle><Wrench size={18} /></CardHeader>
          <CardContent>
            <p className="muted report-note">12 tháng gần nhất, tính theo ngày hoàn tất phiếu sửa.</p>
            <div className="report-table">
              <DataTable
                headers={["Tháng", "Số phiếu", "Chi phí"]}
                rows={repairByMonth.map((r) => [monthLabel(r.month), r.count, formatVnd(r.total)])}
                empty={<EmptyState />}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Chi phí sửa chữa theo nhóm</CardTitle><Wrench size={18} /></CardHeader>
          <CardContent>
            <p className="muted report-note">Theo nhóm quản lý máy, cùng 12 tháng; nhóm tốn nhiều nhất lên đầu.</p>
            <div className="report-table">
              <DataTable
                headers={["Nhóm", "Số phiếu", "Chi phí"]}
                rows={repairByGroup.map((r) => [r.name, r.count, formatVnd(r.total)])}
                empty={<EmptyState title="Chưa có phiếu sửa hoàn tất" description="Chưa có phiếu sửa nào hoàn tất trong 12 tháng gần nhất." />}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Máy nằm không trên {IDLE_DAYS} ngày</CardTitle><PauseCircle size={18} /></CardHeader>
        <CardContent>
          <p className="muted report-note">
            Máy đang Sẵn sàng (tình trạng Tốt) mà không có phiếu mượn nào từ {IDLE_DAYS} ngày nay.
            {idle.total > idle.rows.length ? ` Hiện ${idle.rows.length} máy nằm lâu nhất trong tổng ${idle.total} máy.` : ""}
          </p>
          <div className="report-table">
            <DataTable
              headers={["Mã hệ thống", "Tên CCDC", "Nhóm quản lý", "Tính từ", "Nằm không (ngày)"]}
              rows={idle.rows.map((r) => [r.code, r.name, r.group, `${dmy(r.since)}${r.neverBorrowed ? " (chưa từng mượn)" : ""}`, r.idleDays])}
              empty={<EmptyState title="Không có máy nằm không" description={`Mọi máy Sẵn sàng đều có hoạt động mượn trong ${IDLE_DAYS} ngày qua.`} />}
            />
          </div>
        </CardContent>
      </Card>

      <div className="content-grid equal">
        <Card>
          <CardHeader><CardTitle>Cơ cấu máy theo trạng thái</CardTitle><BarChart3 size={18} /></CardHeader>
          <CardContent>
            {statusItems.length ? <DistributionBars items={statusItems} /> : <EmptyState />}
            <div className="report-table"><DataTable headers={["Trạng thái", "Số lượng"]} rows={statusRows.map((r) => [EQUIPMENT_STATUS_LABELS[r.status], Number(r.total)])} empty={<EmptyState />} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Phân bổ máy theo nhóm quản lý</CardTitle><Boxes size={18} /></CardHeader>
          <CardContent>
            {groupItems.length ? <DistributionBars items={groupItems} /> : <EmptyState />}
            <div className="report-table"><DataTable headers={["Nhóm", "Số máy"]} rows={groupRows.map((r) => [r.groupName, Number(r.total)])} empty={<EmptyState />} /></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
