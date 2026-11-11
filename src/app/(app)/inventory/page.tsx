import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { createInventoryAction } from "@/actions/inventory";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { requireUser } from "@/lib/auth/guards";
import { loadOperationalGroups } from "@/lib/equipment-data";
import { canManageInventory } from "@/lib/inventory";
import { loadInventoryList } from "@/lib/inventory-data";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InventoryListPage() {
  const auth = await requireUser();
  const [sessions, operationalGroups] = await Promise.all([loadInventoryList(auth), loadOperationalGroups()]);
  const manageable = operationalGroups.filter((group) => canManageInventory(auth, group.id));
  const openGroupIds = new Set(sessions.filter((s) => s.status === "open").map((s) => s.groupId));

  return (
    <div className="inventory-page">
      <PageHeader
        title="Kiểm kê CCDC"
        description="Mở đợt kiểm kê cho nhóm, rồi kiểm từng máy ngay trên điện thoại: quét QR trên máy bằng camera hoặc bấm trong danh sách. Xuất biên bản Excel khi đóng đợt."
      />

      {manageable.length ? (
        <Card>
          <CardHeader><CardTitle>Mở đợt kiểm kê mới</CardTitle><ClipboardCheck size={18} /></CardHeader>
          <CardContent>
            <form action={createInventoryAction} className="inventory-create">
              <FormField label="Nhóm quản lý" required>
                <select name="groupId" required defaultValue={manageable.length === 1 ? manageable[0].id : ""}>
                  {manageable.length > 1 ? <option value="">— Chọn nhóm —</option> : null}
                  {manageable.map((group) => <option key={group.id} value={group.id}>{group.name}{openGroupIds.has(group.id) ? " (đang có đợt mở)" : ""}</option>)}
                </select>
              </FormField>
              <FormField label="Ghi chú đợt (tùy chọn)" hint="Ví dụ: Kiểm kê cuối quý 4/2026">
                <input name="title" maxLength={180} placeholder="Kiểm kê cuối quý…" />
              </FormField>
              <Button type="submit">Mở đợt kiểm kê</Button>
            </form>
            <p className="muted inventory-note">
              Danh sách máy cần kiểm được chụp lúc mở đợt: máy thuộc nhóm và máy nhóm đang mượn giữ. Máy đang cho mượn / đang sửa vẫn có trong danh sách nhưng ghi “nơi khác”.
              Mỗi nhóm chỉ có một đợt mở tại một thời điểm.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Các đợt kiểm kê</CardTitle></CardHeader>
        <CardContent>
          {sessions.length ? (
            <div className="inventory-list">
              {sessions.map((s) => {
                const percent = s.onsite ? Math.round((s.checkedOnsite / s.onsite) * 100) : 100;
                return (
                  <Link key={s.id} href={`/inventory/${s.id}`} className="inventory-card" data-status={s.status}>
                    <div className="inventory-card-head">
                      <strong>{s.code}</strong>
                      <span className="inventory-state">{s.status === "open" ? "Đang mở" : "Đã đóng"}</span>
                    </div>
                    <span>{s.groupName}{s.title ? ` · ${s.title}` : ""}</span>
                    <div className="inventory-bar" aria-label={`Đã kiểm ${percent}%`}><i style={{ width: `${percent}%` }} /></div>
                    <small>
                      {s.checkedOnsite}/{s.onsite} máy đã kiểm · {s.found} có mặt · <b className={s.missing ? "inventory-missing" : ""}>{s.missing} không thấy</b>
                      {" · "}mở {formatDate(s.createdAt)}{s.createdByName ? ` bởi ${s.createdByName}` : ""}
                    </small>
                  </Link>
                );
              })}
            </div>
          ) : <EmptyState title="Chưa có đợt kiểm kê" description={manageable.length ? "Mở đợt đầu tiên ở khung phía trên." : "Đốc công nhóm hoặc Quản lý Xưởng sẽ mở đợt kiểm kê."} />}
        </CardContent>
      </Card>
    </div>
  );
}
