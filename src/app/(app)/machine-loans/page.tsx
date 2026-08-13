import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2, Clock3, Handshake, Plus, RotateCcw, ShieldCheck } from "lucide-react";
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
import { formatDate } from "@/lib/utils";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import {
  approveMachineLoanAction,
  confirmMachineReturnAction,
  createMachineLoanAction,
  rejectMachineLoanAction,
  requestMachineReturnAction,
} from "@/actions/machine-loans";

function tone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "rejected" || status === "incident") return "danger" as const;
  if (status === "pending_owner" || status === "return_requested") return "warning" as const;
  return "info" as const;
}

export const dynamic = "force-dynamic";

export default async function MachineLoansPage() {
  const auth = await requireUser();
  const [groupRows, availableEquipmentRows, allEquipment, loans, openLoanRows, openTransfers, openRepairs, openDisposals] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem })
      .from(groups)
      .where(eq(groups.isActive, true))
      .orderBy(asc(groups.name)),
    db.select({
        id: equipment.id, code: equipment.code, legacyCode: equipment.legacyCode, name: equipment.name,
        model: equipment.model, equipmentType: equipment.equipmentType, ownerGroupId: equipment.ownerGroupId,
        condition: equipment.condition,
      })
      .from(equipment)
      .where(and(eq(equipment.status, "in_use_owner"), eq(equipment.condition, "good"), eq(equipment.recordStatus, "active")))
      .orderBy(asc(equipment.code)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name })
      .from(equipment),
    db.select().from(machineLoans).orderBy(desc(machineLoans.createdAt)).limit(100),
    db.select({ equipmentId: machineLoans.equipmentId }).from(machineLoans).where(inArray(machineLoans.status, ["pending_owner", "approved", "wait_handover", "on_loan", "return_requested", "incident"])),
    db.select({ equipmentId: transfers.equipmentId }).from(transfers).where(inArray(transfers.status, ["pending_source", "pending_target", "pending_ws", "wait_handover"])),
    db.select({ equipmentId: repairs.equipmentId }).from(repairs).where(inArray(repairs.status, ["pending_acceptance", "repairing", "wait_owner_confirm"])),
    db.select({ equipmentId: disposals.equipmentId }).from(disposals).where(inArray(disposals.status, ["pending_group", "pending_ws", "wait_warehouse"])),
  ]);

  const blockedEquipmentIds = new Set([...openLoanRows, ...openTransfers, ...openRepairs, ...openDisposals].map((row) => row.equipmentId));
  const availableEquipment = availableEquipmentRows.filter((item) => !blockedEquipmentIds.has(item.id));

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const equipmentMap = new Map(allEquipment.map((item) => [item.id, item]));
  const borrowerGroups = auth.permissions.filter(
    (permission) => permission.groupCode !== "KHO_TL" && isOfficialOperationalGroupCode(permission.groupCode),
  );

  const pending = loans.filter((row) => row.status === "pending_owner").length;
  const onLoan = loans.filter((row) => row.status === "on_loan").length;
  const waitingReturn = loans.filter((row) => row.status === "return_requested").length;
  const completed = loans.filter((row) => row.status === "completed").length;

  return (
    <div className="loan-mobile-page machine-loans-page">
      <div className="loan-mobile-switch" aria-label="Chọn kiểu mượn">
        <span className="is-active">Máy có mã</span>
        <a href="/quick-loans">CCDC lặt vặt</a>
      </div>
      <PageHeader
        title="Mượn máy"
        description="Luồng rút gọn: tạo đề nghị → nhóm cho mượn duyệt (đồng thời bàn giao) → đang mượn → gửi trả → nhóm chủ máy xác nhận nhận lại."
      />

      <section className="stat-grid">
        <StatCard title="Chờ xử lý" value={pending} icon={Clock3} tone="warning" />
        <StatCard title="Đang mượn" value={onLoan} icon={Handshake} tone="cyan" />
        <StatCard title="Chờ nhận lại" value={waitingReturn} icon={RotateCcw} tone="violet" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>

      <section className="mobile-loan-action-inbox" aria-label="Việc cần xử lý">
        <div className="mobile-loan-section-title">
          <strong>Việc cần xử lý</strong>
          <span>{loans.filter((loan) =>
            (loan.status === "pending_owner" && hasGroupPermission(auth, loan.ownerGroupId, "operator")) ||
            (loan.status === "return_requested" && hasGroupPermission(auth, loan.ownerGroupId, "operator"))
          ).length}</span>
        </div>
        {loans.filter((loan) =>
          (loan.status === "pending_owner" && hasGroupPermission(auth, loan.ownerGroupId, "operator")) ||
          (loan.status === "return_requested" && hasGroupPermission(auth, loan.ownerGroupId, "operator"))
        ).slice(0, 6).map((loan) => {
          const machine = equipmentMap.get(loan.equipmentId);
          const ownerName = groupMap.get(loan.ownerGroupId) || "—";
          const borrowerName = groupMap.get(loan.borrowerGroupId) || "—";
          return (
            <article className="mobile-loan-action-card" key={`action-${loan.id}`}>
              <div className="mobile-loan-action-copy">
                <strong>{machine?.name || "Máy/CCDC"}</strong>
                <span>{machine?.code || loan.code} · {ownerName} → {borrowerName}</span>
                <small>{loan.status === "pending_owner" ? `Mượn đến ${formatDate(loan.expectedReturnDate)}` : "Nhóm mượn đã gửi trả"}</small>
              </div>
              {loan.status === "pending_owner" ? (
                <div className="mobile-loan-action-buttons">
                  <form action={rejectMachineLoanAction}>
                    <input type="hidden" name="loanId" value={loan.id} />
                    <Button size="sm" variant="secondary">Từ chối</Button>
                  </form>
                  <form action={approveMachineLoanAction}>
                    <input type="hidden" name="loanId" value={loan.id} />
                    <Button size="sm">Duyệt</Button>
                  </form>
                </div>
              ) : (
                <form action={confirmMachineReturnAction} className="mobile-return-confirm-form">
                  <input type="hidden" name="loanId" value={loan.id} />
                  <select name="condition" aria-label="Tình trạng khi nhận lại" defaultValue="good">
                    <option value="good">Bình thường</option>
                    <option value="limited">Hạn chế</option>
                    <option value="minor_damage">Hư nhẹ</option>
                    <option value="major_damage">Hư nặng</option>
                  </select>
                  <Button size="sm">Nhận lại</Button>
                </form>
              )}
            </article>
          );
        })}
      </section>

      <div className="mobile-loan-return-list" id="mobile-active-loans">
        <div className="mobile-loan-section-title"><strong>Đang mượn / chờ trả</strong><span>{loans.filter((row) => ["on_loan", "return_requested"].includes(row.status)).length}</span></div>
        {loans.filter((row) => ["on_loan", "return_requested"].includes(row.status)).slice(0, 6).map((loan) => {
          const machine = equipmentMap.get(loan.equipmentId);
          const canReport = loan.status === "on_loan" && hasGroupPermission(auth, loan.borrowerGroupId, "viewer");
          const canReceive = loan.status === "return_requested" && hasGroupPermission(auth, loan.ownerGroupId, "operator");
          return (
            <div className="mobile-loan-return-item" key={loan.id}>
              <div><strong>{machine?.name || "Máy/CCDC"}</strong><span>{machine?.code || loan.code} · {groupMap.get(loan.ownerGroupId) || "—"}</span></div>
              {canReport ? <form action={requestMachineReturnAction}><input type="hidden" name="loanId" value={loan.id} /><Button size="sm" variant="secondary">Trả</Button></form> : null}
              {canReceive ? <form action={confirmMachineReturnAction} className="mobile-inline-confirm"><input type="hidden" name="loanId" value={loan.id} /><input type="hidden" name="condition" value="good" /><Button size="sm">Nhận lại</Button></form> : null}
            </div>
          );
        })}
      </div>

      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Danh sách phiếu mượn máy</CardTitle><Handshake size={18} /></CardHeader>
          <CardContent>
            <DataTable
              headers={["Phiếu", "Máy", "Nhóm cho", "Nhóm mượn", "Hạn trả", "Trạng thái", "Thao tác"]}
              rows={loans.map((loan) => {
                const actions: React.ReactNode[] = [];

                if (loan.status === "pending_owner" && hasGroupPermission(auth, loan.ownerGroupId, "operator")) {
                  actions.push(
                    <form action={approveMachineLoanAction} key="approve" className="row-actions">
                      <input type="hidden" name="loanId" value={loan.id} />
                      <input name="handoverCondition" placeholder="Tình trạng khi giao (nếu cần)" aria-label="Tình trạng khi giao" className="field-inline-lg" />
                      <Button size="sm"><ShieldCheck size={14} /> Duyệt & bàn giao</Button>
                    </form>,
                    <form action={rejectMachineLoanAction} key="reject" className="row-actions">
                      <input type="hidden" name="loanId" value={loan.id} />
                      <input name="rejectionReason" placeholder="Lý do từ chối (nếu cần)" aria-label="Lý do từ chối" className="field-inline-lg" />
                      <Button size="sm" variant="danger">Từ chối</Button>
                    </form>,
                  );
                }


                if (loan.status === "on_loan" && hasGroupPermission(auth, loan.borrowerGroupId, "viewer")) {
                  actions.push(
                    <form action={requestMachineReturnAction} key="return">
                      <input type="hidden" name="loanId" value={loan.id} />
                      <Button size="sm" variant="secondary">Báo trả</Button>
                    </form>,
                  );
                }

                if (loan.status === "return_requested" && hasGroupPermission(auth, loan.ownerGroupId, "operator")) {
                  actions.push(
                    <form action={confirmMachineReturnAction} key="close" className="row-actions">
                      <input type="hidden" name="loanId" value={loan.id} />
                      <select name="condition" aria-label="Tình trạng kỹ thuật" className="field-inline-md">
                        <option value="good">Tốt</option>
                        <option value="limited">Hạn chế</option>
                        <option value="minor_damage">Hư nhẹ</option>
                        <option value="major_damage">Hư nặng</option>
                        <option value="awaiting_assessment">Chờ đánh giá</option>
                      </select>
                      <input name="returnCondition" placeholder="Ghi chú khi nhận lại" aria-label="Ghi chú khi nhận lại" className="field-inline-lg" />
                      <Button size="sm">Nhận lại</Button>
                    </form>,
                  );
                }

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

        <Card className="side-panel">
          <CardHeader><CardTitle>Tạo đề nghị mượn</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {borrowerGroups.length ? (
              <form action={createMachineLoanAction} className="form-grid">
                <FormField label="Nhóm mượn" required hint="Mọi thành viên nghiệp vụ của nhóm đều được lập đề nghị.">
                  <select name="borrowerGroupId" id="machine-loan-borrower-group">
                    {borrowerGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}
                  </select>
                </FormField>
                <FormField label="Máy cần mượn" required hint="Chỉ hiển thị máy đang Sẵn sàng và tình trạng Tốt. Gõ mã, tên máy, model hoặc nhóm để tìm nhanh.">
                  <SearchableSelect
                    name="equipmentId"
                    required
                    controllerId="machine-loan-borrower-group"
                    excludeControllerValue
                    placeholder="Tìm máy đang sẵn sàng..."
                    searchPlaceholder="Gõ mã, tên máy, model, loại, nhóm..."
                    emptyText="Không có máy sẵn sàng phù hợp."
                    options={availableEquipment.map((item) => ({
                      value: item.id,
                      groupId: item.ownerGroupId,
                      label: `${item.code} — ${item.name}`,
                      description: [item.legacyCode, item.model, item.equipmentType, groupMap.get(item.ownerGroupId)].filter(Boolean).join(" · "),
                    }))}
                  />
                </FormField>
                <FormField label="Mục đích sử dụng" required><textarea name="purpose" placeholder="Nêu rõ công việc hoặc khu vực sử dụng" /></FormField>
                <FormField label="Vị trí sử dụng"><input name="workLocation" placeholder="Ví dụ: Khu vực nghiền" /></FormField>
                <FormField label="Người nhận"><input name="receiverName" defaultValue={auth.fullName} /></FormField>
                <FormField label="Ngày dự kiến trả" required><input name="expectedReturnDate" type="date" /></FormField>
                <Button type="submit">Gửi đề nghị mượn</Button>
              </form>
            ) : (
              <EmptyState title="Chưa được gán nhóm" description="Tài khoản cần thuộc ít nhất một nhóm nghiệp vụ để lập đề nghị." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
