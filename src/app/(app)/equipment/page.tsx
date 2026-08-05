import { asc, eq } from "drizzle-orm";
import { Boxes, CircleCheck, PackageOpen, Plus, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { EQUIPMENT_STATUS_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { createEquipmentAction, createGroupToolAction } from "@/actions/equipment";

export default async function EquipmentPage() {
  const auth = await requireUser();
  const [rows, groupRows, toolRows, holderRows] = await Promise.all([
    db.select({
      id: equipment.id,
      code: equipment.code,
      name: equipment.name,
      type: equipment.equipmentType,
      model: equipment.model,
      status: equipment.status,
      condition: equipment.condition,
      ownerGroup: groups.name,
      ownerGroupId: groups.id,
      currentGroupId: equipment.currentGroupId,
      currentHolderId: equipment.currentHolderId,
      currentLocation: equipment.currentLocation,
    }).from(equipment).innerJoin(groups, eq(equipment.ownerGroupId, groups.id)).orderBy(asc(equipment.code)),
    db.select({ id: groups.id, name: groups.name, isSystem: groups.isSystem }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({ id: toolCatalog.id, name: toolCatalog.name, specification: toolCatalog.specification, unit: toolCatalog.unit, quantity: toolCatalog.quantityOnHand, groupId: toolCatalog.groupId, groupName: groups.name }).from(toolCatalog).innerJoin(groups, eq(toolCatalog.groupId, groups.id)).where(eq(toolCatalog.isActive, true)).orderBy(asc(groups.name), asc(toolCatalog.name)),
    db.select({ id: users.id, fullName: users.fullName }).from(users),
  ]);
  const groupMap = new Map(groupRows.map((g) => [g.id, g.name]));
  const holderMap = new Map(holderRows.map((u) => [u.id, u.fullName]));
  const manageable = groupRows.filter((g) => !g.isSystem && auth.permissions.some((p) => p.groupId === g.id && p.level === "manager"));

  return (
    <>
      <PageHeader title="Dụng cụ toàn xưởng" description="Danh mục tập trung cho toàn bộ máy có mã và dụng cụ nhỏ; thao tác được giới hạn theo quyền nhóm." />
      <section className="stat-grid">
        <StatCard title="Máy/CCDC có mã" value={rows.length} icon={Boxes} tone="primary" />
        <StatCard title="Sẵn sàng tại nhóm" value={rows.filter((row) => row.status === "in_use_owner").length} icon={CircleCheck} tone="success" />
        <StatCard title="Đang trong quy trình" value={rows.filter((row) => !["in_use_owner", "disposal_warehouse"].includes(row.status)).length} icon={Wrench} tone="warning" />
        <StatCard title="Dụng cụ nhỏ" value={toolRows.length} icon={PackageOpen} tone="violet" />
      </section>
      <div className="content-grid">
        <Card className="table-card">
          <CardHeader><CardTitle>Danh mục máy/CCDC có mã</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              headers={["Mã", "Tên máy", "Loại", "Model", "Nhóm quản lý", "Nhóm đang dùng", "Người giữ", "Vị trí", "Tình trạng", "Trạng thái"]}
              rows={rows.map((r) => [
                <strong key="code">{r.code}</strong>,
                r.name,
                r.type,
                r.model || "—",
                r.ownerGroup,
                groupMap.get(r.currentGroupId) || "—",
                r.currentHolderId ? holderMap.get(r.currentHolderId) || "—" : "—",
                r.currentLocation || "—",
                <StatusBadge key="condition" label={CONDITION_LABELS[r.condition]} tone={r.condition === "good" ? "success" : r.condition === "irreparable" ? "danger" : "warning"} />,
                <StatusBadge key="status" label={EQUIPMENT_STATUS_LABELS[r.status]} tone={r.status === "in_use_owner" ? "success" : r.status === "disposal_warehouse" ? "danger" : "info"} />,
              ])}
              empty={<EmptyState description="Chưa có máy. Có thể import từ Excel hoặc tạo mới." />}
            />
          </CardContent>
        </Card>
        <Card className="side-panel">
          <CardHeader><CardTitle>Thêm máy/CCDC có mã</CardTitle><Plus size={18} /></CardHeader>
          <CardContent>
            {manageable.length ? (
              <form action={createEquipmentAction} className="form-grid">
                <FormField label="Mã máy" required><input name="code" /></FormField>
                <FormField label="Tên máy" required><input name="name" /></FormField>
                <FormField label="Loại máy" required><input name="equipmentType" /></FormField>
                <FormField label="Model/thông số"><input name="model" /></FormField>
                <FormField label="Hãng"><input name="brand" /></FormField>
                <FormField label="Nhóm quản lý" required><select name="ownerGroupId">{manageable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
                <FormField label="Vị trí hiện tại"><input name="currentLocation" /></FormField>
                <Button type="submit">Tạo máy</Button>
              </form>
            ) : <EmptyState title="Chỉ xem" description="Tài khoản chưa có quyền manager tại nhóm nào." />}
          </CardContent>
        </Card>
      </div>
      <div className="content-grid section-gap">
        <Card className="table-card">
          <CardHeader><CardTitle>Dụng cụ nhóm không có mã máy</CardTitle></CardHeader>
          <CardContent>
            <DataTable headers={["Tên dụng cụ", "Quy cách", "Nhóm quản lý", "Số lượng"]} rows={toolRows.map((t) => [t.name, t.specification || "—", t.groupName, `${t.quantity} ${t.unit}`])} empty={<EmptyState description="Chưa có danh mục dụng cụ nhỏ." />} />
          </CardContent>
        </Card>
        <Card className="side-panel">
          <CardHeader><CardTitle>Thêm dụng cụ nhóm</CardTitle></CardHeader>
          <CardContent>
            {auth.permissions.length ? <form action={createGroupToolAction} className="form-grid">
              <FormField label="Nhóm quản lý" required><select name="groupId">{auth.permissions.filter((g) => g.groupCode !== "KHO_TL").map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></FormField>
              <FormField label="Tên dụng cụ" required><input name="name" placeholder="Ví dụ: Taro M20" /></FormField>
              <FormField label="Quy cách"><input name="specification" /></FormField>
              <div className="form-grid two"><FormField label="Số lượng"><input name="quantityOnHand" type="number" min="0" step="0.01" defaultValue="0" /></FormField><FormField label="Đơn vị"><input name="unit" defaultValue="cái" /></FormField></div>
              <Button type="submit">Thêm dụng cụ</Button>
            </form> : <EmptyState title="Chỉ xem" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
