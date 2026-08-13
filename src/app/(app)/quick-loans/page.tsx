import { and, asc, desc, eq, gt } from "drizzle-orm";
import { CheckCircle2, Clock3, PackageCheck, Plus, ShieldCheck, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { groups, quickLoans, toolCatalog } from "@/lib/db/schema";
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
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  approveQuickLoanAction,
  closeQuickLoanAction,
  createQuickLoanAction,
  rejectQuickLoanAction,
  reportQuickLoanReturnAction,
} from "@/actions/quick-loans";
import { isOfficialOperationalGroupCode } from "@/lib/group-structure";

function tone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "rejected" || status === "cancelled") return "danger" as const;
  if (status === "pending_approval" || status === "return_reported") return "warning" as const;
  return "info" as const;
}

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuickLoansPage({ searchParams }: { searchParams?: SearchParams }) {
  const auth = await requireUser();
  const params = searchParams ? await searchParams : {};
  const modeValue = params.mode;
  const mobileMode = (Array.isArray(modeValue) ? modeValue[0] : modeValue) || "view";
  const [groupRows, tools, rows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem })
      .from(groups)
      .where(eq(groups.isActive, true))
      .orderBy(asc(groups.name)),
    db.select().from(toolCatalog)
      .where(and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active"), gt(toolCatalog.quantityOnHand, "0")))
      .orderBy(asc(toolCatalog.name)),
    db.select().from(quickLoans).orderBy(desc(quickLoans.createdAt)).limit(100),
  ]);

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const operationalGroups = groupRows.filter((group) => !group.isSystem && isOfficialOperationalGroupCode(group.code));
  const borrowerGroups = auth.permissions.filter(
    (permission) => permission.groupCode !== "KHO_TL" && isOfficialOperationalGroupCode(permission.groupCode),
  );

  const pendingApproval = rows.filter((row) => row.status === "pending_approval").length;
  const borrowed = rows.filter((row) => ["pending_receipt", "borrowed"].includes(row.status)).length;
  const waitingClose = rows.filter((row) => row.status === "return_reported").length;
  const completed = rows.filter((row) => row.status === "completed").length;

  return (
    <div className={`loan-mobile-page quick-loans-page mobile-mode-${mobileMode}`}>
      <div className="loan-mobile-switch" aria-label="Chọn kiểu mượn">
        <a href="/machine-loans">Máy có mã</a>
        <span className="is-active">CCDC lặt vặt</span>
      </div>
      <PageHeader
        title="Mượn nhanh"
        description="Luồng giống Mượn máy: tạo đề nghị → nhóm cho mượn duyệt (đồng thời bàn giao/đã nhận) → báo trả → nhóm cho mượn xác nhận nhận lại."
      />

      <section className="stat-grid">
        <StatCard title="Chờ nhóm cho mượn duyệt" value={pendingApproval} icon={Clock3} tone="warning" />
        <StatCard title="Đã duyệt / đang mượn" value={borrowed} icon={Zap} tone="violet" />
        <StatCard title="Chờ nhóm cho nhận lại" value={waitingClose} icon={PackageCheck} tone="cyan" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>

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

      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Giao dịch mượn nhanh</CardTitle><Zap size={18} /></CardHeader>
          <CardContent>
            <DataTable
              headers={["Phiếu", "Vật dụng", "SL", "Nhóm cho", "Nhóm mượn", "Hạn trả", "Trạng thái", "Thao tác"]}
              rows={rows.map((row) => {
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
                  row.expectedReturnAt ? formatDate(row.expectedReturnAt) : "—",
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
              empty={<EmptyState description="Chưa có giao dịch mượn nhanh." />}
            />
          </CardContent>
        </Card>

        <Card className="side-panel" id="new-quick-loan">
          <CardHeader><CardTitle>Tạo đề nghị mượn nhanh</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {borrowerGroups.length ? (
              <form action={createQuickLoanAction} className="form-grid">
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
                <Button type="submit">Gửi đề nghị mượn nhanh</Button>
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
