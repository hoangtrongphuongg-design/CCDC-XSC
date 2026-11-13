import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, QrCode } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { conditionTone as conditionToneOf, equipmentStatusTone } from "@/lib/status-style";
import { requireUser } from "@/lib/auth/guards";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { getEquipmentCategoryLabel } from "@/lib/equipment-categories";
import { loadMachineProfile } from "@/lib/machine-profile-data";
import { loadInventoryPromptsForMachine } from "@/lib/inventory-data";
import { markInventoryFromProfileAction } from "@/actions/inventory";
import { INVENTORY_RESULT_LABELS } from "@/lib/inventory";
import { ORIGIN_LABELS } from "@/lib/machine-profile";
import { canPrintLabels } from "@/lib/labels";
import { equipmentStatusDisplay } from "@/lib/repair-display";
import { dmy, formatVnd } from "@/lib/reports";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="profile-field"><dt>{label}</dt><dd>{children || "—"}</dd></div>;
}

export default async function MachineProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  const { id } = await params;
  const profile = await loadMachineProfile(auth, id);
  if (!profile) notFound();
  const { machine, groupNames, heldByGroupName, tickets, locationText, activeRepairType, history, showFinancials, inMyScope } = profile;
  // Hồ sơ nháp (chưa hoàn thành) chỉ người trong phạm vi máy mới xem.
  if (machine.recordStatus !== "active" && !inMyScope) notFound();

  const name = (gid: string) => groupNames.get(gid) ?? "—";
  const inventoryPrompts = await loadInventoryPromptsForMachine(auth, machine.id, [machine.ownerGroupId]);
  const statusTone = equipmentStatusTone(machine.status);
  const conditionTone = conditionToneOf(machine.condition);

  return (
    <div className="profile-page">
      <PageHeader
        title={machine.name}
        description={`Mã hệ thống ${machine.code}${machine.legacyCode ? ` · Tem nhôm ${machine.legacyCode}` : ""}`}
        actions={
          <>
            <Link className="btn btn-secondary" href={`/equipment?q=${encodeURIComponent(machine.code)}`}><ArrowLeft size={16} /> Dụng cụ toàn xưởng</Link>
            {canPrintLabels(auth) ? <Link className="btn btn-secondary" href={`/labels?ids=${machine.id}`}><QrCode size={16} /> In tem QR</Link> : null}
            {inMyScope ? <Link className="btn btn-primary" href="/my-equipment"><ClipboardList size={16} /> Dụng cụ nhóm tôi</Link> : null}
          </>
        }
      />

      {inventoryPrompts.map((prompt) => (
        <section className="inventory-prompt" key={prompt.sessionId} aria-label={`Kiểm kê ${prompt.code}`}>
          <div>
            <strong>Đang kiểm kê {prompt.code}</strong>
            <span>{prompt.groupName}</span>
            <small>
              {prompt.result ? `Máy này: ${INVENTORY_RESULT_LABELS[prompt.result]}` : prompt.inList ? "Máy này chưa được kiểm." : "Máy này không có trong danh sách — nếu đang thấy tại nhóm, ghi nhận là máy thừa."}
            </small>
          </div>
          <form action={markInventoryFromProfileAction} className="inventory-prompt-actions">
            <input type="hidden" name="sessionId" value={prompt.sessionId} />
            <input type="hidden" name="equipmentId" value={machine.id} />
            {prompt.result ? (
              <button type="submit" name="result" value="undo" className="btn btn-secondary">Hoàn tác</button>
            ) : (
              <>
                <button type="submit" name="result" value="found" className="btn btn-primary">Có mặt</button>
                {prompt.inList ? <button type="submit" name="result" value="missing" className="btn btn-secondary">Không thấy</button> : null}
              </>
            )}
          </form>
        </section>
      ))}

      {machine.recordStatus !== "active" ? <p className="notice warning">Hồ sơ máy này chưa hoàn thành (bản nháp), chưa thể dùng trong nghiệp vụ.</p> : null}
      {machine.archivedAt ? <p className="notice warning">Máy này đã được lưu trữ.</p> : null}

      <div className="profile-badges">
        <StatusBadge label={equipmentStatusDisplay(machine.status, activeRepairType)} tone={statusTone} />
        <StatusBadge label={CONDITION_LABELS[machine.condition] ?? machine.condition} tone={conditionTone} />
        {heldByGroupName ? <StatusBadge label={`Đang ở ${heldByGroupName} (mượn)`} tone="info" /> : null}
      </div>

      <div className="content-grid equal">
        <Card>
          <CardHeader><CardTitle>Hiện tại</CardTitle></CardHeader>
          <CardContent>
            <dl className="profile-dl">
              <Field label="Nhóm quản lý">{name(machine.ownerGroupId)}</Field>
              <Field label="Nhóm đang giữ">{heldByGroupName ? `${heldByGroupName} (đang mượn)` : name(machine.ownerGroupId)}</Field>
              <Field label="Vị trí">{locationText}</Field>
              <Field label="Cập nhật lần cuối">{formatDateTime(machine.updatedAt)}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Phiếu đang mở ({tickets.length})</CardTitle></CardHeader>
          <CardContent>
            {tickets.length ? (
              <div className="report-table">
                <DataTable
                  headers={["Loại", "Mã phiếu", "Trạng thái", "Nhóm"]}
                  rows={tickets.map((t) => [t.kind, <Link key="code" href={t.href}><b>{t.code}</b></Link>, t.statusLabel, t.groups])}
                />
              </div>
            ) : <EmptyState title="Không có phiếu nào đang mở" description="Máy không đang mượn, điều chuyển, sửa chữa hay thanh lý." />}
          </CardContent>
        </Card>
      </div>

      <div className="content-grid equal">
        <Card>
          <CardHeader><CardTitle>Thông tin kỹ thuật</CardTitle></CardHeader>
          <CardContent>
            <dl className="profile-dl">
              <Field label="Loại">{machine.equipmentType}</Field>
              <Field label="Nhóm thiết bị">{getEquipmentCategoryLabel(machine.categoryCode)}</Field>
              <Field label="Hãng">{machine.brand}</Field>
              <Field label="Model">{machine.model}</Field>
              <Field label="Serial">{machine.serial}</Field>
              <Field label="Năm sản xuất">{machine.manufactureYear}</Field>
              <Field label="Năm đưa vào sử dụng">{machine.commissionYear}</Field>
            </dl>
            {machine.technicalSpecs ? <div className="profile-text"><b>Thông số kỹ thuật</b><p>{machine.technicalSpecs}</p></div> : null}
            {machine.technicalNote ? <div className="profile-text"><b>Ghi chú kỹ thuật</b><p>{machine.technicalNote}</p></div> : null}
            {machine.notes ? <div className="profile-text"><b>Ghi chú</b><p>{machine.notes}</p></div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nguồn gốc{showFinancials ? " & mua sắm" : ""}</CardTitle></CardHeader>
          <CardContent>
            <dl className="profile-dl">
              <Field label="Nguồn hình thành">{ORIGIN_LABELS[machine.originType] ?? machine.originType}</Field>
              <Field label="Nhóm cấp mã gốc">{name(machine.originGroupId)}</Field>
              <Field label="Ngày ghi nhận">{machine.recordedDate ? dmy(machine.recordedDate) : null}</Field>
              {showFinancials ? (
                <>
                  <Field label="Ngày mua / tiếp nhận">{machine.purchaseDate ? dmy(machine.purchaseDate) : null}</Field>
                  <Field label="Số PO / hợp đồng">{machine.poContractNo}</Field>
                  <Field label="Nhà cung cấp">{machine.supplierName}</Field>
                  <Field label="Đơn giá">{machine.purchasePrice ? formatVnd(Number(machine.purchasePrice)) : null}</Field>
                  <Field label="Bảo hành đến">{machine.warrantyUntil ? dmy(machine.warrantyUntil) : null}</Field>
                </>
              ) : null}
            </dl>
            {showFinancials && machine.purchaseNote ? <div className="profile-text"><b>Ghi chú mua sắm</b><p>{machine.purchaseNote}</p></div> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lịch sử{history ? ` (${history.length})` : ""}</CardTitle></CardHeader>
        <CardContent>
          {history === null ? (
            <EmptyState title="Không có quyền xem lịch sử" description="Lịch sử máy chỉ hiện với nhóm quản lý, nhóm đang giữ hoặc vai trò xem toàn Xưởng." />
          ) : history.length ? (
            <div className="report-table">
              <DataTable
                headers={["Thời gian", "Người thực hiện", "Nội dung"]}
                rows={history.map((h) => [formatDateTime(h.createdAt), h.actor || "Hệ thống", <span key="d">{h.description}{h.reason ? <small className="search-serial"> · Lý do: {h.reason}</small> : null}</span>])}
              />
            </div>
          ) : <EmptyState title="Chưa có lịch sử" description="Chưa ghi nhận thay đổi nào cho máy này." />}
        </CardContent>
      </Card>
    </div>
  );
}
