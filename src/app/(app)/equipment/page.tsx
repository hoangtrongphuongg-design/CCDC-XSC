import { and, asc, eq } from "drizzle-orm";
import { Boxes, CircleCheck, PackageOpen, Search, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, toolCatalog } from "@/lib/db/schema";
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

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q = "" } = await searchParams;
  const searchText = q.trim();
  const normalizedSearch = searchText.toLocaleLowerCase("vi-VN");

  const [rows, groupRows, toolRows] = await Promise.all([
    db.select({
      id: equipment.id,
      code: equipment.code,
      legacyCode: equipment.legacyCode,
      name: equipment.name,
      type: equipment.equipmentType,
      categoryCode: equipment.categoryCode,
      model: equipment.model,
      status: equipment.status,
      condition: equipment.condition,
      ownerGroup: groups.name,
      ownerGroupId: equipment.ownerGroupId,
      currentGroupId: equipment.currentGroupId,
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
  ]);

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const containsSearch = (...values: Array<string | null | undefined>) => !normalizedSearch || values.some((value) =>
    value?.toLocaleLowerCase("vi-VN").includes(normalizedSearch),
  );
  const filteredRows = rows.filter((row) => containsSearch(
    row.code,
    row.legacyCode,
    row.name,
    row.model,
    row.type,
    getEquipmentCategoryLabel(row.categoryCode),
    row.ownerGroup,
    groupMap.get(row.currentGroupId),
    row.currentLocation,
    CONDITION_LABELS[row.condition],
    EQUIPMENT_STATUS_LABELS[row.status],
  ));
  const filteredToolRows = toolRows.filter((tool) => containsSearch(
    tool.code,
    tool.name,
    tool.equipmentType,
    getEquipmentCategoryLabel(tool.categoryCode),
    tool.specification,
    tool.groupName,
    tool.unit,
  ));

  const searchGroupStats = Array.from(
    filteredRows.reduce((map, row) => {
      map.set(row.ownerGroup, (map.get(row.ownerGroup) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));

  return (
    <>
      <PageHeader
        title="Dụng cụ toàn xưởng"
        description="Trang tra cứu tập trung, chỉ xem. Việc thêm và cập nhật dụng cụ được thực hiện tại Dụng cụ nhóm tôi."
        actions={
          <form className="workshop-equipment-search" action="/equipment" method="get" role="search">
            <span className="workshop-search-icon" aria-hidden="true"><Search size={18} /></span>
            <input
              name="q"
              defaultValue={searchText}
              placeholder="Mã, tên máy, loại, nhóm, vị trí..."
              aria-label="Tìm dụng cụ toàn xưởng"
            />
            <button type="submit">Tìm</button>
          </form>
        }
      />

      <section className="stat-grid">
        <StatCard title="Máy/CCDC có mã" value={rows.length} icon={Boxes} tone="primary" />
        <StatCard title="Sẵn sàng tại nhóm" value={rows.filter((row) => row.status === "in_use_owner").length} icon={CircleCheck} tone="success" />
        <StatCard title="Đang trong quy trình" value={rows.filter((row) => !["in_use_owner", "disposal_warehouse"].includes(row.status)).length} icon={Wrench} tone="warning" />
        <StatCard title="Danh mục theo số lượng" value={toolRows.length} icon={PackageOpen} tone="primary" />
      </section>

      {searchText ? (
        <section className="search-group-dashboard" aria-label="Thống kê kết quả tìm kiếm theo nhóm quản lý">
          <div className="search-group-dashboard__header">
            <div>
              <span>Kết quả tìm “{searchText}”</span>
              <strong>Phân bố Máy/CCDC có mã theo nhóm quản lý</strong>
            </div>
            <b>{filteredRows.length} máy/CCDC</b>
          </div>
          {searchGroupStats.length ? (
            <div className="search-group-dashboard__items">
              {searchGroupStats.map((item) => (
                <div className="search-group-chip" key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="search-group-dashboard__empty">Không có Máy/CCDC có mã phù hợp để thống kê theo nhóm.</p>
          )}
        </section>
      ) : null}

      <Card className="table-card">
        <CardHeader><CardTitle>Danh mục máy/CCDC có mã</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Mã", "Mã hiện hữu", "Tên máy", "Nhóm thiết bị", "Loại", "Nhóm quản lý", "Nhóm đang dùng", "Vị trí", "Tình trạng", "Trạng thái"]}
            rows={filteredRows.map((row) => [
              <strong key="code">{row.code}</strong>,
              row.legacyCode || "—",
              <div key="name" className="asset-name-cell"><strong>{row.name}</strong><small>{row.model || "Chưa có model"}</small></div>,
              getEquipmentCategoryLabel(row.categoryCode),
              row.type,
              row.ownerGroup,
              groupMap.get(row.currentGroupId) || "—",
              row.currentLocation || "—",
              <StatusBadge key="condition" label={CONDITION_LABELS[row.condition]} tone={row.condition === "good" ? "success" : row.condition === "irreparable" ? "danger" : "warning"} />,
              <StatusBadge key="status" label={EQUIPMENT_STATUS_LABELS[row.status]} tone={row.status === "in_use_owner" ? "success" : row.status === "disposal_warehouse" ? "danger" : "info"} />,
            ])}
            empty={<EmptyState description={searchText ? `Không tìm thấy máy/CCDC phù hợp với “${searchText}”.` : "Chưa có máy/CCDC đã hoàn thành hồ sơ."} />}
          />
        </CardContent>
      </Card>

      <Card className="table-card section-gap">
        <CardHeader><CardTitle>Dụng cụ quản lý theo số lượng</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            headers={["Mã", "Tên dụng cụ", "Nhóm thiết bị", "Loại", "Quy cách", "Nhóm quản lý", "Số lượng"]}
            rows={filteredToolRows.map((tool) => [
              <strong key="code">{tool.code || "—"}</strong>,
              tool.name,
              getEquipmentCategoryLabel(tool.categoryCode),
              tool.equipmentType,
              tool.specification || "—",
              tool.groupName,
              <span key="quantity" className="numeric"><strong>{tool.quantity}</strong> {tool.unit}</span>,
            ])}
            empty={<EmptyState description={searchText ? `Không tìm thấy dụng cụ theo số lượng phù hợp với “${searchText}”.` : "Chưa có dụng cụ theo số lượng đã hoàn thành hồ sơ."} />}
          />
        </CardContent>
      </Card>
    </>
  );
}
