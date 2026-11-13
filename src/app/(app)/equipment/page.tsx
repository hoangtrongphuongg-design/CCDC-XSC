import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { equipmentStatusDisplay } from "@/lib/repair-display";
import { Boxes, CircleCheck, FileSpreadsheet, PackageOpen, Search, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, repairs, toolCatalog } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { EQUIPMENT_STATUS_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_DISCIPLINE_LABELS, getEquipmentCategoryLabel, type EquipmentDiscipline } from "@/lib/equipment-categories";
import {
  CONDITION_FILTER_OPTIONS,
  IN_PROCESS,
  IN_PROCESS_LABEL,
  buildFilterHref,
  describeFilters,
  filtersHideTools,
  hasActiveFilters,
  matchesEquipmentFilters,
  matchesToolFilters,
  parseEquipmentFilters,
} from "@/lib/equipment-filter";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { SafeText } from "@/components/safe-text";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { conditionTone, equipmentStatusTone } from "@/lib/status-style";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const filters = parseEquipmentFilters(await searchParams);
  const searchText = filters.q;
  const normalizedSearch = searchText.toLocaleLowerCase("vi-VN");

  const [rows, groupRows, toolRows, openRepairs] = await Promise.all([
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
    // Máy đang sửa: nội bộ hay thuê ngoài lấy từ phiếu sửa đang mở.
    db.select({ equipmentId: repairs.equipmentId, repairType: repairs.repairType }).from(repairs).where(eq(repairs.status, "repairing")),
  ]);
  const repairTypeByEquipment = new Map(openRepairs.map((repair) => [repair.equipmentId, repair.repairType]));
  const statusText = (row: { id: string; status: keyof typeof EQUIPMENT_STATUS_LABELS }) => equipmentStatusDisplay(row.status, repairTypeByEquipment.get(row.id));

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const containsSearch = (...values: Array<string | null | undefined>) => !normalizedSearch || values.some((value) =>
    value?.toLocaleLowerCase("vi-VN").includes(normalizedSearch),
  );
  const filteredRows = rows.filter((row) => matchesEquipmentFilters(row, filters)).filter((row) => containsSearch(
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
    statusText(row),
  ));
  const hideTools = filtersHideTools(filters);
  const filteredToolRows = hideTools ? [] : toolRows.filter((tool) => matchesToolFilters(tool, filters)).filter((tool) => containsSearch(
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
      />

      <section className="stat-grid">
        <Link className={`stat-card-link${!hasActiveFilters(filters, false) ? " is-active" : ""}`} href={buildFilterHref("/equipment", { ...filters, group: "", status: "", condition: "", category: "" })}>
          <StatCard title="Máy/CCDC có mã" value={rows.length} icon={Boxes} tone="primary" />
        </Link>
        <Link className={`stat-card-link${filters.status === "in_use_owner" ? " is-active" : ""}`} href={buildFilterHref("/equipment", filters, { override: { status: "in_use_owner" } })}>
          <StatCard title="Sẵn sàng tại nhóm" value={rows.filter((row) => row.status === "in_use_owner").length} icon={CircleCheck} tone="success" />
        </Link>
        <Link className={`stat-card-link${filters.status === IN_PROCESS ? " is-active" : ""}`} href={buildFilterHref("/equipment", filters, { override: { status: IN_PROCESS } })}>
          <StatCard title="Đang trong quy trình" value={rows.filter((row) => !["in_use_owner", "disposal_warehouse"].includes(row.status)).length} icon={Wrench} tone="warning" />
        </Link>
        <a className="stat-card-link" href="#cc-so-luong">
          <StatCard title="Danh mục theo số lượng" value={toolRows.length} icon={PackageOpen} tone="primary" />
        </a>
      </section>

      <section className="equipment-global-search" aria-labelledby="equipment-search-title">
        <h2 className="equipment-search-title" id="equipment-search-title">Tìm kiếm toàn hệ thống</h2>
        <form className="equipment-search-form" action="/search" method="get" role="search">
          <label>
            <span className="sr-only">Từ khóa tìm kiếm</span>
            <input name="q" type="search" minLength={2} maxLength={120} placeholder="Mã hệ thống, tem nhôm, serial, tên máy, mã phiếu…" autoComplete="off" />
          </label>
          <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden="true" /> Tìm</button>
        </form>
        <p className="equipment-search-hint">Tìm máy, CCDC theo số lượng và các loại phiếu (mượn, điều chuyển, sửa chữa, thanh lý) trong toàn bộ dữ liệu của hệ thống.</p>
      </section>

      <section className="equipment-filter-panel" aria-labelledby="equipment-filter-title">
        <h2 className="equipment-filter-title" id="equipment-filter-title">Bộ lọc{hasActiveFilters(filters) ? " (đang lọc)" : ""}</h2>
        <form className="equipment-filter-bar" action="/equipment" method="get">
          {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
          <label>
            <span>Nhóm quản lý</span>
            <select name="group" defaultValue={filters.group}>
              <option value="">Tất cả nhóm</option>
              {groupRows.filter((group) => new Set([...rows.map((row) => row.ownerGroupId), ...toolRows.map((tool) => tool.groupId)]).has(group.id)).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select name="status" defaultValue={filters.status}>
              <option value="">Tất cả trạng thái</option>
              <option value={IN_PROCESS}>{IN_PROCESS_LABEL}</option>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Tình trạng</span>
            <select name="condition" defaultValue={filters.condition}>
              <option value="">Tất cả tình trạng</option>
              {CONDITION_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Nhóm thiết bị</span>
            <select name="category" defaultValue={filters.category}>
              <option value="">Tất cả nhóm thiết bị</option>
              {(["mechanical", "electrical", "other"] as EquipmentDiscipline[]).map((discipline) => (
                <optgroup key={discipline} label={EQUIPMENT_DISCIPLINE_LABELS[discipline]}>
                  {EQUIPMENT_CATEGORIES.filter((category) => category.discipline === discipline).map((category) => <option key={category.code} value={category.code}>{category.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="equipment-filter-actions">
            <button type="submit" className="btn btn-primary">Lọc</button>
            {hasActiveFilters(filters) ? <Link className="btn btn-secondary" href="/equipment">Xóa bộ lọc</Link> : null}
            {/* Tải file qua route handler: dùng <a> thường, không dùng next/link để không prefetch. Xuất đúng phần đang lọc. */}
            <a
              className="btn btn-secondary"
              href={buildFilterHref("/equipment/export", filters)}
              download
              title={hasActiveFilters(filters) ? "Xuất Excel đúng phần đang lọc" : "Xuất Excel toàn bộ dụng cụ, phân theo nhóm"}
            >
              <FileSpreadsheet size={16} aria-hidden="true" /> Xuất Excel{hasActiveFilters(filters) ? " (đang lọc)" : ""}
            </a>
          </div>
        </form>
      </section>

      {hasActiveFilters(filters) ? (
        <div className="equipment-filter-chips" aria-label="Bộ lọc đang áp dụng">
          <span>Hiển thị <b>{filteredRows.length}</b> / {rows.length} máy</span>
          {describeFilters(filters, { groupName: (id) => groupMap.get(id) ?? "—" }).map((chip) => (
            <Link key={chip.key} className="filter-chip" href={buildFilterHref("/equipment", filters, { omit: chip.key })} aria-label={`Bỏ lọc ${chip.text}`}>{chip.text} <span aria-hidden="true">✕</span></Link>
          ))}
        </div>
      ) : null}

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
            headers={["Mã hệ thống", "Tem nhôm", "Tên máy", "Nhóm quản lý", "Nhóm đang dùng", "Vị trí", "Tình trạng", "Trạng thái"]}
            rows={filteredRows.map((row) => [
              <Link key="code" href={`/equipment/${row.id}`}><strong>{row.code}</strong></Link>,
              row.legacyCode || "—",
              <div key="name" className="asset-name-cell"><strong><SafeText>{row.name}</SafeText></strong><small>{row.model || "Chưa có model"}</small></div>,
              row.ownerGroup,
              groupMap.get(row.currentGroupId) || "—",
              row.currentLocation || "—",
              <StatusBadge key="condition" label={CONDITION_LABELS[row.condition]} tone={conditionTone(row.condition)} />,
              <StatusBadge key="status" label={statusText(row)} tone={equipmentStatusTone(row.status)} />,
            ])}
            empty={<EmptyState description={searchText ? `Không tìm thấy máy/CCDC phù hợp với “${searchText}”.` : "Chưa có máy/CCDC đã hoàn thành hồ sơ."} />}
          />
        </CardContent>
      </Card>

      <Card className="table-card section-gap" id="cc-so-luong">
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
            empty={<EmptyState description={hideTools ? "Bảng này không có Trạng thái / Tình trạng nên được ẩn khi đang lọc hai mục đó. Bỏ lọc để xem lại." : hasActiveFilters(filters) ? "Không có dụng cụ theo số lượng phù hợp với bộ lọc / từ khóa." : "Chưa có dụng cụ theo số lượng đã hoàn thành hồ sơ."} />}
          />
        </CardContent>
      </Card>
    </>
  );
}
