import { and, asc, desc, eq } from "drizzle-orm";
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
import { formatDateTime } from "@/lib/utils";
import {
  approveQuickLoanAction,
  closeQuickLoanAction,
  confirmQuickLoanReceiptAction,
  createQuickLoanAction,
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

export default async function QuickLoansPage() {
  const auth = await requireUser();
  const [groupRows, tools, rows] = await Promise.all([
    db.select({ id: groups.id, code: groups.code, name: groups.name, isSystem: groups.isSystem })
      .from(groups)
      .where(eq(groups.isActive, true))
      .orderBy(asc(groups.name)),
    db.select().from(toolCatalog)
      .where(and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active")))
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
    <>
      <PageHeader
        title="Mượn nhanh"
        description="Nhân viên lập đề nghị; Operator nhóm cho duyệt; nhân viên nhóm cho xác nhận số lượng nhận lại."
      />

      <section className="stat-grid">
        <StatCard title="Chờ Operator duyệt" value={pendingApproval} icon={Clock3} tone="warning" />
        <StatCard title="Đã duyệt / đang mượn" value={borrowed} icon={Zap} tone="violet" />
        <StatCard title="Chờ nhóm cho nhận lại" value={waitingClose} icon={PackageCheck} tone="cyan" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>

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
                  );
                }

                if (row.status === "pending_receipt" && hasGroupPermission(auth, row.borrowerGroupId, "viewer")) {
                  actions.push(
                    <form action={confirmQuickLoanReceiptAction} key="receive" className="row-actions">
                      <input type="hidden" name="loanId" value={row.id} />
                      <input name="borrowerNote" placeholder="Ghi chú nhận" aria-label="Ghi chú nhận" className="field-inline-md" />
                      <Button size="sm">Đã nhận</Button>
                    </form>,
                  );
                }

                if (row.status === "borrowed" && hasGroupPermission(auth, row.borrowerGroupId, "viewer")) {
                  actions.push(
                    <form action={reportQuickLoanReturnAction} key="report">
                      <input type="hidden" name="loanId" value={row.id} />
                      <Button size="sm" variant="secondary">Báo trả</Button>
                    </form>,
                  );
                }

                if (row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "viewer")) {
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
                  `${row.itemName}${row.specification ? ` — ${row.specification}` : ""}`,
                  `${row.quantityBorrowed} ${row.unit}`,
                  groupMap.get(row.sourceGroupId) || "—",
                  groupMap.get(row.borrowerGroupId) || "—",
                  formatDateTime(row.expectedReturnAt),
                  <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={tone(row.status)} />,
                  <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>,
                ];
              })}
              empty={<EmptyState description="Chưa có giao dịch mượn nhanh." />}
            />
          </CardContent>
        </Card>

        <Card className="side-panel">
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
                  <select name="sourceGroupId">
                    {operationalGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Chọn từ danh mục nhóm cho" hint="Danh sách ghi rõ nhóm sở hữu; hệ thống sẽ kiểm tra lại khi gửi.">
                  <select name="toolId" defaultValue="">
                    <option value="">Vật dụng khác / nhập tự do</option>
                    {tools.map((tool) => (
                      <option key={tool.id} value={tool.id}>{groupMap.get(tool.groupId)} · {tool.code || "Không mã"} · {tool.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Tên vật dụng" required><input name="itemName" placeholder="Ví dụ: Taro M20" /></FormField>
                <FormField label="Quy cách"><input name="specification" /></FormField>
                <div className="form-grid two">
                  <FormField label="Số lượng" required><input name="quantityBorrowed" type="number" min="0.01" step="0.01" /></FormField>
                  <FormField label="Đơn vị"><input name="unit" defaultValue="cái" /></FormField>
                </div>
                <FormField label="Ngày dự kiến trả"><input name="expectedReturnAt" type="datetime-local" /></FormField>
                <FormField label="Nội dung đề nghị"><textarea name="borrowerNote" placeholder="Mục đích sử dụng hoặc lưu ý cần thiết" /></FormField>
                <Button type="submit">Gửi đề nghị mượn nhanh</Button>
              </form>
            ) : (
              <EmptyState title="Chưa được gán nhóm" description="Tài khoản cần có ít nhất quyền Nhân viên tại một nhóm để lập đề nghị." />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
