import { asc, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2, Clock3, FileSpreadsheet, ShieldAlert, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, repairs } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { repairStatusLabel } from "@/lib/repair-display";
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
import { formatNumber } from "@/lib/utils";
import { acceptRepairAction, completeRepairAction, confirmRepairByOwnerAction, markRepairIrreparableAction, receiveIrreparableByOwnerAction, sendExternalRepairAction, updateRepairCostAction } from "@/actions/repairs";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { submitRepair } from "@/actions/ticket-forms";
import { CLOSED_REPAIR_STATUSES, OPEN_REPAIR_STATUSES, RECENT_CLOSED_LIMIT } from "@/lib/workflow-status";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RepairsPage({ searchParams }: { searchParams?: SearchParams }) {
  const auth = await requireUser();
  const params = searchParams ? await searchParams : {};
  const modeValue = params.mode;
  const mobileMode = (Array.isArray(modeValue) ? modeValue[0] : modeValue) || "view";
  const [groupRows, equipmentRows, openRows, closedRows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: equipment.id, code: equipment.code, name: equipment.name, ownerGroupId: equipment.ownerGroupId, currentGroupId: equipment.currentGroupId }).from(equipment).where(eq(equipment.recordStatus, "active")).orderBy(asc(equipment.code)),
    // Phiếu đang mở luôn tải đủ; phiếu đã đóng chỉ lấy gần nhất.
    db.select().from(repairs).where(inArray(repairs.status, [...OPEN_REPAIR_STATUSES])).orderBy(desc(repairs.createdAt)),
    db.select().from(repairs).where(inArray(repairs.status, [...CLOSED_REPAIR_STATUSES])).orderBy(desc(repairs.createdAt)).limit(RECENT_CLOSED_LIMIT),
  ]);
  const rows = [...openRows, ...closedRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const equipmentMap = new Map(equipmentRows.map((e) => [e.id, e]));
  const actingGroups = auth.permissions.filter((p) => p.groupCode !== "KHO_TL" && p.level !== "viewer" && isOfficialOperationalGroupCode(p.groupCode));
  const pending = rows.filter((row) => row.status === "pending_acceptance").length;
  const repairing = rows.filter((row) => row.status === "repairing" && row.repairType !== "external").length;
  const externalRepairing = rows.filter((row) => row.status === "repairing" && row.repairType === "external").length;
  const waitingOwner = rows.filter((row) => row.status === "wait_owner_confirm" || row.status === "wait_owner_receive").length;
  const completed = rows.filter((row) => row.status === "completed").length;

  return (
    <div className={`repair-mobile-page${actingGroups.length && !auth.isReadOnlyViewer ? " has-ticket-fab" : ""} mobile-mode-${mobileMode}`}>
      <PageHeader
        title="Sửa chữa"
        description="Báo hư, tiếp nhận, thực hiện sửa và xác nhận hoàn thành theo từng mã máy."
        actions={auth.isWorkshopAdmin && !auth.isReadOnlyViewer ? (
          // Form GET tới route tải file: trình duyệt tải về, trang giữ nguyên. Để trống ngày = toàn bộ phiếu.
          <form className="repair-export-bar" action="/repairs/export" method="get">
            <label>Báo hỏng từ ngày<input type="date" name="from" /></label>
            <label>Đến ngày<input type="date" name="to" /></label>
            <Button type="submit" variant="secondary"><FileSpreadsheet size={16} aria-hidden="true" /> Xuất Excel phiếu sửa</Button>
          </form>
        ) : null}
      />
      <section className="stat-grid compact">
        <StatCard title="Chờ tiếp nhận" value={pending} icon={Clock3} tone="warning" />
        <StatCard title="Sửa nội bộ" value={repairing} icon={Wrench} tone="primary" />
        <StatCard title="Thuê ngoài" value={externalRepairing} icon={Wrench} tone="warning" />
        <StatCard title="Chờ nhóm nhận lại" value={waitingOwner} icon={ShieldAlert} tone="violet" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>
      <section className="mobile-repair-list" aria-label="Danh sách phiếu báo hư">
        <div className="mobile-loan-section-title"><strong>Phiếu báo hư</strong><span>{rows.length}</span></div>
        {rows.slice(0, 20).map((row) => { const machine = equipmentMap.get(row.equipmentId); return <article className="mobile-repair-card" key={`mobile-repair-${row.id}`}><div><strong>{machine?.name || "Máy/CCDC"}</strong><span>{machine?.code || row.code} · {groupMap.get(row.reportedByGroupId) || "—"}</span><small>{repairStatusLabel(row.status, row.repairType)}</small></div></article>; })}
        {!rows.length ? <p className="mobile-ops-empty">Chưa có phiếu báo hư.</p> : null}
      </section>
      <TicketTableCard title="Chờ xử lý" count={openRows.length}>
        <DataTable headers={["Phiếu", "Máy", "Nhóm báo", "Nội dung hư", "Chi phí", "Trạng thái", "Thao tác"]} rows={openRows.map((row) => {
              const machine = equipmentMap.get(row.equipmentId);
              const actions = [] as React.ReactNode[];
              if (row.status === "pending_acceptance" && auth.isWorkshopAdmin) actions.push(<form action={acceptRepairAction} key="accept"><input type="hidden" name="repairId" value={row.id} /><Button size="sm">Tiếp nhận</Button></form>);
              if (row.status === "repairing" && row.repairType !== "external" && auth.isWorkshopAdmin) {
                actions.push(<form action={completeRepairAction} key="done" className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="cost" type="number" min="0" step="1000" defaultValue="0" aria-label="Chi phí" className="field-inline-sm" /><input name="workDescription" placeholder="Nội dung sửa nội bộ" aria-label="Nội dung sửa" className="field-inline-md" /><input name="resultNotes" placeholder="Kết quả chạy thử" aria-label="Kết quả thử" className="field-inline-md" /><Button size="sm">Sửa đạt · bàn giao</Button></form>);
                actions.push(<form action={sendExternalRepairAction} key="external" className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="vendor" placeholder="Đơn vị sửa ngoài" aria-label="Đơn vị sửa ngoài" className="field-inline-md" required /><input name="reason" placeholder="Lý do thuê ngoài" aria-label="Lý do thuê ngoài" className="field-inline-md" required /><Button size="sm" variant="secondary">Thuê ngoài sửa</Button></form>);
                actions.push(<form action={markRepairIrreparableAction} key="internal-fail" className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="cost" type="number" min="0" step="1000" defaultValue={Number(row.cost || 0)} aria-label="Chi phí" className="field-inline-sm" /><input name="resultNotes" placeholder="Kết luận không thể phục hồi" aria-label="Kết luận" className="field-inline-md" /><Button size="sm" variant="secondary">Không thể phục hồi</Button></form>);
              }
              if (row.status === "repairing" && row.repairType === "external" && auth.isWorkshopAdmin) {
                actions.push(<form action={completeRepairAction} key="external-done" className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="cost" type="number" min="0" step="1000" defaultValue={Number(row.cost || 0)} aria-label="Chi phí sửa ngoài" className="field-inline-sm" /><input name="workDescription" defaultValue={row.workDescription || ""} placeholder="Nội dung sửa ngoài" aria-label="Nội dung sửa" className="field-inline-md" /><input name="resultNotes" placeholder="Kết quả nhận về/chạy thử" aria-label="Kết quả thử" className="field-inline-md" /><Button size="sm">Nhận về đạt · bàn giao</Button></form>);
                actions.push(<form action={markRepairIrreparableAction} key="external-fail" className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="cost" type="number" min="0" step="1000" defaultValue={Number(row.cost || 0)} aria-label="Chi phí" className="field-inline-sm" /><input name="resultNotes" placeholder="Kết luận không thể phục hồi" aria-label="Kết luận" className="field-inline-md" /><Button size="sm" variant="secondary">Không thể phục hồi</Button></form>);
              }
              if (row.status === "wait_owner_receive" && machine && hasGroupPermission(auth, machine.ownerGroupId, "manager")) actions.push(<form action={receiveIrreparableByOwnerAction} key="receive-irreparable"><input type="hidden" name="repairId" value={row.id} /><Button size="sm">Nhận lại máy</Button></form>);
              if (row.status === "wait_owner_confirm" && machine && hasGroupPermission(auth, machine.ownerGroupId, "manager")) actions.push(<form action={confirmRepairByOwnerAction} key="confirm"><input type="hidden" name="repairId" value={row.id} /><Button size="sm">Nhận lại</Button></form>);
              return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.reportedByGroupId) || "—", row.issueDescription, auth.isWorkshopAdmin ? <form key="cost" action={updateRepairCostAction} className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="cost" type="number" min="0" step="1000" defaultValue={Number(row.cost || 0)} aria-label={`Chi phí ${row.code}`} className="field-inline-sm" /><Button size="sm" variant="secondary">Lưu</Button></form> : <span key="cost" className="numeric">{formatNumber(row.cost)}</span>, <StatusBadge key="status" label={repairStatusLabel(row.status, row.repairType)} tone={workflowTone(row.status)} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
})} empty={<EmptyState description="Không có phiếu sửa chữa nào đang chờ xử lý." />} />
      </TicketTableCard>

      <TicketTableCard title="Đã hoàn thành" count={closedRows.length} tone="done">
        <DataTable
          headers={["Phiếu", "Máy", "Nhóm báo", "Nội dung hư", "Chi phí", "Trạng thái"]}
          rows={closedRows.map((row) => {
            const machine = equipmentMap.get(row.equipmentId);
            return [<strong key="code">{row.code}</strong>, machine ? `${machine.code} — ${machine.name}` : row.equipmentId, groupMap.get(row.reportedByGroupId) || "—", row.issueDescription, auth.isWorkshopAdmin ? <form key="cost" action={updateRepairCostAction} className="row-actions"><input type="hidden" name="repairId" value={row.id} /><input name="cost" type="number" min="0" step="1000" defaultValue={Number(row.cost || 0)} aria-label={`Chi phí ${row.code}`} className="field-inline-sm" /><Button size="sm" variant="secondary">Lưu</Button></form> : <span key="cost" className="numeric">{formatNumber(row.cost)}</span>, <StatusBadge key="status" label={repairStatusLabel(row.status, row.repairType)} tone={workflowTone(row.status)} />];
          })}
          empty={<EmptyState description="Chưa có phiếu sửa chữa nào hoàn thành." />}
        />
      </TicketTableCard>

      {actingGroups.length && !auth.isReadOnlyViewer ? (
        <TicketDialog buttonLabel="Tạo phiếu sửa chữa" title="Báo hư / yêu cầu sửa" submitLabel="Tạo phiếu sửa" action={submitRepair} defaultOpen={mobileMode === "create"}>
          <FormField label="Nhóm báo hư" required><select name="reportingGroupId">{actingGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
              <FormField label="Máy" required><select name="equipmentId">{equipmentRows.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</select></FormField>
              <FormField label="Hiện tượng hư" required><textarea name="issueDescription" placeholder="Mô tả hiện tượng thực tế, thời điểm và điều kiện xảy ra." /></FormField>
        </TicketDialog>
      ) : null}
    </div>
  );
}
