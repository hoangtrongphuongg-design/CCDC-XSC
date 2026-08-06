import Link from "next/link";
import { and, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  ChevronRight,
  Clock3,
  Handshake,
  Plus,
  Recycle,
  Wrench,
} from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, disposals, equipment, machineLoans, repairs, transfers } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/utils";

const statusMeta = {
  in_use_owner: ["Sẵn sàng", "#7BA7CC"],
  wait_handover: ["Chờ giao", "#4C91C7"],
  on_loan: ["Đang mượn", "#1F6FAE"],
  return_requested: ["Chờ nhận lại", "#2C83BF"],
  wait_inspection: ["Chờ kiểm tra", "#8AB6D6"],
  repairing: ["Đang sửa chữa", "#E08A19"],
  wait_repair_confirm: ["Chờ xác nhận sửa", "#D3A23C"],
  wait_disposal: ["Chờ thanh lý", "#D65A4A"],
  disposal_warehouse: ["Kho thanh lý", "#8996A5"],
  inactive: ["Ngừng sử dụng", "#AEB7C2"],
} as const;

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [
    [equipmentCount],
    [loanCount],
    [pendingLoanCount],
    [overdueLoanCount],
    [repairCount],
    [transferCount],
    [disposalCount],
    statusRows,
    recent,
  ] = await Promise.all([
    db.select({ value: count() }).from(equipment).where(and(isNull(equipment.archivedAt), eq(equipment.recordStatus, "active"))),
    db.select({ value: count() }).from(machineLoans).where(inArray(machineLoans.status, ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"])),
    db.select({ value: count() }).from(machineLoans).where(eq(machineLoans.status, "pending_owner")),
    db.select({ value: count() }).from(machineLoans).where(and(lt(machineLoans.expectedReturnDate, today), inArray(machineLoans.status, ["on_loan", "return_requested", "incident"]))),
    db.select({ value: count() }).from(repairs).where(inArray(repairs.status, ["pending_acceptance", "repairing", "wait_owner_confirm"])),
    db.select({ value: count() }).from(transfers).where(inArray(transfers.status, ["pending_source", "pending_target", "pending_ws", "wait_handover"])),
    db.select({ value: count() }).from(disposals).where(inArray(disposals.status, ["pending_group", "pending_ws", "wait_warehouse"])),
    db.select({ status: equipment.status, value: count() }).from(equipment).where(and(isNull(equipment.archivedAt), eq(equipment.recordStatus, "active"))).groupBy(equipment.status),
    db.select().from(activityLogs).orderBy(sql`${activityLogs.createdAt} desc`).limit(6),
  ]);

  const actionCount = Number(pendingLoanCount.value) + Number(overdueLoanCount.value) + Number(repairCount.value) + Number(transferCount.value);
  const totalEquipment = Number(equipmentCount.value);
  const statusData = statusRows.map((row) => ({
    status: row.status,
    value: Number(row.value),
    label: statusMeta[row.status]?.[0] || row.status,
    color: statusMeta[row.status]?.[1] || "#AEB7C2",
  })).sort((a, b) => b.value - a.value);
  const donutStops = statusData.length
    ? statusData.reduce<{ stop: number; part: string }[]>((acc, item) => {
        const previous = acc.at(-1)?.stop || 0;
        const stop = previous + (totalEquipment ? item.value / totalEquipment * 100 : 0);
        acc.push({ stop, part: `${item.color} ${previous}% ${stop}%` });
        return acc;
      }, []).map((item) => item.part).join(", ")
    : "#DDE5EC 0% 100%";

  const tasks = [
    { label: "Phiếu mượn chờ duyệt", count: Number(pendingLoanCount.value), href: "/machine-loans", icon: Handshake, tone: "blue" },
    { label: "Dụng cụ quá hạn trả", count: Number(overdueLoanCount.value), href: "/machine-loans", icon: AlertTriangle, tone: "red" },
    { label: "Dụng cụ đang sửa chữa", count: Number(repairCount.value), href: "/repairs", icon: Wrench, tone: "orange" },
    { label: "Đề nghị điều chuyển", count: Number(transferCount.value), href: "/transfers", icon: ArrowLeftRight, tone: "sky" },
  ] as const;

  return (
    <>
      <PageHeader
        title="Tổng quan vận hành"
        description="Theo dõi tình hình CCDC, phiếu mượn và các công việc đang mở trong toàn xưởng."
        actions={
          <>
            <Link href="/machine-loans" className="btn btn-secondary"><Handshake size={16} /> Tạo phiếu mượn</Link>
            <Link href="/my-equipment" className="btn btn-primary"><Plus size={16} /> Thêm dụng cụ</Link>
          </>
        }
      />

      <section className="executive-kpis" aria-label="Chỉ số vận hành">
        <article className="executive-kpi is-focus">
          <div><span>Cần xử lý</span><strong>{actionCount}</strong></div>
          <AlertTriangle size={24} />
          <small>{pendingLoanCount.value} chờ duyệt · {overdueLoanCount.value} quá hạn</small>
        </article>
        <article className="executive-kpi"><div><span>Tổng CCDC</span><strong>{equipmentCount.value}</strong></div><Boxes size={23} /><small>Dữ liệu đang hoạt động</small></article>
        <article className="executive-kpi"><div><span>Đang mượn</span><strong>{loanCount.value}</strong></div><Handshake size={23} /><small>{overdueLoanCount.value} phiếu quá hạn</small></article>
        <article className="executive-kpi"><div><span>Đang sửa chữa</span><strong>{repairCount.value}</strong></div><Wrench size={23} /><small>Cần tiếp tục theo dõi</small></article>
        <article className="executive-kpi"><div><span>Chờ thanh lý</span><strong>{disposalCount.value}</strong></div><Recycle size={23} /><small>Hồ sơ chưa kết thúc</small></article>
      </section>

      <section className="dashboard-operations-grid">
        <Card className="operations-card">
          <CardHeader><CardTitle>Công việc cần xử lý</CardTitle><Clock3 size={18} /></CardHeader>
          <CardContent>
            <div className="task-list">
              {tasks.map(({ label, count: value, href, icon: Icon, tone }) => (
                <Link href={href} key={label} className="task-row" data-tone={tone}>
                  <span className="task-icon"><Icon size={17} /></span>
                  <strong>{label}</strong>
                  <b>{value}</b>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="status-card">
          <CardHeader><CardTitle>Trạng thái dụng cụ</CardTitle><Boxes size={18} /></CardHeader>
          <CardContent>
            <div className="status-overview">
              <div className="status-donut" style={{ background: `conic-gradient(${donutStops})` }}>
                <div><strong>{totalEquipment}</strong><span>Tổng số</span></div>
              </div>
              <div className="status-legend">
                {statusData.slice(0, 6).map((item) => (
                  <div key={item.status}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></div>
                ))}
                {!statusData.length ? <span className="muted">Chưa có dữ liệu thiết bị.</span> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="recent-card">
          <CardHeader><CardTitle>Hoạt động gần đây</CardTitle><Link href="/activities">Xem tất cả</Link></CardHeader>
          <CardContent>
            {recent.length ? <div className="recent-activity-list">
              {recent.map((row) => (
                <div className="recent-activity-row" key={row.id}>
                  <span className="activity-icon"><Activity size={15} /></span>
                  <div><strong>{row.action}</strong><span>{row.description}</span></div>
                  <time>{formatDateTime(row.createdAt)}</time>
                </div>
              ))}
            </div> : <EmptyState description="Chưa có hoạt động được ghi nhận." />}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
