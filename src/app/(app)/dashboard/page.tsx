import Link from "next/link";
import { count, inArray, isNull, sql } from "drizzle-orm";
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  ChevronRight,
  Handshake,
  Recycle,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import { activityLogs, disposals, equipment, machineLoans, quickLoans, repairs, transfers } from "@/lib/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/utils";

const modules = [
  ["/equipment", "Danh mục CCDC", "Tra cứu máy và dụng cụ toàn xưởng", Boxes],
  ["/machine-loans", "Mượn máy", "Theo dõi phê duyệt, giao và nhận lại", Handshake],
  ["/quick-loans", "Cho mượn nhanh", "Ghi nhận dụng cụ nhỏ không có mã", Zap],
  ["/transfers", "Điều chuyển", "Chuyển quyền quản lý cố định", ArrowLeftRight],
  ["/repairs", "Sửa chữa", "Báo hư và theo dõi kết quả sửa", Wrench],
  ["/disposals", "Thanh lý", "Duyệt và bàn giao kho thanh lý", Recycle],
  ["/reports", "Báo cáo", "Tổng hợp số liệu phục vụ quản lý", Activity],
  ["/activities", "Lịch sử", "Kiểm tra toàn bộ dấu vết thao tác", ShieldCheck],
] as const;

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

  const openWork = Number(loanCount.value) + Number(quickCount.value) + Number(repairCount.value) + Number(transferCount.value) + Number(disposalCount.value);

  return (
    <>
      <PageHeader title="Tổng quan vận hành" description="Trung tâm theo dõi CCDC, giao dịch và các công việc đang mở trong toàn Xưởng Sửa chữa." />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="dashboard-kicker"><ShieldCheck size={14} /> KHÔNG GIAN ĐIỀU HÀNH TẬP TRUNG</div>
          <h2>Một nguồn dữ liệu thống nhất cho toàn bộ vòng đời công cụ dụng cụ.</h2>
          <p>Tra cứu nhanh, thao tác theo đúng quyền nhóm và kiểm soát lịch sử từ lúc cấp phát đến mượn trả, sửa chữa, điều chuyển hoặc thanh lý.</p>
          <div className="quick-links">
            <Link href="/equipment" className="quick-link"><Boxes size={15} /> Xem danh mục</Link>
            <Link href="/machine-loans" className="quick-link"><Handshake size={15} /> Tạo phiếu mượn</Link>
            <Link href="/quick-loans" className="quick-link"><Zap size={15} /> Mượn nhanh</Link>
            <Link href="/repairs" className="quick-link"><Wrench size={15} /> Báo sửa chữa</Link>
          </div>
        </div>
        <div className="dashboard-health">
          <div className="health-head"><strong>Công việc cần theo dõi</strong><span className="health-badge"><i /> Dữ liệu trực tiếp</span></div>
          <div className="health-value">{openWork}</div>
          <div className="health-caption">Tổng phiếu và giao dịch chưa kết thúc trong toàn xưởng.</div>
          <div className="health-breakdown">
            <span><b>{loanCount.value}</b> mượn máy</span>
            <span><b>{repairCount.value}</b> sửa chữa</span>
            <span><b>{transferCount.value}</b> điều chuyển</span>
          </div>
        </div>
      </section>

      <section className="stat-grid six">
        <StatCard title="Máy/CCDC có mã" value={equipmentCount.value} icon={Boxes} tone="primary" />
        <StatCard title="Phiếu mượn mở" value={loanCount.value} icon={Handshake} tone="cyan" />
        <StatCard title="Mượn nhanh mở" value={quickCount.value} icon={Zap} tone="violet" />
        <StatCard title="Đang sửa chữa" value={repairCount.value} icon={Wrench} tone="warning" />
        <StatCard title="Điều chuyển mở" value={transferCount.value} icon={ArrowLeftRight} tone="primary" />
        <StatCard title="Chờ thanh lý" value={disposalCount.value} icon={Recycle} tone="danger" />
      </section>

      <div className="content-grid equal">
        <Card>
          <CardHeader><CardTitle>Truy cập nhanh theo nghiệp vụ</CardTitle><ChevronRight size={18} aria-hidden="true" /></CardHeader>
          <CardContent>
            <div className="module-grid">
              {modules.map(([href, title, description, Icon]) => (
                <Link href={href} className="module-card" key={href}>
                  <div className="module-card-icon"><Icon size={19} /></div>
                  <div><strong>{title}</strong><span>{description}</span></div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="table-card">
          <CardHeader><CardTitle>Hoạt động gần đây</CardTitle><Activity size={18} aria-hidden="true" /></CardHeader>
          <CardContent>
            <DataTable
              headers={["Thời gian", "Hành động", "Nội dung"]}
              rows={recent.map((row) => [formatDateTime(row.createdAt), row.action, row.description])}
              empty={<EmptyState description="Chưa có hoạt động được ghi nhận." />}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
