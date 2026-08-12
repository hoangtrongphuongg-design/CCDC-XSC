import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeftRight, CheckCircle2, Clock3, PackageCheck, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { disposals, equipment, groups, machineLoans, repairs, transfers } from "@/lib/db/schema";
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
import { SearchableSelect } from "@/components/searchable-select";
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
  const [groupRows, equipmentRows, rows, openLoans, openRepairs, openTransfers, openDisposals] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({
      id: equipment.id, code: equipment.code, legacyCode: equipment.legacyCode, name: equipment.name,
      model: equipment.model, equipmentType: equipment.equipmentType, ownerGroupId: equipment.ownerGroupId,
    }).from(equipment).where(and(eq(equipment.status, "in_use_owner"), eq(equipment.recordStatus, "active"))).orderBy(asc(equipment.code)),
    db.select().from(transfers).orderBy(desc(transfers.createdAt)).limit(100),
    db.select({ equipmentId: machineLoans.equipmentId }).from(machineLoans).where(inArray(machineLoans.status, ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"])),
    db.select({ equipmentId: repairs.equipmentId }).from(repairs).where(inArray(repairs.status, ["pending_acceptance", "repairing", "wait_owner_confirm"])),
    db.select({ equipmentId: transfers.equipmentId }).from(transfers).where(inArray(transfers.status, ["pending_source", "pending_target", "pending_ws", "wait_handover"])),
    db.select({ equipmentId: disposals.equipmentId }).from(disposals).where(inArray(disposals.status, ["pending_group", "pending_ws", "wait_warehouse"])),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map((await db.select({ id: equipment.id, code: equipment.code }).from(equipment)).map((e) => [e.id, e.code]));
  const busyEquipmentIds = new Set([...openLoans, ...openRepairs, ...openTransfers, ...openDisposals].map((row) => row.equipmentId));
  const transferableEquipment = equipmentRows.filter((item) => !busyEquipmentIds.has(item.id));
  const actingGroups = auth.permissions.filter((p) => p.groupCode !== "KHO_TL" && p.level === "manager" && isOfficialOperationalGroupCode(p.groupCode));
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
              <FormField label="Đại diện nhóm" required hint="Chỉ các nhóm mà bạn có vai trò Đốc công khu vực."><select name="actingGroupId" id="transfer-acting-group">{actingGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
              <FormField label="Máy" required hint="Chỉ hiển thị máy thuộc quyền quản lý của nhóm đại diện và không nằm trong quy trình khác.">
                <SearchableSelect
                  name="equipmentId"
                  required
                  controllerId="transfer-acting-group"
                  includeControllerValue
                  placeholder="Tìm máy của nhóm mình..."
                  searchPlaceholder="Gõ mã, tên máy, model, loại..."
                  emptyText="Nhóm này không có máy đủ điều kiện điều chuyển."
                  options={transferableEquipment.map((item) => ({
                    value: item.id,
                    groupId: item.ownerGroupId,
                    label: `${item.code} — ${item.name}`,
                    description: [item.legacyCode, item.model, item.equipmentType, groupMap.get(item.ownerGroupId)].filter(Boolean).join(" · "),
                  }))}
                />
              </FormField>
              <FormField label="Nhóm nhận" required><select name="targetGroupId">{groupRows.filter((g) => !g.isSystem && isOfficialOperationalGroupCode(g.code)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
              <FormField label="Lý do điều chuyển" required><textarea name="reason" placeholder="Nêu rõ nhu cầu và lý do thay đổi nhóm quản lý" /></FormField>
              <Button type="submit">Gửi đề xuất</Button>
            </form> : <EmptyState title="Không có quyền tạo điều chuyển" description="Chỉ Đốc công khu vực của nhóm quản lý máy mới được lập đề xuất điều chuyển." />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
