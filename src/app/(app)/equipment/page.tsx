import { and, asc, eq } from "drizzle-orm";
import { Boxes, CircleCheck, PackageOpen, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { EQUIPMENT_STATUS_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { getEquipmentCategoryLabel } from "@/lib/equipment-categories";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  await requireUser();
  const [rows, groupRows, toolRows, holderRows] = await Promise.all([
    db.select({
      id: equipment.id,
      code: equipment.code,
      name: equipment.name,
      type: equipment.equipmentType,
      categoryCode: equipment.categoryCode,
      model: equipment.model,
      status: equipment.status,
      condition: equipment.condition,
      ownerGroup: groups.name,
      ownerGroupId: groups.id,
      currentGroupId: equipment.currentGroupId,
      currentHolderId: equipment.currentHolderId,
      currentLocation: equipment.currentLocation,
    })
      .from(equipment)
      .innerJoin(groups, eq(equipment.ownerGroupId, groups.id))
      .where(eq(equipment.recordStatus, "active"))
      .orderBy(asc(equipment.code)),
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name)),
    db.select({
      id: toolCatalog.id,
      code: toolCatalog.code,
      name: toolCatalog.name,
      equipmentType: toolCatalog.equipmentType,
      categoryCode: toolCatalog.categoryCode,
      specification: toolCatalog.specification,
      unit: toolCatalog.unit,
      quantity: toolCatalog.quantityOnHand,
      groupId: toolCatalog.groupId,
      groupName: groups.name,
    })
      .from(toolCatalog)
      .innerJoin(groups, eq(toolCatalog.groupId, groups.id))
      .where(and(eq(toolCatalog.isActive, true), eq(toolCatalog.recordStatus, "active")))
      .orderBy(asc(groups.name), asc(toolCatalog.code), asc(toolCatalog.name)),
    db.select({ id: users.id, fullName: users.fullName }).from(users),
  ]);

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const holderMap = new Map(holderRows.map((user) => [user.id, user.fullName]));

  return (
    <>
      <PageHeader
        title="Dụng cụ toàn xưởng"
        description="Trang tra cứu tập trung, chỉ xem. Việc thêm và cập nhật dụng cụ được thực hiện tại Dụng cụ nhóm tôi."
      />
      <section className="stat-grid">
        <StatCard title="Máy/CCDC có mã" value={rows.length} icon={Boxes} tone="primary" />
        <StatCard title="Sẵn sàng tại nhóm" value={rows.filter((row) => row.status === "in_use_owner").length} icon={CircleCheck} tone="success" />
        <StatCard title="Đang trong quy trình" value={rows.filter((row) => !["in_use_owner", "disposal_warehouse"].includes(row.status)).length} icon={Wrench} tone="warning" />
        <StatCard title="Danh mục theo số lượng" value={toolRows.length} icon={PackageOpen} tone="violet" />
      </section>

      <Card className="table-card">
        <CardHeader><CardTitle>Danh mục máy/CCDC có mã</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Mã", "Tên máy", "Nhóm thiết bị", "Loại", "Nhóm quản lý", "Nhóm đang dùng", "Người giữ", "Vị trí", "Tình trạng", "Trạng thái"]}
            rows={rows.map((row) => [
              <strong key="code">{row.code}</strong>,
              <div key="name" className="asset-name-cell"><strong>{row.name}</strong><small>{row.model || "Chưa có model"}</small></div>,
              getEquipmentCategoryLabel(row.categoryCode),
              row.type,
              row.ownerGroup,
              groupMap.get(row.currentGroupId) || "—",
              row.currentHolderId ? holderMap.get(row.currentHolderId) || "—" : "—",
              row.currentLocation || "—",
              <StatusBadge key="condition" label={CONDITION_LABELS[row.condition]} tone={row.condition === "good" ? "success" : row.condition === "irreparable" ? "danger" : "warning"} />,
              <StatusBadge key="status" label={EQUIPMENT_STATUS_LABELS[row.status]} tone={row.status === "in_use_owner" ? "success" : row.status === "disposal_warehouse" ? "danger" : "info"} />,
            ])}
            empty={<EmptyState description="Chưa có máy/CCDC đã hoàn thành hồ sơ." />}
          />
        </CardContent>
      </Card>

      <Card className="table-card section-gap">
        <CardHeader><CardTitle>Dụng cụ quản lý theo số lượng</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Mã", "Tên dụng cụ", "Nhóm thiết bị", "Loại", "Quy cách", "Nhóm quản lý", "Số lượng"]}
            rows={toolRows.map((tool) => [
              <strong key="code">{tool.code || "—"}</strong>,
              tool.name,
              getEquipmentCategoryLabel(tool.categoryCode),
              tool.equipmentType,
              tool.specification || "—",
              tool.groupName,
              <span key="quantity" className="numeric"><strong>{tool.quantity}</strong> {tool.unit}</span>,
            ])}
            empty={<EmptyState description="Chưa có dụng cụ theo số lượng đã hoàn thành hồ sơ." />}
          />
        </CardContent>
      </Card>
    </>
  );
}
