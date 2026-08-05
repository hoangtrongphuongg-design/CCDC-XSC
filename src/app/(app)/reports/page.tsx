import { count, eq, sql } from "drizzle-orm";
import { BarChart3, Boxes, Handshake, Recycle, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, repairs, disposals } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/constants";

export default async function ReportsPage() {
  const [statusRows, groupRows, [loanTotal], [repairTotal], [disposalTotal]] = await Promise.all([
    db.select({ status: equipment.status, total: count() }).from(equipment).groupBy(equipment.status).orderBy(equipment.status),
    db.select({ groupId: groups.id, groupName: groups.name, total: count(equipment.id) })
      .from(groups).leftJoin(equipment, eq(groups.id, equipment.ownerGroupId)).groupBy(groups.id, groups.name).orderBy(groups.name),
    db.select({ value: count() }).from(machineLoans),
    db.select({ value: count() }).from(repairs),
    db.select({ value: count() }).from(disposals),
  ]);
  const totalEquipment = statusRows.reduce((sum, row) => sum + Number(row.total), 0);
  return (
    <>
      <PageHeader title="Báo cáo" description="Tổng hợp máy có mã, giao dịch mượn, sửa chữa và thanh lý." />
      <section className="stat-grid">
        <StatCard title="Tổng máy có mã" value={totalEquipment} icon={Boxes} />
        <StatCard title="Tổng lượt mượn máy" value={loanTotal.value} icon={Handshake} />
        <StatCard title="Tổng lượt sửa" value={repairTotal.value} icon={Wrench} />
        <StatCard title="Tổng phiếu thanh lý" value={disposalTotal.value} icon={Recycle} />
      </section>
      <div className="content-grid">
        <Card>
          <CardHeader><CardTitle>Máy theo trạng thái</CardTitle><BarChart3 size={18} /></CardHeader>
          <CardContent><DataTable headers={["Trạng thái", "Số lượng"]} rows={statusRows.map((r) => [EQUIPMENT_STATUS_LABELS[r.status], Number(r.total)])} empty={<EmptyState />} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Máy theo nhóm quản lý</CardTitle></CardHeader>
          <CardContent><DataTable headers={["Nhóm", "Số máy"]} rows={groupRows.map((r) => [r.groupName, Number(r.total)])} empty={<EmptyState />} /></CardContent>
        </Card>
      </div>
    </>
  );
}
