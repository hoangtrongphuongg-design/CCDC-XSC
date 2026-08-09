import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeftRight, CheckCircle2, Clock3, PackageCheck, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, transfers } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  acceptTransferCounterpartAction,
  approveTransferByWsAction,
  confirmTransferHandoverAction,
  confirmTransferReceiptAction,
  createTransferAction,
} from "@/actions/transfers";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";

export default async function TransfersPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, rows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId }).from(equipment).where(and(inArray(equipment.status, ["in_use_owner", "on_loan", "return_requested"]), eq(equipment.recordStatus, "active"))).orderBy(asc(equipment.code)),
    db.select().from(transfers).orderBy(desc(transfers.createdAt)).limit(100),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map((await db.select({ id: equipment.id, code: equipment.code }).from(equipment)).map((e) => [e.id, e.code]));
  const actingGroups = auth.permissions.filter((p) => p.groupCode !== "KHO_TL" && p.level !== "viewer" && isOfficialOperationalGroupCode(p.groupCode));
  const waitingGroups = rows.filter((row) => ["pending_source", "pending_target"].includes(row.status)).length;
  const waitingWs = rows.filter((row) => row.status === "pending_ws").length;
  const handover = rows.filter((row) => row.status === "wait_handover").length;
  const completed = rows.filter((row) => row.status === "completed").length;

  return (
    <>
      <PageHeader title="Điều chuyển" description="Chuyển quyền quản lý cố định sang nhóm khác; mã máy được giữ nguyên suốt vòng đời." />
      <section className="stat-grid">
        <StatCard title="Chờ nhóm xác nhận" value={waitingGroups} icon={Clock3} tone="warning" />
        <StatCard title="Chờ WS phê duyệt" value={waitingWs} icon={ArrowLeftRight} tone="violet" />
        <StatCard title="Chờ bàn giao" value={handover} icon={PackageCheck} tone="cyan" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>
      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Danh sách phiếu điều chuyển</CardTitle><ArrowLeftRight size={18} /></CardHeader>
          <CardContent>
            <DataTable headers={["Phiếu", "Máy", "Nhóm giao", "Nhóm nhận", "Trạng thái", "Thao tác"]} rows={rows.map((row) => {
              const actions = [] as React.ReactNode[];
              const counterpartGroup = row.status === "pending_target" ? row.targetGroupId : row.status === "pending_source" ? row.sourceGroupId : null;
              if (counterpartGroup && hasGroupPermission(auth, counterpartGroup, "manager")) actions.push(<form action={acceptTransferCounterpartAction} key="accept"><input type="hidden" name="transferId" value={row.id} /><Button size="sm">Đồng ý</Button></form>);
              if (row.status === "pending_ws" && auth.isWorkshopAdmin) actions.push(<form action={approveTransferByWsAction} key="ws"><input type="hidden" name="transferId" value={row.id} /><Button size="sm">WS duyệt</Button></form>);
              if (row.status === "wait_handover" && !row.handedOverAt && hasGroupPermission(auth, row.sourceGroupId, "manager")) actions.push(<form action={confirmTransferHandoverAction} key="handover" className="row-actions"><input type="hidden" name="transferId" value={row.id} /><input name="handoverCondition" placeholder="Tình trạng bàn giao" aria-label="Tình trạng bàn giao" className="field-inline-lg" /><Button size="sm" variant="secondary">Đã giao</Button></form>);
              if (row.status === "wait_handover" && row.handedOverAt && hasGroupPermission(auth, row.targetGroupId, "manager")) actions.push(<form action={confirmTransferReceiptAction} key="receive"><input type="hidden" name="transferId" value={row.id} /><Button size="sm">Đã nhận</Button></form>);
              return [<strong key="code">{row.code}</strong>, equipmentMap.get(row.equipmentId) || "—", groupMap.get(row.sourceGroupId) || "—", groupMap.get(row.targetGroupId) || "—", <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={row.status === "completed" ? "success" : "info"} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
            })} empty={<EmptyState description="Chưa có phiếu điều chuyển." />} />
          </CardContent>
        </Card>
        <Card className="side-panel">
          <CardHeader><CardTitle>Tạo đề xuất điều chuyển</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {actingGroups.length ? <form action={createTransferAction} className="form-grid">
              <FormField label="Đại diện nhóm" required><select name="actingGroupId">{actingGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
              <FormField label="Máy" required><select name="equipmentId">{equipmentRows.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></FormField>
              <FormField label="Nhóm nhận" required><select name="targetGroupId">{groupRows.filter((g) => !g.isSystem && isOfficialOperationalGroupCode(g.code)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
              <FormField label="Lý do điều chuyển" required><textarea name="reason" placeholder="Nêu rõ nhu cầu và lý do thay đổi nhóm quản lý" /></FormField>
              <Button type="submit">Gửi đề xuất</Button>
            </form> : <EmptyState title="Chỉ xem" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
