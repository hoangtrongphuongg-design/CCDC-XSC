import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { equipmentStatusDisplay } from "@/lib/repair-display";
import { displayLocation } from "@/lib/location-display";
import { FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/db";
import { equipment, groups, machineLoans, repairs, toolCatalog, transfers } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_DISCIPLINE_LABELS, getEquipmentCategoryLabel, type EquipmentDiscipline } from "@/lib/equipment-categories";
import {
  CONDITION_FILTER_OPTIONS,
  buildFilterHref,
  conditionGroupOf,
  countByCondition,
  describeFilters,
  filtersHideTools,
  hasActiveFilters,
  matchesEquipmentFilters,
  matchesToolFilters,
  parseEquipmentFilters,
} from "@/lib/equipment-filter";
import { PageHeader } from "@/components/page-header";
import { EquipmentTabs } from "@/components/equipment-tabs";
import { Pager } from "@/components/pager";
import { paginate } from "@/lib/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { SafeText } from "@/components/safe-text";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { conditionTone, equipmentStatusTone } from "@/lib/status-style";

export const dynamic = "force-dynamic";

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const rawParams = await searchParams;
  const filters = parseEquipmentFilters(rawParams);
  const showTools = (Array.isArray(rawParams.tab) ? rawParams.tab[0] : rawParams.tab) === "tools";
  const searchText = filters.q;
  const normalizedSearch = searchText.toLocaleLowerCase("vi-VN");

  const [rows, groupRows, toolRows, openRepairs, heldLoans, handoverTransfers] = await Promise.all([
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
    // Vị trí hiển thị: máy đang do nhóm mượn giữ / đang điều chuyển không thể vẫn ghi vị trí cũ.
    db.select({ equipmentId: machineLoans.equipmentId, status: machineLoans.status, borrowerGroupId: machineLoans.borrowerGroupId, workLocation: machineLoans.workLocation })
      .from(machineLoans).where(inArray(machineLoans.status, ["on_loan", "incident"])),
    db.select({ equipmentId: transfers.equipmentId, status: transfers.status, targetGroupId: transfers.targetGroupId })
      .from(transfers).where(eq(transfers.status, "wait_handover")),
  ]);
  const repairTypeByEquipment = new Map(openRepairs.map((repair) => [repair.equipmentId, repair.repairType]));
  const statusText = (row: { id: string; status: keyof typeof EQUIPMENT_STATUS_LABELS }) => equipmentStatusDisplay(row.status, repairTypeByEquipment.get(row.id));

  const groupMap = new Map(groupRows.map((group) => [group.id, group.name]));
  const loanByEquipment = new Map(heldLoans.map((loan) => [loan.equipmentId, loan]));
  const transferByEquipment = new Map(handoverTransfers.map((transfer) => [transfer.equipmentId, transfer]));
  const locationText = (row: { id: string; currentLocation: string | null }) => {
    const loan = loanByEquipment.get(row.id);
    const transfer = transferByEquipment.get(row.id);
    return displayLocation({
      stored: row.currentLocation,
      loan: loan ? { status: loan.status, borrowerGroupName: groupMap.get(loan.borrowerGroupId) ?? "—", workLocation: loan.workLocation } : null,
      transfer: transfer ? { status: transfer.status, targetGroupName: groupMap.get(transfer.targetGroupId) ?? "—" } : null,
    });
  };
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

  // Số đếm theo Tình trạng: tính trên các bộ lọc KHÁC (nhóm quản lý, nhóm thiết bị, từ khóa) để người dùng thấy trước kết quả.
  const withoutCondition = { ...filters, condition: "" };
  const baseRows = rows.filter((row) => matchesEquipmentFilters(row, withoutCondition)).filter((row) => containsSearch(
    row.code, row.legacyCode, row.name, row.model, row.type, getEquipmentCategoryLabel(row.categoryCode), row.ownerGroup,
    groupMap.get(row.currentGroupId), row.currentLocation, CONDITION_LABELS[row.condition], statusText(row),
  ));
  const conditionCounts = countByCondition(baseRows);

  const searchGroupStats = Array.from(
    filteredRows.reduce((map, row) => {
      map.set(row.ownerGroup, (map.get(row.ownerGroup) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));

  // Liên kết giữ bộ lọc; `tab` và `page` đặt thêm.
  const pageHref = (extra: { tab?: string; page?: number }) => {
    const url = new URL(buildFilterHref("/equipment", filters), "http://local");
    if (extra.tab) url.searchParams.set("tab", extra.tab);
    if (extra.page && extra.page > 1) url.searchParams.set("page", String(extra.page));
    return `${url.pathname}${url.search}`;
  };
  const paging = paginate(filteredRows.length, rawParams.page);
  const pageRows = filteredRows.slice(paging.offset, paging.offset + paging.size);
  const conditionLabel = (value: string) => (CONDITION_LABELS as Record<string, string>)[value] ?? value;

  return (
    <>
      <PageHeader
        title="Dụng cụ toàn xưởng"
        description="Trang tra cứu tập trung, chỉ xem. Việc thêm và cập nhật dụng cụ được thực hiện tại Dụng cụ nhóm tôi."
      />

      <section className="equipment-filter-panel" aria-labelledby="equipment-filter-title">
        <h2 className="equipment-filter-title" id="equipment-filter-title">Bộ lọc{hasActiveFilters(filters) ? " (đang lọc)" : ""}</h2>
        <form className="equipment-filter-bar" action="/equipment" method="get">
          {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
          {showTools ? <input type="hidden" name="tab" value="tools" /> : null}
          <label>
            <span>Nhóm quản lý</span>
            <select name="group" defaultValue={filters.group}>
              <option value="">Tất cả nhóm</option>
              {groupRows.filter((group) => new Set([...rows.map((row) => row.ownerGroupId), ...toolRows.map((tool) => tool.groupId)]).has(group.id)).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label>
            <span>Tình trạng</span>
            <select name="condition" defaultValue={filters.condition}>
              <option value="">Tất cả tình trạng ({baseRows.length})</option>
              {CONDITION_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label} ({conditionCounts[value] ?? 0})</option>)}
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

      <EquipmentTabs
        active={showTools ? "tools" : "machines"}
        machinesCount={filteredRows.length}
        toolsCount={filteredToolRows.length}
        machinesHref={pageHref({})}
        toolsHref={pageHref({ tab: "tools" })}
      />

      {!showTools ? (
        <>
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

          {/* Tóm tắt theo Tình trạng: các số bấm được (lọc Tình trạng). */}
          <nav className="loan-chips" aria-label="Tóm tắt theo tình trạng">
            <Link className={`loan-chip${!filters.condition ? " is-active" : ""}`} href={buildFilterHref("/equipment", filters, { omit: "condition" })}>Tất cả <b>{baseRows.length}</b></Link>
            {CONDITION_FILTER_OPTIONS.map(([value, label]) => (
              <Link key={value} className={`loan-chip${filters.condition === value ? " is-active" : ""}${value !== "good" && (conditionCounts[value] ?? 0) > 0 ? " is-alert" : ""}`} href={buildFilterHref("/equipment", filters, { override: { condition: value } })}>{label} <b>{conditionCounts[value] ?? 0}</b></Link>
            ))}
          </nav>

          <Card className="table-card">
            <CardHeader><CardTitle>Danh mục máy/CCDC có mã</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                headers={["Mã hệ thống", "Tem nhôm", "Tên máy", "Nhóm quản lý", "Nhóm đang dùng", "Vị trí", "Trạng thái"]}
                rows={pageRows.map((row) => [
                  <Link key="code" href={`/equipment/${row.id}`}><strong>{row.code}</strong></Link>,
                  row.legacyCode || "—",
                  <div key="name" className="asset-name-cell"><strong><SafeText>{row.name}</SafeText></strong><small>{row.model || "Chưa có model"}</small></div>,
                  row.ownerGroup,
                  groupMap.get(row.currentGroupId) || "—",
                  locationText(row),
                  // Một huy hiệu Trạng thái; tình trạng chỉ hiện thêm khi KHÔNG tốt (Sẵn sàng chỉ khi Tốt).
                  <div key="status" className="status-stack">
                    <StatusBadge label={statusText(row)} tone={equipmentStatusTone(row.status)} />
                    {conditionGroupOf(row.condition) !== "good" ? <StatusBadge label={conditionLabel(row.condition)} tone={conditionTone(row.condition)} /> : null}
                  </div>,
                ])}
                empty={<EmptyState description={searchText ? `Không tìm thấy máy/CCDC phù hợp với “${searchText}”.` : "Chưa có máy/CCDC đã hoàn thành hồ sơ."} />}
              />
              <Pager info={paging} hrefFor={(page) => pageHref({ page })} unit="máy" />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="table-card" id="cc-so-luong">
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
              empty={<EmptyState description={hideTools ? "Bảng này không có Tình trạng nên được ẩn khi đang lọc mục đó. Bỏ lọc Tình trạng để xem lại." : hasActiveFilters(filters) ? "Không có dụng cụ theo số lượng phù hợp với bộ lọc / từ khóa." : "Chưa có dụng cụ theo số lượng đã hoàn thành hồ sơ."} />}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
