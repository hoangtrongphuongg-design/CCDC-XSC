import { and, asc, desc, eq } from "drizzle-orm";
import { CheckCircle2, Clock3, PackageCheck, Plus, Recycle } from "lucide-react";
import { db } from "@/lib/db";
import { disposals, equipment, groups, toolCatalog, toolDisposals } from "@/lib/db/schema";
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
  approveDisposalByWsAction,
  approveToolDisposalByWsAction,
  confirmDisposalByGroupAction,
  confirmToolDisposalByGroupAction,
  createDisposalAction,
  createToolDisposalAction,
  receiveDisposalWarehouseAction,
} from "@/actions/disposals";

export default async function DisposalsPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, rows, toolRows, toolDisposalRows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId }).from(equipment).where(and(eq(equipment.status, "wait_disposal"), eq(equipment.recordStatus, "active"))).orderBy(asc(equipment.code)),
    db.select().from(disposals).orderBy(desc(disposals.createdAt)).limit(100),
    db.select().from(toolCatalog).where(eq(toolCatalog.isActive, true)).orderBy(asc(toolCatalog.name)),
    db.select().from(toolDisposals).orderBy(desc(toolDisposals.createdAt)).limit(100),
  ]);
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

  return (
    <>
      <PageHeader title="Thanh lý" description="Kiểm soát đề xuất, phê duyệt và bàn giao Kho thanh lý; mã máy luôn được giữ trong lịch sử." />
      <section className="stat-grid">
        <StatCard title="Chờ nhóm xác nhận" value={pendingGroup} icon={Clock3} tone="warning" />
        <StatCard title="Chờ WS phê duyệt" value={pendingWs} icon={Recycle} tone="danger" />
        <StatCard title="Chờ nhập kho" value={waitingWarehouse} icon={PackageCheck} tone="violet" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>
      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Danh sách phiếu thanh lý</CardTitle><Recycle size={18} /></CardHeader>
          <CardContent>
            <DataTable headers={["Phiếu", "Máy", "Nhóm quản lý", "Lý do", "Trạng thái", "Thao tác"]} rows={rows.map((row) => {
              const actions = [] as React.ReactNode[];
              if (row.status === "pending_group" && hasGroupPermission(auth, row.ownerGroupId, "manager")) actions.push(<form action={confirmDisposalByGroupAction} key="group"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhóm xác nhận</Button></form>);
              if (row.status === "pending_ws" && auth.isWorkshopAdmin) actions.push(<form action={approveDisposalByWsAction} key="ws"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">WS duyệt</Button></form>);
              if (row.status === "wait_warehouse" && warehouse && hasGroupPermission(auth, warehouse.id, "operator")) actions.push(<form action={receiveDisposalWarehouseAction} key="warehouse"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhập kho</Button></form>);
              const machine = equipmentMap.get(row.equipmentId);
              return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.ownerGroupId) || "—", row.reason, <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={row.status === "completed" ? "success" : "warning"} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
            })} empty={<EmptyState description="Chưa có phiếu thanh lý." />} />
          </CardContent>
        </Card>
        <Card className="side-panel">
          <CardHeader><CardTitle>Đề xuất thanh lý</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {disposableEquipment.length ? <form action={createDisposalAction} className="form-grid">
              <FormField label="Máy không thể phục hồi" required><select name="equipmentId">{disposableEquipment.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></FormField>
              <FormField label="Tình trạng hư hỏng" required><textarea name="conditionSummary" placeholder="Mô tả tình trạng và kết luận kỹ thuật" /></FormField>
              <FormField label="Lý do đề xuất thanh lý" required><textarea name="reason" /></FormField>
              <Button type="submit">Tạo đề xuất</Button>
            </form> : <EmptyState title="Không có máy được phép đề xuất" description="Máy phải chờ thanh lý và tài khoản cần quyền Thao tác trong nhóm quản lý." />}
          </CardContent>
        </Card>
      </div>

      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Thanh lý CCDC theo số lượng</CardTitle><Recycle size={18} /></CardHeader>
          <CardContent>
            <DataTable
              headers={["Phiếu", "CCDC", "SL thanh lý", "Nhóm quản lý", "Lý do", "Trạng thái", "Thao tác"]}
              rows={toolDisposalRows.map((row) => {
                const actions: React.ReactNode[] = [];
                if (row.status === "pending_group" && hasGroupPermission(auth, row.ownerGroupId, "manager")) {
                  actions.push(<form action={confirmToolDisposalByGroupAction} key="group"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhóm xác nhận</Button></form>);
                }
                if (row.status === "pending_ws" && auth.isWorkshopAdmin) {
                  actions.push(<form action={approveToolDisposalByWsAction} key="ws"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">WS duyệt</Button></form>);
                }
                const tool = toolMap.get(row.toolId);
                return [
                  <strong key="code">{row.code}</strong>,
                  tool ? `${tool.name}${tool.specification ? ` · ${tool.specification}` : ""}` : row.toolId,
                  tool ? `${row.quantity} ${tool.unit}` : row.quantity,
                  groupMap.get(row.ownerGroupId) || "—",
                  row.reason,
                  <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={row.status === "completed" ? "success" : "warning"} />,
                  <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>,
                ];
              })}
              empty={<EmptyState description="Chưa có phiếu thanh lý CCDC theo số lượng." />}
            />
          </CardContent>
        </Card>

        <Card className="side-panel">
          <CardHeader><CardTitle>Đề xuất thanh lý CCDC nhỏ lẻ</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {disposableTools.length ? (
              <form action={createToolDisposalAction} className="form-grid">
                <FormField label="CCDC" required>
                  <select name="toolId">
                    {disposableTools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}{tool.specification ? ` · ${tool.specification}` : ""} · còn {tool.quantityOnHand} {tool.unit}</option>)}
                  </select>
                </FormField>
                <FormField label="Số lượng đề xuất thanh lý" required><input name="quantity" type="number" min="0.01" step="0.01" required /></FormField>
                <FormField label="Tình trạng / ghi chú kỹ thuật"><textarea name="conditionSummary" placeholder="Ví dụ: hư hỏng, mòn, không còn sử dụng..." /></FormField>
                <FormField label="Lý do đề xuất thanh lý" required><textarea name="reason" required /></FormField>
                <Button type="submit">Tạo đề xuất</Button>
              </form>
            ) : <EmptyState title="Không có CCDC phù hợp" description="Chỉ hiển thị CCDC theo số lượng còn tồn và thuộc nhóm bạn có quyền thao tác." />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
