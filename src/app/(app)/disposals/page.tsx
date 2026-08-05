import { asc, desc, eq } from "drizzle-orm";
import { Plus, Recycle } from "lucide-react";
import { db } from "@/lib/db";
import { disposals, equipment, groups } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { approveDisposalByWsAction, confirmDisposalByGroupAction, createDisposalAction, receiveDisposalWarehouseAction } from "@/actions/disposals";

export default async function DisposalsPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, rows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId }).from(equipment).where(eq(equipment.status, "wait_disposal")).orderBy(asc(equipment.code)),
    db.select().from(disposals).orderBy(desc(disposals.createdAt)).limit(100),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map((await db.select({ id: equipment.id, code: equipment.code, name: equipment.name }).from(equipment)).map((e) => [e.id, e]));
  const warehouse = groupRows.find((g) => g.code === "KHO_TL");
  return (
    <>
      <PageHeader title="Thanh lý" description="Đề xuất, duyệt và nhập Kho thanh lý. Mã máy vẫn được giữ nguyên trong lịch sử." />
      <div className="content-grid">
        <Card>
          <CardHeader><CardTitle>Phiếu thanh lý</CardTitle><Recycle size={18} /></CardHeader>
          <CardContent>
            <DataTable headers={["Phiếu", "Máy", "Nhóm quản lý", "Lý do", "Trạng thái", "Thao tác"]} rows={rows.map((row) => {
              const actions = [] as React.ReactNode[];
              if (row.status === "pending_group" && hasGroupPermission(auth, row.ownerGroupId, "manager")) actions.push(<form action={confirmDisposalByGroupAction} key="group"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhóm xác nhận</Button></form>);
              if (row.status === "pending_ws" && auth.isWsManager) actions.push(<form action={approveDisposalByWsAction} key="ws"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">WS duyệt</Button></form>);
              if (row.status === "wait_warehouse" && warehouse && hasGroupPermission(auth, warehouse.id, "operator")) actions.push(<form action={receiveDisposalWarehouseAction} key="warehouse"><input type="hidden" name="disposalId" value={row.id} /><Button size="sm">Nhập kho</Button></form>);
              const machine = equipmentMap.get(row.equipmentId);
              return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.ownerGroupId) || "—", row.reason, <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={row.status === "completed" ? "success" : "warning"} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
            })} empty={<EmptyState description="Chưa có phiếu thanh lý." />} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Đề xuất thanh lý</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {equipmentRows.length ? <form action={createDisposalAction} className="form-grid">
              <FormField label="Máy không thể phục hồi" required><select name="equipmentId">{equipmentRows.filter((e) => hasGroupPermission(auth, e.ownerGroupId, "operator")).map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></FormField>
              <FormField label="Tình trạng hư hỏng" required><textarea name="conditionSummary" /></FormField>
              <FormField label="Lý do đề xuất thanh lý" required><textarea name="reason" /></FormField>
              <Button type="submit">Tạo đề xuất</Button>
            </form> : <EmptyState title="Chưa có máy chờ thanh lý" description="Máy phải có kết luận không thể phục hồi trước khi tạo phiếu." />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
