import { asc, desc, eq } from "drizzle-orm";
import { Plus, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, repairs } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { formatNumber } from "@/lib/utils";
import { acceptRepairAction, completeRepairAction, confirmRepairByOwnerAction, createRepairAction } from "@/actions/repairs";

export default async function RepairsPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, rows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId, currentGroupId: equipment.currentGroupId }).from(equipment).orderBy(asc(equipment.code)),
    db.select().from(repairs).orderBy(desc(repairs.createdAt)).limit(100),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map(equipmentRows.map((e) => [e.id, e]));
  const actingGroups = auth.permissions.filter((p) => p.groupCode !== "KHO_TL");
  return (
    <>
      <PageHeader title="Sửa chữa" description="Báo hư, tiếp nhận, sửa chữa và xác nhận hoàn thành theo từng mã máy." />
      <div className="content-grid">
        <Card>
          <CardHeader><CardTitle>Phiếu sửa chữa</CardTitle><Wrench size={18} /></CardHeader>
          <CardContent>
            <DataTable headers={["Phiếu", "Máy", "Nhóm báo", "Nội dung hư", "Chi phí", "Trạng thái", "Thao tác"]} rows={rows.map((row) => {
              const machine = equipmentMap.get(row.equipmentId);
              const actions = [] as React.ReactNode[];
              if (row.status === "pending_acceptance" && auth.isWsManager) actions.push(<form action={acceptRepairAction} key="accept"><input type="hidden" name="repairId" value={row.id} /><Button size="sm">Tiếp nhận</Button></form>);
              if (row.status === "repairing" && auth.isWsManager) actions.push(<form action={completeRepairAction} key="done" className="row-actions"><input type="hidden" name="repairId" value={row.id} /><select name="result" aria-label="Kết quả" style={{ width: 140 }}><option value="completed">Sửa đạt</option><option value="irreparable">Không phục hồi</option></select><input name="cost" type="number" min="0" step="1000" defaultValue="0" aria-label="Chi phí" style={{ width: 100 }} /><input name="workDescription" placeholder="Nội dung sửa" aria-label="Nội dung sửa" style={{ width: 130 }} /><input name="resultNotes" placeholder="Kết quả thử" aria-label="Kết quả thử" style={{ width: 130 }} /><Button size="sm">Hoàn tất sửa</Button></form>);
              if (row.status === "wait_owner_confirm" && machine && hasGroupPermission(auth, machine.ownerGroupId, "manager")) actions.push(<form action={confirmRepairByOwnerAction} key="confirm"><input type="hidden" name="repairId" value={row.id} /><Button size="sm">Nhận lại</Button></form>);
              return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.reportedByGroupId) || "—", row.issueDescription, <span key="cost" className="numeric">{formatNumber(row.cost)}</span>, <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={row.status === "completed" ? "success" : row.status === "irreparable" ? "danger" : "info"} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
            })} empty={<EmptyState description="Chưa có phiếu sửa chữa." />} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Báo hư / yêu cầu sửa</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {actingGroups.length ? <form action={createRepairAction} className="form-grid">
              <FormField label="Nhóm báo hư" required><select name="reportingGroupId">{actingGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
              <FormField label="Máy" required><select name="equipmentId">{equipmentRows.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></FormField>
              <FormField label="Hiện tượng hư" required><textarea name="issueDescription" placeholder="Ghi hiện tượng thực tế, không chỉ ghi 'máy hư'." /></FormField>
              <Button type="submit">Tạo phiếu sửa</Button>
            </form> : <EmptyState title="Chỉ xem" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
