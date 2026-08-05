import { asc, desc, eq } from "drizzle-orm";
import { CheckCircle2, Clock3, PackageCheck, Plus, Zap } from "lucide-react";
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
  closeQuickLoanAction,
  confirmQuickLoanReceiptAction,
  createQuickLoanAction,
  reportQuickLoanReturnAction,
} from "@/actions/quick-loans";

export default async function QuickLoansPage() {
  const auth = await requireUser();
  const [groupRows, tools, rows] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select().from(toolCatalog).where(eq(toolCatalog.isActive, true)).orderBy(asc(toolCatalog.name)),
    db.select().from(quickLoans).orderBy(desc(quickLoans.createdAt)).limit(100),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const sourceGroups = auth.permissions.filter((p) => p.groupCode !== "KHO_TL");
  const pendingReceipt = rows.filter((row) => row.status === "pending_receipt").length;
  const borrowed = rows.filter((row) => row.status === "borrowed").length;
  const waitingClose = rows.filter((row) => row.status === "return_reported").length;
  const completed = rows.filter((row) => row.status === "completed").length;

  return (
    <>
      <PageHeader title="Cho mượn nhanh" description="Ghi nhận giao nhận ngắn hạn cho dụng cụ nhỏ hoặc vật dụng không có mã máy." />
      <section className="stat-grid">
        <StatCard title="Chờ xác nhận nhận" value={pendingReceipt} icon={Clock3} tone="warning" />
        <StatCard title="Đang được mượn" value={borrowed} icon={Zap} tone="violet" />
        <StatCard title="Chờ bên cho chốt" value={waitingClose} icon={PackageCheck} tone="cyan" />
        <StatCard title="Đã hoàn thành" value={completed} icon={CheckCircle2} tone="success" />
      </section>
      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Giao dịch mượn nhanh</CardTitle><Zap size={18} /></CardHeader>
          <CardContent>
            <DataTable headers={["Phiếu", "Vật dụng", "SL", "Nhóm cho", "Nhóm mượn", "Hạn trả", "Trạng thái", "Thao tác"]} rows={rows.map((row) => {
              const actions = [] as React.ReactNode[];
              if (row.status === "pending_receipt" && hasGroupPermission(auth, row.borrowerGroupId, "operator")) actions.push(<form action={confirmQuickLoanReceiptAction} key="receive"><input type="hidden" name="loanId" value={row.id} /><Button size="sm">Đã nhận</Button></form>);
              if (row.status === "borrowed" && hasGroupPermission(auth, row.borrowerGroupId, "operator")) actions.push(<form action={reportQuickLoanReturnAction} key="report"><input type="hidden" name="loanId" value={row.id} /><Button size="sm" variant="secondary">Báo trả</Button></form>);
              if (row.status === "return_reported" && hasGroupPermission(auth, row.sourceGroupId, "operator")) actions.push(
                <form action={closeQuickLoanAction} key="close" className="row-actions">
                  <input type="hidden" name="loanId" value={row.id} />
                  <input name="returnedGood" type="number" min="0" step="0.01" defaultValue={Number(row.quantityBorrowed)} aria-label="Trả tốt" title="Trả tốt" className="field-inline-xs" />
                  <input name="returnedDamaged" type="number" min="0" step="0.01" defaultValue="0" aria-label="Trả hư" title="Trả hư" className="field-inline-xs" />
                  <input name="lostQuantity" type="number" min="0" step="0.01" defaultValue="0" aria-label="Mất" title="Mất" className="field-inline-xs" />
                  <input name="returnNote" placeholder="Ghi chú trả" aria-label="Ghi chú trả" className="field-inline-md" />
                  <Button size="sm">Xác nhận trả</Button>
                </form>,
              );
              return [<strong key="code">{row.code}</strong>, `${row.itemName}${row.specification ? ` — ${row.specification}` : ""}`, `${row.quantityBorrowed} ${row.unit}`, groupMap.get(row.sourceGroupId) || "—", groupMap.get(row.borrowerGroupId) || "—", formatDateTime(row.expectedReturnAt), <StatusBadge key="status" label={WORKFLOW_LABELS[row.status] || row.status} tone={row.status === "completed" ? "success" : row.status === "return_reported" ? "warning" : "info"} />, <div key="actions" className="row-actions">{actions.length ? actions : "—"}</div>];
            })} empty={<EmptyState description="Chưa có giao dịch mượn nhanh." />} />
          </CardContent>
        </Card>
        <Card className="side-panel">
          <CardHeader><CardTitle>Tạo ghi nhận mượn nhanh</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {sourceGroups.length ? <form action={createQuickLoanAction} className="form-grid">
              <FormField label="Nhóm cho mượn" required><select name="sourceGroupId">{sourceGroups.map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
              <FormField label="Nhóm mượn" required><select name="borrowerGroupId">{groupRows.filter((g) => g.name !== "Kho thanh lý").map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
              <FormField label="Chọn từ danh mục nhóm"><select name="toolId" defaultValue=""><option value="">Vật dụng khác / nhập tự do</option>{tools.map((t) => <option key={t.id} value={t.id}>{t.name}{t.specification ? ` — ${t.specification}` : ""}</option>)}</select></FormField>
              <FormField label="Tên vật dụng" required><input name="itemName" placeholder="Ví dụ: Taro M20" /></FormField>
              <FormField label="Quy cách"><input name="specification" /></FormField>
              <div className="form-grid two"><FormField label="Số lượng" required><input name="quantityBorrowed" type="number" min="0.01" step="0.01" /></FormField><FormField label="Đơn vị"><input name="unit" defaultValue="cái" /></FormField></div>
              <FormField label="Ngày dự kiến trả"><input name="expectedReturnAt" type="datetime-local" /></FormField>
              <FormField label="Ghi chú bên cho"><textarea name="lenderNote" placeholder="Phụ kiện kèm theo hoặc lưu ý sử dụng" /></FormField>
              <Button type="submit">Tạo giao dịch</Button>
            </form> : <EmptyState title="Chỉ xem" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
