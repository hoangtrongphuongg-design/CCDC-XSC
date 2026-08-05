import { count, inArray, isNull, sql } from "drizzle-orm";
import { Activity, ArrowLeftRight, Boxes, Handshake, Recycle, Wrench, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, disposals, equipment, machineLoans, quickLoans, repairs, transfers } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const [[equipmentCount], [loanCount], [quickCount], [repairCount], [transferCount], [disposalCount], recent] = await Promise.all([
    db.select({ value: count() }).from(equipment).where(isNull(equipment.archivedAt)),
    db.select({ value: count() }).from(machineLoans).where(inArray(machineLoans.status, ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"])),
    db.select({ value: count() }).from(quickLoans).where(inArray(quickLoans.status, ["pending_receipt", "borrowed", "return_reported"])),
    db.select({ value: count() }).from(repairs).where(inArray(repairs.status, ["pending_acceptance", "repairing", "wait_owner_confirm"])),
    db.select({ value: count() }).from(transfers).where(inArray(transfers.status, ["pending_source", "pending_target", "pending_ws", "wait_handover"])),
    db.select({ value: count() }).from(disposals).where(inArray(disposals.status, ["pending_group", "pending_ws", "wait_warehouse"])),
    db.select().from(activityLogs).orderBy(sql`${activityLogs.createdAt} desc`).limit(8),
  ]);

  return (
    <>
      <PageHeader title="Tổng quan" description="Tình hình CCDC, giao dịch và công việc đang mở trong toàn Xưởng Sửa chữa." />
      <section className="stat-grid">
        <StatCard title="Máy có mã" value={equipmentCount.value} icon={Boxes} />
        <StatCard title="Phiếu mượn mở" value={loanCount.value} icon={Handshake} />
        <StatCard title="Mượn nhanh mở" value={quickCount.value} icon={Zap} />
        <StatCard title="Đang sửa chữa" value={repairCount.value} icon={Wrench} />
        <StatCard title="Điều chuyển mở" value={transferCount.value} icon={ArrowLeftRight} />
        <StatCard title="Chờ thanh lý" value={disposalCount.value} icon={Recycle} />
      </section>
      <Card>
        <CardHeader><CardTitle>Hoạt động gần đây</CardTitle><Activity size={19} aria-hidden="true" /></CardHeader>
        <CardContent>
          <DataTable
            headers={["Thời gian", "Hành động", "Nội dung"]}
            rows={recent.map((row) => [formatDateTime(row.createdAt), row.action, row.description])}
            empty={<EmptyState description="Chưa có hoạt động được ghi nhận." />}
          />
        </CardContent>
      </Card>
    </>
  );
}
