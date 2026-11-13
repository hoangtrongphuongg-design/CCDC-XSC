import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { CheckCircle2, Clock3, PackageCheck, Recycle } from "lucide-react";
import { db } from "@/lib/db";
import { disposals, equipment, groups, toolCatalog, toolDisposals } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TicketDialog } from "@/components/ticket-dialog";
import { TicketTableCard } from "@/components/ticket-table-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { workflowTone } from "@/lib/status-style";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  approveDisposalByWsAction,
  approveToolDisposalByWsAction,
  confirmDisposalByGroupAction,
  confirmToolDisposalByGroupAction,
  receiveDisposalWarehouseAction,
} from "@/actions/disposals";
import { submitDisposal, submitToolDisposal } from "@/actions/ticket-forms";
import { CLOSED_DISPOSAL_STATUSES, OPEN_DISPOSAL_STATUSES, RECENT_CLOSED_LIMIT } from "@/lib/workflow-status";

export default async function DisposalsPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, openRows, closedRows, toolRows, openToolDisposalRows, closedToolDisposalRows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId }).from(equipment).where(and(
      // Khớp điều kiện của createDisposalAction: máy đã kết luận không thể phục hồi
      // (tình trạng Thanh lý, kể cả máy vừa trả về ở trạng thái Chờ kiểm tra) hoặc đang chờ thanh lý.
      or(eq(equipment.status, "wait_disposal"), eq(equipment.condition, "irreparable")),
      inArray(equipment.status, ["in_use_owner", "wait_inspection", "wait_disposal"]),
      eq(equipment.recordStatus, "active"),
    )).orderBy(asc(equipment.code)),
    // Phiếu đang mở luôn tải đủ; phiếu đã đóng chỉ lấy gần nhất.
    db.select().from(disposals).where(inArray(disposals.status, [...OPEN_DISPOSAL_STATUSES])).orderBy(desc(disposals.createdAt)),
    db.select().from(disposals).where(inArray(disposals.status, [...CLOSED_DISPOSAL_STATUSES])).orderBy(desc(disposals.createdAt)).limit(RECENT_CLOSED_LIMIT),
    db.select().from(toolCatalog).where(eq(toolCatalog.isActive, true)).orderBy(asc(toolCatalog.name)),
    db.select().from(toolDisposals).where(inArray(toolDisposals.status, [...OPEN_DISPOSAL_STATUSES])).orderBy(desc(toolDisposals.createdAt)),
    db.select().from(toolDisposals).where(inArray(toolDisposals.status, [...CLOSED_DISPOSAL_STATUSES])).orderBy(desc(toolDisposals.createdAt)).limit(RECENT_CLOSED_LIMIT),
  ]);
  const rows = [...openRows, ...closedRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const toolDisposalRows = [...openToolDisposalRows, ...closedToolDisposalRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map((await db.select({ id: equipment.id, code: equipment.code, name: equipment.name }).from(equipment)).map((e) => [e.id, e]));
  const warehouse = groupRows.find((g) => g.code === "KHO_TL");
  const pendingGroup = rows.filter((row) => row.status === "pending_group").length;
  const pendingWs = rows.filter((row) => row.status === "pending_ws").length;
  const waitingWarehouse = rows.filter((row) => row.status === "wait_warehouse").length;
  const completed = rows.filter((row) => row.status === "completed").length;
  const disposableEquipment = equipmentRows.filter((item) => hasGroupPermission(auth, item.ownerGroupId, "operator"));
  const disposableTools = toolRows.filter((item) => Number(item.quantityOnHand) > 0 && hasGroupPermission(auth, item.groupId, "operator"));
  const toolMap = new Map(toolRows.map((item) => [item.id, item]));

  const canCreateDisposal = disposableEquipment.length > 0 && !auth.isReadOnlyViewer;
  const canCreateToolDisposal = disposableTools.length > 0 && !auth.isReadOnlyViewer;

  return (
    <div className={canCreateDisposal || canCreateToolDisposal ? "has-ticket-fab" : undefined}>
      <PageHeader title="Thanh lý" description="Kiểm soát đề xuất, phê duyệt và bàn giao Kho thanh lý; mã máy luôn được giữ trong lịch sử." />
      <section className="stat-grid compact">
        <StatCard title="Chờ nhóm xác nhận" value={pendingGroup} icon={Clock3} tone="warning" />
        <StatCard title="Chờ Quản lý Xưởng duyệt" value={pendingWs} icon={Recycle} tone="danger" />
        <StatCard title="Chờ nhập kho" value={waitingWarehouse} icon={PackageCheck} tone="violet" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>
      <TicketTableCard title="Thanh lý máy — chờ xử lý" count={openRows.length}>
        <DataTable headers={["Phiếu", "Máy", "Nhóm quản lý", "Lý do", "Trạng thái", "Thao tác"]} rows={openRows.map((row) => {
              const actions = [] as React.ReactNode[];
              if (row.status === "pending_group" && hasGroupPermission(auth, row.ownerGroupId, "manager")) actions.push(<form action={confirmDisposalByGroupAction} key="group"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhóm xác nhận</Button></form>);
              if (row.status === "pending_ws" && auth.isWorkshopAdmin) actions.push(<form action={approveDisposalByWsAction} key="ws"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Quản lý Xưởng duyệt</Button></form>);
              if (row.status === "wait_warehouse" && warehouse && hasGroupPermission(auth, warehouse.id, "operator")) actions.push(<form action={receiveDisposalWarehouseAction} key="warehouse"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhập kho</Button></form>);
              const machine = equipmentMap.get(row.equipmentId);
              return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.ownerGroupId) || "—", row.reason, <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={workflowTone(row.status)} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
            })} empty={<EmptyState description="Không có phiếu thanh lý máy nào đang chờ xử lý." />} />
      </TicketTableCard>

      <TicketTableCard title="Thanh lý máy — đã hoàn thành" count={closedRows.length} tone="done">
        <DataTable
          headers={["Phiếu", "Máy", "Nhóm quản lý", "Lý do", "Trạng thái"]}
          rows={closedRows.map((row) => {
            const machine = equipmentMap.get(row.equipmentId);
            return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.ownerGroupId) || "—", row.reason, <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={workflowTone(row.status)} />];
          })}
          empty={<EmptyState description="Chưa có phiếu thanh lý máy nào hoàn thành." />}
        />
      </TicketTableCard>

      <TicketTableCard title="Thanh lý CCDC theo số lượng — chờ xử lý" count={openToolDisposalRows.length}>
        <DataTable
          headers={["Phiếu", "CCDC", "SL thanh lý", "Nhóm quản lý", "Lý do", "Trạng thái", "Thao tác"]}
          rows={openToolDisposalRows.map((row) => {
                const actions: React.ReactNode[] = [];
                if (row.status === "pending_group" && hasGroupPermission(auth, row.ownerGroupId, "manager")) {
                  actions.push(<form action={confirmToolDisposalByGroupAction} key="group"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhóm xác nhận</Button></form>);
                }
                if (row.status === "pending_ws" && auth.isWorkshopAdmin) {
                  actions.push(<form action={approveToolDisposalByWsAction} key="ws"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Quản lý Xưởng duyệt</Button></form>);
                }
                const tool = toolMap.get(row.toolId);
                return [
                  <strong key="code">{row.code}</strong>,
                  tool ? `${tool.name}${tool.specification ? ` · ${tool.specification}` : ""}` : row.toolId,
                  tool ? `${row.quantity} ${tool.unit}` : row.quantity,
                  groupMap.get(row.ownerGroupId) || "—",
                  row.reason,
                  <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={workflowTone(row.status)} />,
                  <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>,
                ];
          })}
          empty={<EmptyState description="Không có phiếu thanh lý CCDC nào đang chờ xử lý." />}
        />
      </TicketTableCard>

      <TicketTableCard title="Thanh lý CCDC theo số lượng — đã hoàn thành" count={closedToolDisposalRows.length} tone="done">
        <DataTable
          headers={["Phiếu", "CCDC", "SL thanh lý", "Nhóm quản lý", "Lý do", "Trạng thái"]}
          rows={closedToolDisposalRows.map((row) => {
            const tool = toolMap.get(row.toolId);
            return [
              <strong key="code">{row.code}</strong>,
              tool ? `${tool.name}${tool.specification ? ` · ${tool.specification}` : ""}` : row.toolId,
              tool ? `${row.quantity} ${tool.unit}` : row.quantity,
              groupMap.get(row.ownerGroupId) || "—",
              row.reason,
              <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={workflowTone(row.status)} />,
            ];
          })}
          empty={<EmptyState description="Chưa có phiếu thanh lý CCDC nào hoàn thành." />}
        />
      </TicketTableCard>

      {canCreateDisposal ? (
        <TicketDialog buttonLabel="Tạo phiếu thanh lý" title="Đề xuất thanh lý máy" submitLabel="Tạo đề xuất" action={submitDisposal} slot={canCreateToolDisposal ? 1 : 0}>
          <FormField label="Máy không thể phục hồi" required><select name="equipmentId">{disposableEquipment.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></FormField>
              <FormField label="Tình trạng hư hỏng" required><textarea name="conditionSummary" placeholder="Mô tả tình trạng và kết luận kỹ thuật" /></FormField>
              <FormField label="Lý do đề xuất thanh lý" required><textarea name="reason" /></FormField>
        </TicketDialog>
      ) : null}
      {canCreateToolDisposal ? (
        <TicketDialog buttonLabel="Tạo thanh lý CCDC số lượng" title="Đề xuất thanh lý CCDC nhỏ lẻ" submitLabel="Tạo đề xuất" action={submitToolDisposal} slot={0}>
          <FormField label="CCDC" required>
                  <select name="toolId">
                    {disposableTools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}{tool.specification ? ` · ${tool.specification}` : ""} · còn {tool.quantityOnHand} {tool.unit}</option>)}
                  </select>
                </FormField>
                <FormField label="Số lượng đề xuất thanh lý" required><input name="quantity" type="number" min="0.01" step="0.01" required /></FormField>
                <FormField label="Tình trạng / ghi chú kỹ thuật"><textarea name="conditionSummary" placeholder="Ví dụ: hư hỏng, mòn, không còn sử dụng..." /></FormField>
                <FormField label="Lý do đề xuất thanh lý" required><textarea name="reason" required /></FormField>
        </TicketDialog>
      ) : null}
    </div>
  );
}
