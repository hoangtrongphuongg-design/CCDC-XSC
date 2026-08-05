import { asc, desc, eq, inArray } from "drizzle-orm";
import { Handshake, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { formatDate } from "@/lib/utils";
import {
  approveMachineLoanAction,
  confirmLoanHandoverAction,
  confirmLoanReceiptAction,
  confirmMachineReturnAction,
  createMachineLoanAction,
  requestMachineReturnAction,
} from "@/actions/machine-loans";

function tone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "rejected" || status === "incident") return "danger" as const;
  if (status === "pending_owner" || status === "return_requested") return "warning" as const;
  return "info" as const;
}

export default async function MachineLoansPage() {
  const auth = await requireUser();
  const [groupRows, equipmentRows, loans] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId }).from(equipment).where(eq(equipment.status, "in_use_owner")).orderBy(asc(equipment.code)),
    db.select().from(machineLoans).orderBy(desc(machineLoans.createdAt)).limit(100),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map((await db.select({ id: equipment.id, code: equipment.code, name: equipment.name }).from(equipment)).map((e) => [e.id, e]));
  const actingGroups = auth.permissions.filter((p) => p.groupCode !== "KHO_TL");

  return (
    <>
      <PageHeader title="Mượn máy" description="Mượn tạm thời máy có mã; nhóm quản lý không thay đổi." />
      <div className="content-grid">
        <Card>
          <CardHeader><CardTitle>Phiếu mượn máy</CardTitle><Handshake size={18} /></CardHeader>
          <CardContent>
            <DataTable
              headers={["Phiếu", "Máy", "Nhóm cho", "Nhóm mượn", "Hạn trả", "Trạng thái", "Thao tác"]}
              rows={loans.map((loan) => {
                const actions = [] as React.ReactNode[];
                if (loan.status === "pending_owner" && hasGroupPermission(auth, loan.ownerGroupId, "manager")) actions.push(
                  <form action={approveMachineLoanAction} key="approve" className="row-actions"><input type="hidden" name="loanId" value={loan.id} /><input name="handoverCondition" placeholder="Tình trạng khi giao" aria-label="Tình trạng khi giao" style={{ width: 150 }} /><Button size="sm">Duyệt</Button></form>,
                );
                if (loan.status === "wait_handover" && !loan.handedOverAt && hasGroupPermission(auth, loan.ownerGroupId, "manager")) actions.push(
                  <form action={confirmLoanHandoverAction} key="handover"><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Đã giao</Button></form>,
                );
                if (loan.status === "wait_handover" && loan.handedOverAt && hasGroupPermission(auth, loan.borrowerGroupId, "operator")) actions.push(
                  <form action={confirmLoanReceiptAction} key="receipt"><input type="hidden" name="loanId" value={loan.id} /><Button size="sm">Đã nhận</Button></form>,
                );
                if (loan.status === "on_loan" && hasGroupPermission(auth, loan.borrowerGroupId, "operator")) actions.push(
                  <form action={requestMachineReturnAction} key="return"><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Báo trả</Button></form>,
                );
                if (loan.status === "return_requested" && hasGroupPermission(auth, loan.ownerGroupId, "manager")) actions.push(
                  <form action={confirmMachineReturnAction} key="close" className="row-actions"><input type="hidden" name="loanId" value={loan.id} /><select name="condition" aria-label="Tình trạng kỹ thuật" style={{ width: 135 }}><option value="good">Tốt</option><option value="limited">Hạn chế</option><option value="minor_damage">Hư nhẹ</option><option value="major_damage">Hư nặng</option></select><input name="returnCondition" placeholder="Ghi chú khi trả" aria-label="Ghi chú khi trả" style={{ width: 150 }} /><Button size="sm">Nhận lại</Button></form>,
                );
                const machine = equipmentMap.get(loan.equipmentId);
                return [
                  <strong key="code">{loan.code}</strong>,
                  machine ? `${machine.code} — ${machine.name}` : loan.equipmentId,
                  groupMap.get(loan.ownerGroupId) || "—",
                  groupMap.get(loan.borrowerGroupId) || "—",
                  formatDate(loan.expectedReturnDate),
                  <StatusBadge key="status" label={WORKFLOW_LABELS[loan.status] || loan.status} tone={tone(loan.status)} />,
                  <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>,
                ];
              })}
              empty={<EmptyState description="Chưa có phiếu mượn máy." />}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tạo đề xuất mượn</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {actingGroups.length ? (
              <form action={createMachineLoanAction} className="form-grid">
                <FormField label="Nhóm mượn" required><select name="borrowerGroupId">{actingGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
                <FormField label="Máy cần mượn" required><select name="equipmentId">{equipmentRows.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name} ({groupMap.get(e.ownerGroupId)})</option>)}</select></FormField>
                <FormField label="Mục đích sử dụng" required><textarea name="purpose" /></FormField>
                <FormField label="Vị trí sử dụng"><input name="workLocation" /></FormField>
                <FormField label="Người nhận"><input name="receiverName" /></FormField>
                <FormField label="Ngày dự kiến trả" required><input name="expectedReturnDate" type="date" /></FormField>
                <Button type="submit">Gửi đề xuất</Button>
              </form>
            ) : <EmptyState title="Chỉ xem" description="Tài khoản chưa có quyền thao tác tại nhóm nào." />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
