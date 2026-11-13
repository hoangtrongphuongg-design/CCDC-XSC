/**
 * Logic thuần (không DB, không exceljs) cho xuất Excel CCDC: chuyển dòng DB thành
 * dòng xuất, dựng cây nhóm → loại, tên sheet / tên file / ghi chú. Tách riêng để
 * test được bằng dữ liệu giả và để file xuất luôn khớp với danh sách trên màn hình.
 */
import { EQUIPMENT_CATEGORIES, getEquipmentCategoryLabel } from "@/lib/equipment-categories";
import { displayLocation } from "@/lib/location-display";
import { CONDITION_LABELS, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { groupSortOrder } from "@/lib/group-structure";
import { isHeldByBorrower } from "@/lib/loan-status";

export type ExportEquipment = {
  id: string;
  code: string;
  legacyCode: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  categoryCode: string;
  equipmentType: string;
  ownerGroupId: string;
  ownerGroupCode: string;
  ownerGroupName: string;
  currentGroupName: string;
  currentLocation: string | null;
  status: string;
  condition: string;
  loanStatus: string | null;
  loanOwnerGroupId: string | null;
  loanBorrowerGroupId: string | null;
  loanOwnerGroupName: string | null;
  loanBorrowerGroupName: string | null;
  transferStatus: string | null;
  transferSourceGroupId: string | null;
  transferTargetGroupId: string | null;
  transferSourceGroupName: string | null;
  transferTargetGroupName: string | null;
  repairStatus: string | null;
};

export type ExportTool = {
  code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  quantity: number;
  categoryCode: string;
  equipmentType: string;
  groupId: string;
  groupCode: string;
  groupName: string;
};

export type TypeBucket = { type: string; items: ExportEquipment[] };
export type CategoryBucket = { categoryCode: string; categoryName: string; total: number; types: TypeBucket[] };
export type GroupBucket = { groupId: string; groupCode: string; groupName: string; total: number; types: TypeBucket[]; categories: CategoryBucket[] };

/* ----------------------------- định dạng nhãn ----------------------------- */

/** "Bảo trì cơ - Nhóm CBL" → "Nhóm CBL" để ghi chú ngắn gọn. */
export function shortGroupName(name: string): string {
  return name.replace(/^Bảo trì (cơ|điện) - /i, "").trim();
}

export function statusLabel(status: string): string {
  return (EQUIPMENT_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function conditionLabel(condition: string): string {
  return (CONDITION_LABELS as Record<string, string>)[condition] ?? condition;
}

export function brandModel(row: Pick<ExportEquipment, "brand" | "model">): string {
  return [row.brand, row.model].filter(Boolean).join(" / ");
}

/**
 * Ghi chú tình trạng luân chuyển: đang cho mượn / đang mượn / chờ nhận lại / điều
 * chuyển / sửa chữa. Dùng chung cho kiểm kê (biết máy không có mặt tại nhóm) và báo cáo.
 */
export function buildMovementNote(row: ExportEquipment): string {
  const notes: string[] = [];
  const owner = row.loanOwnerGroupName ? shortGroupName(row.loanOwnerGroupName) : "nhóm chủ";
  const borrower = row.loanBorrowerGroupName ? shortGroupName(row.loanBorrowerGroupName) : "nhóm mượn";

  switch (row.loanStatus) {
    case "on_loan":
      notes.push(`Đang mượn: ${borrower} mượn của ${owner}`);
      break;
    case "incident":
      notes.push(`Đang mượn (có sự cố): ${borrower} mượn của ${owner}`);
      break;
    case "return_requested":
      notes.push(`Đã báo trả, chờ ${owner} nhận lại (${borrower})`);
      break;
    case "pending_owner":
      notes.push(`Có đề nghị mượn đang chờ duyệt (${borrower})`);
      break;
    case "approved":
    case "wait_handover":
      notes.push(`Chờ bàn giao cho ${borrower}`);
      break;
    default:
      break;
  }

  if (row.transferStatus) {
    const from = row.transferSourceGroupName ? shortGroupName(row.transferSourceGroupName) : "?";
    const to = row.transferTargetGroupName ? shortGroupName(row.transferTargetGroupName) : "?";
    notes.push(`Đang điều chuyển: ${from} → ${to}`);
  }

  if (row.repairStatus) {
    const repairLabels: Record<string, string> = {
      pending_acceptance: "Chờ tiếp nhận sửa chữa",
      repairing: "Đang sửa chữa",
      wait_owner_confirm: "Sửa xong, chờ nhóm chủ nhận lại",
    };
    notes.push(repairLabels[row.repairStatus] ?? "Đang có phiếu sửa chữa");
  }

  return notes.join("; ");
}

/* ------------------------------- phạm vi nhóm ------------------------------ */

/**
 * Máy thuộc phạm vi của một nhóm khi: nhóm là chủ, hoặc nhóm đang giữ do mượn
 * (phiếu on_loan/incident), hoặc nhóm là bên giao/nhận của điều chuyển đang mở.
 * Khớp với cách trang "Dụng cụ nhóm tôi" chọn máy.
 */
export function isInGroupScope(row: ExportEquipment, groupId: string): boolean {
  return row.ownerGroupId === groupId
    || (isHeldByBorrower(row.loanStatus) && row.loanBorrowerGroupId === groupId)
    || (Boolean(row.transferStatus) && (row.transferSourceGroupId === groupId || row.transferTargetGroupId === groupId));
}

/* ------------------------------- tìm kiếm -------------------------------- */

/** Các giá trị dùng để tìm kiếm máy (khớp trang Dụng cụ toàn xưởng). */
export function equipmentSearchValues(row: ExportEquipment): Array<string | null> {
  return [
    row.code,
    row.legacyCode,
    row.name,
    row.model,
    row.equipmentType,
    getEquipmentCategoryLabel(row.categoryCode),
    row.ownerGroupName,
    row.currentGroupName,
    row.currentLocation,
    conditionLabel(row.condition),
    statusLabel(row.status),
  ];
}

export function toolSearchValues(tool: ExportTool): Array<string | null> {
  return [
    tool.code,
    tool.name,
    tool.equipmentType,
    getEquipmentCategoryLabel(tool.categoryCode),
    tool.specification,
    tool.groupName,
    tool.unit,
  ];
}

export function matchesSearch(values: Array<string | null | undefined>, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase("vi-VN");
  if (!normalized) return true;
  return values.some((value) => value?.toLocaleLowerCase("vi-VN").includes(normalized));
}

/* ------------------------------ sắp xếp / cây ------------------------------ */

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

function typeKey(type: string): string {
  return type.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

function categoryOrder(code: string): number {
  const index = EQUIPMENT_CATEGORIES.findIndex((category) => category.code === code);
  return index === -1 ? EQUIPMENT_CATEGORIES.length : index;
}

export function compareByCode(a: { code: string | null }, b: { code: string | null }): number {
  return collator.compare(a.code ?? "", b.code ?? "");
}

/**
 * Gom máy cùng loại (không phân biệt hoa thường/khoảng trắng thừa), loại sắp theo tên, máy theo mã.
 * Tên hiển thị của loại là cách viết phổ biến nhất; hòa thì ưu tiên cách viết hoa chữ đầu.
 */
function bucketByType(rows: ExportEquipment[]): TypeBucket[] {
  const map = new Map<string, { items: ExportEquipment[]; spellings: Map<string, number> }>();
  for (const row of [...rows].sort(compareByCode)) {
    const key = typeKey(row.equipmentType);
    const entry = map.get(key) || { items: [], spellings: new Map<string, number>() };
    entry.items.push(row);
    const spelling = row.equipmentType.trim().replace(/\s+/g, " ") || "Chưa phân loại";
    entry.spellings.set(spelling, (entry.spellings.get(spelling) || 0) + 1);
    map.set(key, entry);
  }
  return Array.from(map.values())
    .map((entry) => {
      const [type] = Array.from(entry.spellings.entries()).sort(([a, countA], [b, countB]) => {
        const capitalized = (text: string) => (text[0] === text[0]?.toLocaleUpperCase("vi") ? 1 : 0);
        return countB - countA || capitalized(b) - capitalized(a) || collator.compare(a, b);
      })[0];
      return { type, items: entry.items };
    })
    .sort((a, b) => collator.compare(a.type, b.type));
}

function bucketByCategory(rows: ExportEquipment[]): CategoryBucket[] {
  const map = new Map<string, ExportEquipment[]>();
  for (const row of rows) map.set(row.categoryCode, [...(map.get(row.categoryCode) || []), row]);
  return Array.from(map.entries())
    .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b) || collator.compare(a, b))
    .map(([categoryCode, items]) => ({
      categoryCode,
      categoryName: getEquipmentCategoryLabel(categoryCode),
      total: items.length,
      types: bucketByType(items),
    }));
}

function sortGroups(rows: ExportEquipment[]): Array<{ id: string; code: string; name: string; rows: ExportEquipment[] }> {
  const map = new Map<string, { id: string; code: string; name: string; rows: ExportEquipment[] }>();
  for (const row of rows) {
    const entry = map.get(row.ownerGroupId) || { id: row.ownerGroupId, code: row.ownerGroupCode, name: row.ownerGroupName, rows: [] };
    entry.rows.push(row);
    map.set(row.ownerGroupId, entry);
  }
  return Array.from(map.values()).sort((a, b) => groupSortOrder(a.code) - groupSortOrder(b.code) || collator.compare(a.name, b.name));
}

/** Báo cáo toàn xưởng: nhóm quản lý → các loại máy cùng loại liền nhau. */
export function buildWorkshopTree(rows: ExportEquipment[]): GroupBucket[] {
  return sortGroups(rows).map((group) => ({
    groupId: group.id,
    groupCode: group.code,
    groupName: group.name,
    total: group.rows.length,
    types: bucketByType(group.rows),
    categories: [],
  }));
}

/**
 * Kiểm kê: nhóm thiết bị → loại. `single` gộp mọi dòng vào một nhóm duy nhất (kiểm kê
 * một nhóm, kể cả máy đang mượn của nhóm khác); ngược lại tách theo nhóm quản lý.
 */
export function buildInventoryTree(
  rows: ExportEquipment[],
  single?: { id: string; code: string; name: string },
): GroupBucket[] {
  const groups = single
    ? [{ id: single.id, code: single.code, name: single.name, rows }]
    : sortGroups(rows);
  return groups.map((group) => ({
    groupId: group.id,
    groupCode: group.code,
    groupName: group.name,
    total: group.rows.length,
    types: [],
    categories: bucketByCategory(group.rows),
  }));
}

export function sortTools(tools: ExportTool[]): ExportTool[] {
  return [...tools].sort((a, b) =>
    groupSortOrder(a.groupCode) - groupSortOrder(b.groupCode)
    || collator.compare(a.groupName, b.groupName)
    || categoryOrder(a.categoryCode) - categoryOrder(b.categoryCode)
    || collator.compare(a.equipmentType, b.equipmentType)
    || collator.compare(a.name, b.name),
  );
}

/* ------------------------- tên sheet / tên file / ngày ------------------------- */

/** Tên sheet hợp lệ của Excel: ≤31 ký tự, không có `[]:*?/\`, không trùng trong cùng file. */
export function safeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Sheet";
  let candidate = cleaned.slice(0, 31);
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter++})`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Bỏ dấu, chỉ giữ a-z0-9 và gạch ngang — dùng cho tên file. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "du-lieu";
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam (không dùng UTC để khỏi lệch ngày quanh nửa đêm). */
export function vnDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "dd/MM/yyyy HH:mm" theo giờ Việt Nam. */
export function vnDateTime(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function exportFileName(prefix: string, label: string | null, now: Date = new Date()): string {
  return `${[prefix, label ? slugify(label) : null, vnDate(now)].filter(Boolean).join("-")}.xlsx`;
}

/* ------------------------------ chuyển dòng DB ------------------------------ */

type RawEquipmentRow = {
  id: string;
  code: string;
  legacyCode: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  categoryCode: string;
  equipmentType: string;
  ownerGroupId: string;
  currentGroupId: string;
  currentLocation: string | null;
  status: string;
  condition: string;
};

export type ExportContext = {
  groupById: Map<string, { code: string; name: string }>;
  loan?: { status: string; ownerGroupId: string; borrowerGroupId: string; workLocation?: string | null } | null;
  transfer?: { status: string; sourceGroupId: string; targetGroupId: string } | null;
  repair?: { status: string } | null;
};

export function toExportEquipment(row: RawEquipmentRow, ctx: ExportContext): ExportEquipment {
  const group = (id: string | null | undefined) => (id ? ctx.groupById.get(id) : undefined);
  const owner = group(row.ownerGroupId);
  return {
    id: row.id,
    code: row.code,
    legacyCode: row.legacyCode,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    categoryCode: row.categoryCode,
    equipmentType: row.equipmentType,
    ownerGroupId: row.ownerGroupId,
    ownerGroupCode: owner?.code ?? "",
    ownerGroupName: owner?.name ?? "—",
    // Nhóm đang giữ suy ra từ phiếu mượn (khớp trang Dụng cụ nhóm tôi), không tin current_group_id
    // vì dữ liệu cũ có thể lệch; không có phiếu đang giữ thì là nhóm chủ.
    currentGroupName: isHeldByBorrower(ctx.loan?.status)
      ? group(ctx.loan?.borrowerGroupId)?.name ?? owner?.name ?? "—"
      : owner?.name ?? group(row.currentGroupId)?.name ?? "—",
    // Vị trí theo nghiệp vụ: đang mượn → tại nhóm mượn; đang điều chuyển → nhóm nhận; còn lại vị trí đã lưu (trống thì để trống).
    currentLocation: displayLocation({
      stored: row.currentLocation,
      loan: ctx.loan ? { status: ctx.loan.status, borrowerGroupName: group(ctx.loan.borrowerGroupId)?.name ?? "—", workLocation: ctx.loan.workLocation ?? null } : null,
      transfer: ctx.transfer ? { status: ctx.transfer.status, targetGroupName: group(ctx.transfer.targetGroupId)?.name ?? "—" } : null,
      empty: "",
    }) || null,
    status: row.status,
    condition: row.condition,
    loanStatus: ctx.loan?.status ?? null,
    loanOwnerGroupId: ctx.loan?.ownerGroupId ?? null,
    loanBorrowerGroupId: ctx.loan?.borrowerGroupId ?? null,
    loanOwnerGroupName: group(ctx.loan?.ownerGroupId)?.name ?? null,
    loanBorrowerGroupName: group(ctx.loan?.borrowerGroupId)?.name ?? null,
    transferStatus: ctx.transfer?.status ?? null,
    transferSourceGroupId: ctx.transfer?.sourceGroupId ?? null,
    transferTargetGroupId: ctx.transfer?.targetGroupId ?? null,
    transferSourceGroupName: group(ctx.transfer?.sourceGroupId)?.name ?? null,
    transferTargetGroupName: group(ctx.transfer?.targetGroupId)?.name ?? null,
    repairStatus: ctx.repair?.status ?? null,
  };
}
