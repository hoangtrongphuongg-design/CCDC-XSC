import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2, Clock3, SearchX } from "lucide-react";
import { db } from "@/lib/db";
import { disposals, equipment, groups, lossReports, machineLoans, repairs, toolCatalog, transfers } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TicketDialog } from "@/components/ticket-dialog";
import { TicketTableCard } from "@/components/ticket-table-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { workflowTone } from "@/lib/status-style";
import Link from "next/link";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { LOSS_LOAN_STATUSES, LOSS_REPORTABLE_STATUSES } from "@/lib/loss-rule";
import { CLOSED_LOSS_STATUSES, OPEN_DISPOSAL_STATUSES, OPEN_LOSS_STATUSES, OPEN_REPAIR_STATUSES, OPEN_TRANSFER_STATUSES, RECENT_CLOSED_LIMIT } from "@/lib/workflow-status";
import { approveLossAction, cancelLossAction, rejectLossAction, restoreLostEquipmentAction } from "@/actions/loss";
import { submitLoss, submitToolLoss } from "@/actions/ticket-forms";

export const dynamic = "force-dynamic";

export default async function LossesPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, toolRows, openRows, closedRows, loanRows, busyTransfers, busyRepairs, busyDisposals, lostMachines] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, status: equipment.status, ownerGroupId: equipment.ownerGroupId, recordStatus: equipment.recordStatus }).from(equipment).orderBy(asc(equipment.code)),
    db.select().from(toolCatalog).where(eq(toolCatalog.isActive, true)).orderBy(asc(toolCatalog.name)),
    db.select().from(lossReports).where(inArray(lossReports.status, [...OPEN_LOSS_STATUSES])).orderBy(desc(lossReports.createdAt)),
    db.select().from(lossReports).where(inArray(lossReports.status, [...CLOSED_LOSS_STATUSES])).orderBy(desc(lossReports.createdAt)).limit(RECENT_CLOSED_LIMIT),
    db.select({ equipmentId: machineLoans.equipmentId, borrowerGroupId: machineLoans.borrowerGroupId }).from(machineLoans).where(inArray(machineLoans.status, [...LOSS_LOAN_STATUSES])),
    db.select({ equipmentId: transfers.equipmentId }).from(transfers).where(inArray(transfers.status, [...OPEN_TRANSFER_STATUSES])),
    db.select({ equipmentId: repairs.equipmentId }).from(repairs).where(inArray(repairs.status, [...OPEN_REPAIR_STATUSES])),
    db.select({ equipmentId: disposals.equipmentId }).from(disposals).where(inArray(disposals.status, [...OPEN_DISPOSAL_STATUSES])),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId }).from(equipment).where(eq(equipment.status, "lost")).orderBy(asc(equipment.code)),
  ]);

  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map(equipmentRows.map((e) => [e.id, e]));
  const toolMap = new Map(toolRows.map((t) => [t.id, t]));
  const holderGroupByMachine = new Map(loanRows.map((l) => [l.equipmentId, l.borrowerGroupId]));
  const openLossEquipmentIds = new Set(openRows.flatMap((row) => (row.equipmentId ? [row.equipmentId] : [])));
  const busyIds = new Set([...busyTransfers, ...busyRepairs, ...busyDisposals].map((row) => row.equipmentId));

  // Chỉ người có quyền tạo (Kỹ sư giám sát trở lên của nhóm quản lý / nhóm đang mượn giữ, hoặc Quản lý Xưởng/Admin) mới thấy nút.
  const canCreate = !auth.isReadOnlyViewer && (auth.isWorkshopAdmin || auth.permissions.some((p) => p.level !== "viewer" && p.groupCode !== "KHO_TL" && isOfficialOperationalGroupCode(p.groupCode)));
  const reportableMachines = equipmentRows.filter((item) => {
    if (item.recordStatus !== "active" || !(LOSS_REPORTABLE_STATUSES as readonly string[]).includes(item.status)) return false;
    if (busyIds.has(item.id) || openLossEquipmentIds.has(item.id)) return false;
    const holder = holderGroupByMachine.get(item.id);
    return auth.isWorkshopAdmin || hasGroupPermission(auth, item.ownerGroupId, "operator") || (holder ? hasGroupPermission(auth, holder, "operator") : false);
  });
  const reportableTools = toolRows.filter((tool) => tool.recordStatus === "active" && Number(tool.quantityOnHand) > 0 && (auth.isWorkshopAdmin || hasGroupPermission(auth, tool.groupId, "operator")));

  const targetLabel = (row: (typeof openRows)[number]) => {
    if (row.equipmentId) {
      const machine = equipmentMap.get(row.equipmentId);
      return machine ? `${machine.code} — ${machine.name}` : row.equipmentId;
    }
    const tool = row.toolId ? toolMap.get(row.toolId) : null;
    return tool ? `${tool.name}${tool.specification ? ` · ${tool.specification}` : ""}` : row.toolId || "—";
  };
  const quantityLabel = (row: (typeof openRows)[number]) => {
    if (row.equipmentId) return "1 máy";
    const tool = row.toolId ? toolMap.get(row.toolId) : null;
    return `${Number(row.quantity)}${tool ? ` ${tool.unit}` : ""}`;
  };

  const pending = openRows.length;
  const approved = closedRows.filter((row) => row.status === "completed").length;

  return (
    <div className={canCreate ? "has-ticket-fab" : undefined}>
      <PageHeader title="Báo mất" description="Báo mất máy có mã hoặc CCDC theo số lượng; Quản lý Xưởng duyệt thì máy chuyển Đã mất / CCDC được trừ tồn." />
      <section className="stat-grid compact">
        <StatCard title="Chờ Quản lý Xưởng duyệt" value={pending} icon={Clock3} tone="warning" />
        <StatCard title="Đã duyệt (gần đây)" value={approved} icon={CheckCircle2} tone="success" />
        <StatCard title="Máy đang ở trạng thái Đã mất" value={lostMachines.length} icon={SearchX} tone="danger" />
      </section>

      <TicketTableCard title="Chờ xử lý" count={openRows.length}>
        <DataTable
          headers={["Phiếu", "Máy / CCDC", "SL mất", "Nhóm quản lý", "Hoàn cảnh", "Trạng thái", "Thao tác"]}
          rows={openRows.map((row) => {
            const actions: React.ReactNode[] = [];
            if (auth.isWorkshopAdmin && !auth.isReadOnlyViewer) {
              actions.push(<form action={approveLossAction} key="approve"><input type="hidden" name="lossId" value={row.id} /><Button size="sm">Quản lý Xưởng duyệt</Button></form>);
              actions.push(<form action={rejectLossAction} key="reject" className="row-actions"><input type="hidden" name="lossId" value={row.id} /><input name="rejectionReason" placeholder="Lý do từ chối" aria-label="Lý do từ chối" className="field-inline-md" required /><Button size="sm" variant="danger">Từ chối</Button></form>);
            }
            if ((row.reportedBy === auth.userId || auth.isWorkshopAdmin) && !auth.isReadOnlyViewer) {
              actions.push(<form action={cancelLossAction} key="cancel"><input type="hidden" name="lossId" value={row.id} /><Button size="sm" variant="secondary">Hủy phiếu</Button></form>);
            }
            return [
              <strong key="code">{row.code}</strong>,
              targetLabel(row),
              quantityLabel(row),
              groupMap.get(row.ownerGroupId) || "—",
              row.circumstances,
              <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={workflowTone(row.status)} />,
              <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>,
            ];
          })}
          empty={<EmptyState description="Không có phiếu báo mất nào đang chờ duyệt." />}
        />
      </TicketTableCard>

      <TicketTableCard title="Đã hoàn thành" count={closedRows.length} tone="done">
        <DataTable
          headers={["Phiếu", "Máy / CCDC", "SL mất", "Nhóm quản lý", "Hoàn cảnh", "Trạng thái"]}
          rows={closedRows.map((row) => [
            <strong key="code">{row.code}</strong>,
            targetLabel(row),
            quantityLabel(row),
            groupMap.get(row.ownerGroupId) || "—",
            row.status === "rejected" && row.rejectionReason ? `${row.circumstances} — Từ chối: ${row.rejectionReason}` : row.circumstances,
            <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={workflowTone(row.status)} />,
          ])}
          empty={<EmptyState description="Chưa có phiếu báo mất nào hoàn thành." />}
        />
      </TicketTableCard>

      <TicketTableCard title="Máy đã mất" count={lostMachines.length} tone="done">
        <DataTable
          headers={["Mã hệ thống", "Máy", "Nhóm quản lý", "Thao tác"]}
          rows={lostMachines.map((machine) => [
            <Link key="code" href={`/equipment/${machine.id}`}><strong>{machine.code}</strong></Link>,
            machine.name,
            groupMap.get(machine.ownerGroupId) || "—",
            auth.isWorkshopAdmin && !auth.isReadOnlyViewer
              ? <form key="restore" action={restoreLostEquipmentAction} className="row-actions"><input type="hidden" name="equipmentId" value={machine.id} /><input name="reason" placeholder="Tìm thấy ở đâu / hoàn cảnh" aria-label="Hoàn cảnh tìm thấy" className="field-inline-lg" required minLength={5} /><Button size="sm" variant="secondary">Khôi phục (đã tìm thấy)</Button></form>
              : "—",
          ])}
          empty={<EmptyState description="Chưa có máy nào ở trạng thái Đã mất." />}
        />
      </TicketTableCard>

      {canCreate ? (
        <>
          <TicketDialog buttonLabel="Tạo phiếu báo mất" title="Báo mất máy có mã" submitLabel="Gửi báo mất" action={submitLoss} slot={1} submitDisabled={reportableMachines.length === 0}>
            {reportableMachines.length === 0 ? (
              <EmptyState title="Chưa có máy để báo mất" description="Máy phải thuộc nhóm bạn có quyền (Kỹ sư giám sát trở lên) hoặc đang được nhóm bạn mượn, không nằm trong phiếu điều chuyển / sửa chữa / thanh lý / báo mất đang mở." />
            ) : null}
            <FormField label="Máy bị mất" required><select name="equipmentId" disabled={reportableMachines.length === 0}>{reportableMachines.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></FormField>
            <FormField label="Hoàn cảnh mất" required hint="Mất khi nào, ở đâu, ai giữ lần cuối."><textarea name="circumstances" required minLength={5} placeholder="Ví dụ: Phát hiện mất sau ca đêm 12/11, lần cuối ở khu vực nghiền." /></FormField>
          </TicketDialog>
          <TicketDialog buttonLabel="Tạo báo mất CCDC số lượng" title="Báo mất CCDC theo số lượng" submitLabel="Gửi báo mất" action={submitToolLoss} slot={0} submitDisabled={reportableTools.length === 0}>
            {reportableTools.length === 0 ? (
              <EmptyState title="Chưa có CCDC để báo mất" description="Chỉ hiển thị CCDC theo số lượng còn tồn và thuộc nhóm bạn có quyền (Kỹ sư giám sát trở lên)." />
            ) : null}
            <FormField label="CCDC bị mất" required><select name="toolId" disabled={reportableTools.length === 0}>{reportableTools.map((t) => <option key={t.id} value={t.id}>{t.name}{t.specification ? ` · ${t.specification}` : ""} · còn {t.quantityOnHand} {t.unit}</option>)}</select></FormField>
            <FormField label="Số lượng mất" required><input name="quantity" type="number" min="0.01" step="0.01" required /></FormField>
            <FormField label="Hoàn cảnh mất" required><textarea name="circumstances" required minLength={5} placeholder="Ví dụ: Thiếu 3 cái sau kiểm kê, không rõ nơi để." /></FormField>
          </TicketDialog>
        </>
      ) : null}
    </div>
  );
}
