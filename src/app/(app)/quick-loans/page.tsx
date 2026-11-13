import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { groups, quickLoans, toolCatalog } from "@/lib/db/schema";
import { hasGroupPermission, requireUser } from "@/lib/auth/guards";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { LoanFilterBar, LoanHead } from "@/components/loan-head";
import { TicketDialog } from "@/components/ticket-dialog";
import { TicketTableCard } from "@/components/ticket-table-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { workflowTone as tone } from "@/lib/status-style";
import { Button } from "@/components/ui/button";
import { ExportBar } from "@/components/export-bar";
import { FormField } from "@/components/ui/form-field";
import { SearchableSelect } from "@/components/searchable-select";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  approveQuickLoanAction,
  closeQuickLoanAction,
  rejectQuickLoanAction,
  reportQuickLoanReturnAction,
} from "@/actions/quick-loans";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";
import { countLoanViews, loanDaysLate, matchesLoanView, parseLoanView } from "@/lib/loan-views";
import { vnDate } from "@/lib/export/equipment-export";
import { submitQuickLoan } from "@/actions/ticket-forms";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuickLoansPage({ searchParams }: { searchParams?: SearchParams }) {
  const auth = await requireUser();
  const params = searchParams ? await searchParams : {};
  const modeValue = params.mode;
  const mobileMode = (Array.isArray(modeValue) ? modeValue[0] : modeValue) || "view";
  const [groupRows, tools, openRows, closedRows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem })
      .from(groups)
      .where(eq(groups.isActive, true))
      .orderBy(asc(groups.name)),
    db.select().from(toolCatalog)
      .where(and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active"), gt(toolCatalog.quantityOnHand, "0")))
      .orderBy(asc(toolCatalog.name)),
    // Phiếu đang mở luôn tải đủ (để vẫn Báo trả/Nhận lại được dù cũ); phiếu đã đóng chỉ lấy 100 gần nhất.
    db.select().from(quickLoans).where(inArray(quickLoans.status, ["pending_approval", "pending_receipt", "borrowed", "return_reported"])).orderBy(desc(quickLoans.createdAt)),
    db.select().from(quickLoans).where(inArray(quickLoans.status, ["completed", "rejected", "cancelled"])).orderBy(desc(quickLoans.createdAt)).limit(100),
  ]);
  const rows = [...openRows, ...closedRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const operationalGroups = groupRows.filter((group) => !group.isSystem && isOfficialOperationalGroupCode(group.code));
  const borrowerGroups = auth.permissions.filter(
    (permission) => permission.groupCode !== "KHO_TL" && isOfficialOperationalGroupCode(permission.groupCode),
  );

  // Thanh lọc nhanh: đếm trên phiếu ĐANG MỞ; chọn thẻ thì bảng "Chờ xử lý" chỉ hiện phiếu thuộc thẻ đó.
  const today = vnDate();
  const view = parseLoanView(params.view);
  const toViewRow = (row: (typeof openRows)[number]) => ({ status: row.status, dueDate: row.expectedReturnAt ? vnDate(row.expectedReturnAt) : null });
  const counts = countLoanViews(openRows.map(toViewRow), today);
  const shownOpenRows = openRows.filter((row) => matchesLoanView(toViewRow(row), view, today));
  const canCreate = borrowerGroups.length > 0 && !auth.isReadOnlyViewer;

  return (
    <div className={`loan-mobile-page quick-loans-page has-ticket-fab mobile-mode-${mobileMode}`}>
      <LoanHead
        active="quick"
        exportSlot={auth.isWorkshopAdmin && !auth.isReadOnlyViewer ? <ExportBar action="/machine-loans/export" buttonLabel="Xuất Excel mượn – trả" fromLabel="Đề nghị từ ngày" /> : null}
      />
      <LoanFilterBar basePath="/quick-loans" view={view} counts={counts} doneCount={closedRows.length} />

      <section className="mobile-loan-action-inbox" aria-label="Việc cần xử lý mượn nhanh">
        <div className="mobile-loan-section-title">
          <strong>Việc cần xử lý</strong>
          <span>{rows.filter((row) =>
            (row.status === "pending_approval" && hasGroupPermission(auth, row.sourceGroupId, "operator")) ||
            (row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "operator"))
          ).length}</span>
        </div>
        {rows.filter((row) =>
          (row.status === "pending_approval" && hasGroupPermission(auth, row.sourceGroupId, "operator")) ||
          (row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "operator"))
        ).slice(0, 6).map((row) => (
          <article className="mobile-loan-action-card" key={`quick-action-${row.id}`}>
            <div className="mobile-loan-action-copy">
              <strong>{row.itemName}</strong>
              <span>{row.specification || `${row.quantityBorrowed} ${row.unit}`} · {groupMap.get(row.sourceGroupId) || "—"} → {groupMap.get(row.borrowerGroupId) || "—"}</span>
              <small>{row.status === "pending_approval" ? "Chờ duyệt cho mượn" : "Chờ nhóm cho mượn xác nhận nhận lại"}</small>
            </div>
            {row.status === "pending_approval" ? (
              <div className="row-actions">
                <form action={rejectQuickLoanAction}><input type="hidden" name="loanId" value={row.id} /><Button size="sm" variant="secondary">Từ chối</Button></form>
                <form action={approveQuickLoanAction}><input type="hidden" name="loanId" value={row.id} /><Button size="sm">Duyệt</Button></form>
              </div>
            ) : (
              <form action={closeQuickLoanAction} className="mobile-quick-close-form">
                <input type="hidden" name="loanId" value={row.id} />
                <input type="hidden" name="returnedGood" value={Number(row.quantityBorrowed)} />
                <input type="hidden" name="returnedDamaged" value="0" />
                <input type="hidden" name="lostQuantity" value="0" />
                <Button size="sm">Nhận lại đủ</Button>
              </form>
            )}
          </article>
        ))}
      </section>

      <div className="mobile-loan-return-list" id="mobile-active-loans">
        <div className="mobile-loan-section-title"><strong>Đang mượn / chờ trả</strong><span>{rows.filter((row) => ["pending_receipt", "borrowed", "return_reported"].includes(row.status)).length}</span></div>
        {rows.filter((row) => ["pending_receipt", "borrowed", "return_reported"].includes(row.status)).slice(0, 6).map((row) => {
          const canReport = ["pending_receipt", "borrowed"].includes(row.status) && hasGroupPermission(auth, row.borrowerGroupId, "viewer");
          const canReceive = row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "operator");
          return (
            <div className="mobile-loan-return-item" key={row.id}>
              <div><strong>{row.itemName}</strong><span>{row.specification || `${row.quantityBorrowed} ${row.unit}`} · {groupMap.get(row.sourceGroupId) || "—"}</span></div>
              {canReport ? <form action={reportQuickLoanReturnAction}><input type="hidden" name="loanId" value={row.id} /><Button size="sm" variant="secondary">Trả</Button></form> : null}
              {canReceive ? <form action={closeQuickLoanAction} className="mobile-inline-confirm"><input type="hidden" name="loanId" value={row.id} /><input type="hidden" name="returnedGood" value={Number(row.quantityBorrowed)} /><input type="hidden" name="returnedDamaged" value="0" /><input type="hidden" name="lostQuantity" value="0" /><Button size="sm">Nhận lại</Button></form> : null}
            </div>
          );
        })}
      </div>

      <TicketTableCard title="Chờ xử lý" count={shownOpenRows.length}>
            <DataTable
              headers={["Phiếu", "Vật dụng", "SL", "Nhóm cho", "Nhóm mượn", "Hạn trả", "Trạng thái", "Thao tác"]}
              rows={shownOpenRows.map((row) => {
                const actions: React.ReactNode[] = [];

                if (row.status === "pending_approval" && hasGroupPermission(auth, row.sourceGroupId, "operator")) {
                  actions.push(
                    <form action={approveQuickLoanAction} key="approve" className="row-actions">
                      <input type="hidden" name="loanId" value={row.id} />
                      <input name="lenderNote" placeholder="Ghi chú khi duyệt/giao" aria-label="Ghi chú khi duyệt" className="field-inline-lg" />
                      <Button size="sm"><ShieldCheck size={14} /> Duyệt</Button>
                    </form>,
                    <form action={rejectQuickLoanAction} key="reject">
                      <input type="hidden" name="loanId" value={row.id} />
                      <Button size="sm" variant="secondary">Từ chối</Button>
                    </form>,
                  );
                }

                if (["pending_receipt", "borrowed"].includes(row.status) && hasGroupPermission(auth, row.borrowerGroupId, "viewer")) {
                  actions.push(
                    <form action={reportQuickLoanReturnAction} key="report">
                      <input type="hidden" name="loanId" value={row.id} />
                      <Button size="sm" variant="secondary">Báo trả</Button>
                    </form>,
                  );
                }

                if (row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "operator")) {
                  actions.push(
                    <form action={closeQuickLoanAction} key="close" className="row-actions">
                      <input type="hidden" name="loanId" value={row.id} />
                      <input name="returnedGood" type="number" min="0" step="0.01" defaultValue={Number(row.quantityBorrowed)} aria-label="Trả tốt" title="Trả tốt" className="field-inline-xs" />
                      <input name="returnedDamaged" type="number" min="0" step="0.01" defaultValue="0" aria-label="Trả hư" title="Trả hư" className="field-inline-xs" />
                      <input name="lostQuantity" type="number" min="0" step="0.01" defaultValue="0" aria-label="Mất" title="Mất" className="field-inline-xs" />
                      <input name="returnNote" placeholder="Ghi chú nhận lại" aria-label="Ghi chú nhận lại" className="field-inline-md" />
                      <Button size="sm">Nhận lại</Button>
                    </form>,
                  );
                }

                const late = loanDaysLate({ status: row.status, dueDate: row.expectedReturnAt ? vnDate(row.expectedReturnAt) : null }, today);
                return [
                  <strong key="code">{row.code}</strong>,
                  <div key="item" className="quick-loan-item-cell">
                    <strong>{row.itemName}</strong>
                    {row.specification ? <small>{row.specification}</small> : null}
                    <span className={row.toolId ? "catalog-chip is-linked" : "catalog-chip is-external"}>
                      {row.toolId ? "Có trong danh mục" : "Ngoài danh mục"}
                    </span>
                  </div>,
                  `${row.quantityBorrowed} ${row.unit}`,
                  groupMap.get(row.sourceGroupId) || "—",
                  groupMap.get(row.borrowerGroupId) || "—",
                  <span key="due" className="due-cell">{row.expectedReturnAt ? formatDate(row.expectedReturnAt) : "—"}{late ? <small className="late-note">Trễ {late} ngày</small> : null}</span>,
                  <StatusBadge
                    key="status"
                    label={
                      ["pending_receipt", "borrowed"].includes(row.status)
                        ? (hasGroupPermission(auth, row.sourceGroupId, "viewer") && !hasGroupPermission(auth, row.borrowerGroupId, "viewer") ? "Đang cho mượn" : "Đang mượn")
                        : row.status === "return_reported"
                          ? (hasGroupPermission(auth, row.sourceGroupId, "viewer") ? "Chờ nhận lại" : "Đã báo trả")
                          : WORKFLOW_LABELS[row.status] || row.status
                    }
                    tone={tone(row.status)}
                  />,
                  <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>,
                ];
              })}
              empty={<EmptyState description={view === "all" ? "Không có giao dịch mượn nhanh nào đang chờ xử lý." : "Không có phiếu nào thuộc mục này."} />}
            />
      </TicketTableCard>

      <TicketTableCard id="da-hoan-thanh" title="Đã hoàn thành" count={closedRows.length} tone="done">
        <DataTable
          headers={["Phiếu", "Vật dụng", "SL", "Nhóm cho", "Nhóm mượn", "Hạn trả", "Trạng thái"]}
          rows={closedRows.map((row) => [
            <strong key="code">{row.code}</strong>,
            <div key="item" className="quick-loan-item-cell">
              <strong>{row.itemName}</strong>
              {row.specification ? <small>{row.specification}</small> : null}
            </div>,
            `${row.quantityBorrowed} ${row.unit}`,
            groupMap.get(row.sourceGroupId) || "—",
            groupMap.get(row.borrowerGroupId) || "—",
            row.expectedReturnAt ? formatDate(row.expectedReturnAt) : "—",
            <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={tone(row.status)} />,
          ])}
          empty={<EmptyState description="Chưa có giao dịch mượn nhanh nào hoàn thành." />}
        />
      </TicketTableCard>

      {canCreate ? (
        <TicketDialog
          buttonLabel="Tạo phiếu mượn nhanh"
          title="Tạo đề nghị mượn nhanh CCDC"
          submitLabel="Gửi đề nghị mượn nhanh"
          action={submitQuickLoan}
          defaultOpen={mobileMode === "create"}
        >
          <FormField label="Nhóm mượn" required hint="Mọi mức quyền trong nhóm đều được lập đề nghị.">
                  <select name="borrowerGroupId">
                    {borrowerGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}
                  </select>
                </FormField>
                <FormField label="Nhóm cho mượn" required>
                  <select name="sourceGroupId" id="quick-loan-source-group">
                    {operationalGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </FormField>
                <div className="quick-loan-entry-block is-catalog">
                  <div className="quick-loan-entry-heading">
                    <span className="quick-loan-entry-index">1</span>
                    <div>
                      <strong>Tìm trong danh mục <span className="optional-label">(không bắt buộc)</span></strong>
                      <p>Nếu CCDC đã có trong hệ thống, nên chọn để liên kết đúng danh mục và kiểm soát số lượng.</p>
                    </div>
                  </div>
                  <SearchableSelect
                    name="toolId"
                    controllerId="quick-loan-source-group"
                    includeControllerValue
                    placeholder="Gõ mã, tên hoặc quy cách để tìm..."
                    searchPlaceholder="Gõ mã, tên dụng cụ, quy cách..."
                    emptyText="Không tìm thấy trong danh mục của nhóm này. Có thể nhập nhanh ở mục 2 bên dưới."
                    options={tools.map((tool) => ({
                      value: tool.id,
                      groupId: tool.groupId,
                      label: `${tool.code || "Không mã"} — ${tool.name}`,
                      description: [tool.specification, `${tool.quantityOnHand} ${tool.unit}`, groupMap.get(tool.groupId)].filter(Boolean).join(" · "),
                    }))}
                  />
                </div>

                <div className="quick-loan-or"><span>HOẶC</span></div>

                <div className="quick-loan-entry-block is-free-text">
                  <div className="quick-loan-entry-heading">
                    <span className="quick-loan-entry-index">2</span>
                    <div>
                      <strong>Nhập nhanh CCDC ngoài danh mục</strong>
                      <p>Dùng khi CCDC lặt vặt chưa được khai báo trong hệ thống. Không cần tạo danh mục trước.</p>
                    </div>
                  </div>
                  <div className="form-grid two quick-loan-free-fields">
                    <FormField label="Tên CCDC"><input name="itemName" placeholder="Ví dụ: Taro M20, mũi khoan Ø12..." /></FormField>
                    <FormField label="Quy cách"><input name="specification" placeholder="Ví dụ: M20, Ø12 HSS..." /></FormField>
                  </div>
                  <p className="quick-loan-note">Nếu đã chọn CCDC ở mục 1, hệ thống ưu tiên dữ liệu trong danh mục. Nếu không chọn, cần nhập tên CCDC tại mục 2.</p>
                </div>
                <div className="form-grid two">
                  <FormField label="Số lượng" required><input name="quantityBorrowed" type="number" min="0.01" step="0.01" /></FormField>
                  <FormField label="Đơn vị"><input name="unit" defaultValue="Cái" /></FormField>
                </div>
                <FormField label="Ngày dự kiến trả"><input name="expectedReturnAt" type="date" /></FormField>
                <FormField label="Nội dung đề nghị"><textarea name="borrowerNote" placeholder="Mục đích sử dụng hoặc lưu ý cần thiết" /></FormField>
        </TicketDialog>
      ) : null}
    </div>
  );
}
