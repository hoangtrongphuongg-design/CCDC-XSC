import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { closeInventoryAction } from "@/actions/inventory";
import { InventoryChecklist } from "@/components/inventory/inventory-checklist";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { summarizeInventory } from "@/lib/inventory";
import { loadInventoryDetail } from "@/lib/inventory-data";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  const { id } = await params;
  const detail = await loadInventoryDetail(auth, id);
  if (!detail) notFound();
  const { session, items, canManage, canCheck } = detail;
  const open = session.status === "open";
  const summary = summarizeInventory(items);

  return (
    <div className="inventory-page">
      <PageHeader
        title={`Kiểm kê ${session.code}`}
        description={`${session.groupName}${session.title ? ` · ${session.title}` : ""} · mở ${formatDateTime(session.createdAt)}${session.createdByName ? ` bởi ${session.createdByName}` : ""}${open ? "" : ` · đã đóng ${session.closedAt ? formatDateTime(session.closedAt) : ""}${session.closedByName ? ` bởi ${session.closedByName}` : ""}`}`}
        actions={
          <>
            <Link className="btn btn-secondary" href="/inventory"><ArrowLeft size={16} /> Các đợt kiểm kê</Link>
            {/* Tải file qua route handler: dùng <a> thường để không prefetch. */}
            <a className="btn btn-secondary" href={`/inventory/${session.id}/export`} download><Download size={16} /> Xuất biên bản</a>
          </>
        }
      />

      <InventoryChecklist sessionId={session.id} items={items.map(({ checkedAt: _at, checkedByName: _by, ...rest }) => rest)} canCheck={canCheck && open} open={open} />

      {canManage && open ? (
        <Card>
          <CardContent>
            <form action={closeInventoryAction} className="inventory-close">
              <input type="hidden" name="sessionId" value={session.id} />
              <div>
                <strong>Đóng đợt kiểm kê</strong>
                <p className="muted">
                  Hiện còn <b>{summary.pending}</b> máy chưa kiểm{summary.offsitePending ? ` và ${summary.offsitePending} máy ở nơi khác chưa xác nhận` : ""}. Sau khi đóng, kết quả bị khóa và không sửa được nữa; máy chưa kiểm ghi “Chưa kiểm” trong biên bản.
                </p>
              </div>
              <Button type="submit" variant="secondary">Đóng đợt</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
