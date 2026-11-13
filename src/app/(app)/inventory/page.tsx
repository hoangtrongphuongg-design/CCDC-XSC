import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { createInventoryAction, runMonthlyInventoryAction } from "@/actions/inventory";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { requireUser } from "@/lib/auth/guards";
import { loadOperationalGroups } from "@/lib/equipment-data";
import { canOpenInventory } from "@/lib/inventory";
import { loadInventoryList } from "@/lib/inventory-data";
import { INVENTORY_DEADLINE_DAY, daysUntilDeadline, periodOf } from "@/lib/inventory-schedule";
import { vnDate } from "@/lib/export/equipment-export";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InventoryListPage() {
  const auth = await requireUser();
  const [sessions, operationalGroups] = await Promise.all([loadInventoryList(auth), loadOperationalGroups()]);
  const canOpen = canOpenInventory(auth);
  const manageable = canOpen ? operationalGroups : [];
  const openGroupIds = new Set(sessions.filter((s) => s.status === "open").map((s) => s.groupId));
  const today = vnDate();
  const canRunSchedule = auth.isWorkshopAdmin && !auth.isReadOnlyViewer;

  return (
    <div className="inventory-page">
      <PageHeader
        title="Kiểm kê CCDC"
        description="Kiểm từng máy của nhóm ngay trên điện thoại: quét QR trên máy bằng camera hoặc bấm trong danh sách. Xuất biên bản Excel khi đóng đợt."
      />

      <div className="notice inventory-schedule-note">
        <b>Kiểm kê định kỳ:</b> ngày 1 hằng tháng hệ thống tự mở đợt cho mỗi nhóm có máy; Đốc công nhóm kiểm trong tháng, hết ngày {INVENTORY_DEADLINE_DAY} đợt tự đóng. Các đợt tháng 1, 4, 7, 10 kèm đếm CCDC theo số lượng (mỗi 3 tháng một lần); đợt mở tay cũng có thể kèm.
        {canRunSchedule ? (
          <form action={runMonthlyInventoryAction} className="inventory-run-now">
            <Button type="submit" variant="secondary" size="sm">Chạy kiểm kê định kỳ ngay</Button>
            <small className="muted">Dùng khi hệ thống chưa tự mở (vd lỡ ngày 1). Chạy lại không tạo trùng.</small>
          </form>
        ) : null}
      </div>

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
              <label className="inventory-check">
                <input type="checkbox" name="includeTools" defaultChecked />
                <span>Kèm kiểm CCDC theo số lượng <small className="muted">(đếm số thực tế từng CCDC; nhóm cần có CCDC theo số lượng đang hoạt động)</small></span>
              </label>
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
                    {s.includesTools ? <small className="inventory-tools-tag">Kèm kiểm CCDC theo số lượng{s.toolTotal ? ` — đã đếm ${s.toolCounted}/${s.toolTotal}` : ""}</small> : null}
                    {s.status === "open" && s.period ? (
                      <small className="inventory-due">
                        {periodOf(today) === s.period ? `Hạn ${INVENTORY_DEADLINE_DAY}/${Number(s.period.slice(5))} — ${daysUntilDeadline(s.period, today) <= 0 ? "hôm nay là hạn chót" : `còn ${daysUntilDeadline(s.period, today)} ngày`}` : "Quá hạn, chờ hệ thống tự đóng"}
                      </small>
                    ) : null}
                    {s.autoClosed ? <small className="inventory-auto-closed">Tự đóng — còn {Math.max(s.onsite - s.checkedOnsite, 0)} máy{s.includesTools && s.toolTotal > s.toolCounted ? ` và ${s.toolTotal - s.toolCounted} CCDC số lượng` : ""} chưa kiểm</small> : null}
                    <div className="inventory-bar" aria-label={`Đã kiểm ${percent}%`}><i style={{ width: `${percent}%` }} /></div>
                    <small>
                      {s.checkedOnsite}/{s.onsite} máy đã kiểm · {s.found} có mặt · <b className={s.missing ? "inventory-missing" : ""}>{s.missing} không thấy</b>
                      {" · "}mở {formatDate(s.createdAt)}{s.createdByName ? ` bởi ${s.createdByName}` : s.period ? " bởi Hệ thống" : ""}
                    </small>
                  </Link>
                );
              })}
            </div>
          ) : <EmptyState title="Chưa có đợt kiểm kê" description={manageable.length ? "Mở đợt đầu tiên ở khung phía trên." : "Đợt kiểm kê tự mở ngày 1 hằng tháng cho mỗi nhóm có máy; Quản lý Xưởng cũng có thể mở thêm bằng tay."} />}
        </CardContent>
      </Card>
    </div>
  );
}
