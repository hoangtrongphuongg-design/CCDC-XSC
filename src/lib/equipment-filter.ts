/**
 * Bộ lọc trang "Dụng cụ toàn xưởng" (hàm thuần, dùng chung cho trang và file Excel xuất):
 * Nhóm quản lý, Tình trạng, Nhóm thiết bị (+ ô tìm chữ `q` xử lý riêng ở nơi gọi). Không còn lọc theo Trạng thái
 * (trạng thái chỉ là cột hiển thị; liên kết cũ có `?status=` bị bỏ qua tham số đó).
 * Địa chỉ trang giữ bộ lọc (`?q=&group=&condition=&category=`) nên gửi link được; giá trị lạ bị bỏ.
 */
import { CONDITION_LABELS } from "@/lib/constants";
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";

/**
 * Nhóm tình trạng theo NHÃN HIỂN THỊ: dữ liệu cũ `minor_damage` hiện là "Hư hỏng", `limited` / `unknown` hiện là
 * "Chưa đánh giá" nên lọc theo nhãn phải gồm cả chúng.
 */
export function conditionGroupOf(condition: string): string {
  if (condition === "minor_damage") return "major_damage";
  if (condition === "limited" || condition === "unknown") return "awaiting_assessment";
  return condition;
}

/** Tình trạng cho ô chọn (không liệt kê các giá trị dữ liệu cũ trùng nhãn). */
export const CONDITION_FILTER_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["good", "Tốt"],
  ["major_damage", "Hư hỏng"],
  ["awaiting_assessment", "Chưa đánh giá"],
  ["irreparable", "Không thể phục hồi"],
];

export type EquipmentFilters = { q: string; group: string; condition: string; category: string };
export type FilterKey = keyof EquipmentFilters;

export const EMPTY_FILTERS: EquipmentFilters = { q: "", group: "", condition: "", category: "" };

type ParamsLike = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function pick(params: ParamsLike, key: string): string {
  const value = typeof (params as { get?: unknown }).get === "function"
    ? (params as { get(name: string): string | null }).get(key)
    : (params as Record<string, string | string[] | undefined>)[key];
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? "").trim();
}

const CONDITION_VALUES = new Set(CONDITION_FILTER_OPTIONS.map(([value]) => value));
const CATEGORY_VALUES = new Set<string>(EQUIPMENT_CATEGORIES.map((category) => category.code));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Đọc bộ lọc từ query; giá trị không hợp lệ (nhóm không phải UUID, trạng thái / tình trạng / nhóm thiết bị lạ) bị bỏ. */
export function parseEquipmentFilters(params: ParamsLike): EquipmentFilters {
  const group = pick(params, "group");
  const condition = pick(params, "condition");
  const category = pick(params, "category");
  return {
    q: pick(params, "q").slice(0, 200),
    group: UUID.test(group) ? group : "",
    condition: CONDITION_VALUES.has(condition) ? condition : "",
    category: CATEGORY_VALUES.has(category) ? category : "",
  };
}

export type FilterableEquipment = { ownerGroupId: string; condition: string; categoryCode: string };

/** Khớp 3 bộ lọc (chưa gồm ô tìm chữ). */
export function matchesEquipmentFilters(row: FilterableEquipment, filters: EquipmentFilters): boolean {
  if (filters.group && row.ownerGroupId !== filters.group) return false;
  if (filters.condition && conditionGroupOf(row.condition) !== filters.condition) return false;
  if (filters.category && row.categoryCode !== filters.category) return false;
  return true;
}

/** CCDC theo số lượng chỉ có nhóm quản lý và nhóm thiết bị. */
export function matchesToolFilters(row: { groupId: string; categoryCode: string }, filters: EquipmentFilters): boolean {
  if (filters.group && row.groupId !== filters.group) return false;
  if (filters.category && row.categoryCode !== filters.category) return false;
  return true;
}

/** Tình trạng không áp cho CCDC theo số lượng: đang lọc mục này thì ẩn bảng CCDC. */
export function filtersHideTools(filters: EquipmentFilters): boolean {
  return Boolean(filters.condition);
}

export function hasActiveFilters(filters: EquipmentFilters, includeSearch = true): boolean {
  return Boolean(filters.group || filters.condition || filters.category || (includeSearch && filters.q));
}

/** Địa chỉ trang/route với các bộ lọc đang bật; `omit` bỏ riêng một bộ lọc (thẻ ✕); `override` đặt lại giá trị. */
export function buildFilterHref(base: string, filters: EquipmentFilters, options: { omit?: FilterKey; override?: Partial<EquipmentFilters> } = {}): string {
  const merged = { ...filters, ...(options.override ?? {}) };
  const params = new URLSearchParams();
  for (const key of ["q", "group", "condition", "category"] as const) {
    if (key === options.omit) continue;
    if (merged[key]) params.set(key, merged[key]);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export type FilterLabels = { groupName: (id: string) => string };

/** Danh sách "tên bộ lọc: giá trị" đang bật, dùng cho thẻ trên trang và dòng mô tả trong Excel. */
export function describeFilters(filters: EquipmentFilters, labels: FilterLabels): Array<{ key: FilterKey; text: string }> {
  const out: Array<{ key: FilterKey; text: string }> = [];
  if (filters.q) out.push({ key: "q", text: `Từ khóa “${filters.q}”` });
  if (filters.group) out.push({ key: "group", text: `Nhóm: ${labels.groupName(filters.group)}` });
  if (filters.condition) out.push({ key: "condition", text: `Tình trạng: ${(CONDITION_LABELS as Record<string, string>)[filters.condition] ?? filters.condition}` });
  if (filters.category) out.push({ key: "category", text: `Nhóm thiết bị: ${EQUIPMENT_CATEGORIES.find((c) => c.code === filters.category)?.name ?? filters.category}` });
  return out;
}

/** Số máy theo từng nhóm tình trạng (đúng nhãn hiển thị), dùng cho số đếm trên ô lọc và dòng tóm tắt. */
export function countByCondition(rows: ReadonlyArray<{ condition: string }>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(CONDITION_FILTER_OPTIONS.map(([value]) => [value, 0]));
  for (const row of rows) {
    const key = conditionGroupOf(row.condition);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
