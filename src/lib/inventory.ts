/**
 * Kiểm kê CCDC trên điện thoại — quy tắc thuần (không DB), dùng được cả ở server và client.
 *  - Danh sách cần kiểm được CHỤP lúc mở đợt: máy thuộc nhóm + máy nhóm đang mượn giữ.
 *  - Máy đang ở nơi khác theo hồ sơ (cho mượn, đang sửa, điều chuyển) vẫn nằm trong danh sách nhưng
 *    gắn "nơi khác" và không tính vào tiến độ cần tìm tại nhóm.
 *  - Máy tìm thấy mà không có trong danh sách được thêm là "thừa".
 */
import { foldText } from "@/lib/global-search";

export type InventoryResult = "found" | "missing";

export const INVENTORY_RESULT_LABELS: Record<InventoryResult, string> = {
  found: "Có mặt",
  missing: "Không thấy",
};

/** Phiên kiểm kê tối đa bao nhiêu máy: chặn nhóm có số máy bất thường lớn làm trang nặng. */
export const INVENTORY_MAX_ITEMS = 1500;

type Level = "viewer" | "operator" | "manager";
const RANK: Record<Level, number> = { viewer: 0, operator: 1, manager: 2 };

export type InventorySubject = {
  isAdmin: boolean;
  isWsManager: boolean;
  isReadOnlyViewer: boolean;
  permissions: ReadonlyArray<{ groupId: string; level: Level }>;
};

const isWorkshopLevel = (s: InventorySubject) => (s.isAdmin || s.isWsManager) && !s.isReadOnlyViewer;
const levelAt = (s: InventorySubject, groupId: string): number =>
  s.permissions.filter((p) => p.groupId === groupId).reduce((best, p) => Math.max(best, RANK[p.level]), -1);

/**
 * Mở đợt kiểm kê TAY: chỉ Quản lý Xưởng / Admin. Đợt hằng tháng đã tự mở ngày 1 nên Đốc công không cần tự mở
 * (Người xem toàn xưởng luôn không, kể cả khi mang cờ Admin).
 */
export function canOpenInventory(s: InventorySubject): boolean {
  return isWorkshopLevel(s);
}

/** Đóng đợt kiểm kê: Đốc công (manager) của nhóm, hoặc Quản lý Xưởng / Admin. */
export function canManageInventory(s: InventorySubject, groupId: string): boolean {
  if (s.isReadOnlyViewer) return false;
  return isWorkshopLevel(s) || levelAt(s, groupId) >= RANK.manager;
}

/** Đánh dấu có mặt / không thấy: mọi thành viên nhóm, hoặc Quản lý Xưởng / Admin. */
export function canCheckInventory(s: InventorySubject, groupId: string): boolean {
  if (s.isReadOnlyViewer) return false;
  return isWorkshopLevel(s) || levelAt(s, groupId) >= RANK.viewer;
}

/** Xem đợt kiểm kê và xuất biên bản: thành viên nhóm hoặc vai trò xem toàn Xưởng. */
export function canViewInventory(s: InventorySubject, groupId: string): boolean {
  return s.isAdmin || s.isWsManager || s.isReadOnlyViewer || levelAt(s, groupId) >= RANK.viewer;
}

const OFFSITE_STATUSES = new Set(["repairing", "wait_repair_confirm", "wait_handover"]);
const STATUS_NOTES: Record<string, string> = {
  wait_inspection: "Chờ kiểm tra",
  wait_disposal: "Chờ thanh lý",
  inactive: "Ngừng sử dụng",
  repairing: "Đang sửa chữa",
  wait_repair_confirm: "Chờ xác nhận sửa xong",
  wait_handover: "Đang điều chuyển",
};

/**
 * Máy này nên kiểm ở đâu so với nhóm kiểm kê `groupId`:
 *  - nhóm quản lý nhưng đang do nhóm khác mượn giữ → nơi khác;
 *  - đang sửa / chờ xác nhận sửa / điều chuyển → nơi khác;
 *  - máy nhóm khác mượn về nhóm này → cần kiểm tại nhóm, ghi "Mượn của …".
 */
export function classifyExpected(
  input: { groupId: string; ownerGroupId: string; heldByGroupId: string | null; status: string },
  groupName: (id: string) => string,
): { offsite: boolean; note: string | null } {
  if (input.ownerGroupId !== input.groupId) return { offsite: false, note: `Mượn của ${groupName(input.ownerGroupId)}` };
  if (input.heldByGroupId && input.heldByGroupId !== input.groupId) return { offsite: true, note: `Đang cho ${groupName(input.heldByGroupId)} mượn` };
  if (OFFSITE_STATUSES.has(input.status)) return { offsite: true, note: STATUS_NOTES[input.status] ?? null };
  return { offsite: false, note: STATUS_NOTES[input.status] ?? null };
}

export type InventoryItemState = { result: InventoryResult | null; offsite: boolean; unexpected: boolean };

export type InventorySection = "missing" | "pending" | "unexpected" | "offsite" | "found";
export const SECTION_ORDER: InventorySection[] = ["missing", "pending", "unexpected", "offsite", "found"];
export const SECTION_LABELS: Record<InventorySection, string> = {
  missing: "Không thấy",
  pending: "Chưa kiểm",
  unexpected: "Thừa (không có trong danh sách)",
  offsite: "Đang ở nơi khác (chưa xác nhận)",
  found: "Có mặt",
};

export function sectionOf(item: InventoryItemState): InventorySection {
  if (item.unexpected) return "unexpected";
  if (item.result === "missing") return "missing";
  if (item.result === "found") return "found";
  return item.offsite ? "offsite" : "pending";
}

export type InventorySummary = {
  total: number;
  /** Máy cần tìm tại nhóm (không tính nơi khác, không tính thừa). */
  onsite: number;
  /** Trong số `onsite`, đã có kết quả. */
  checkedOnsite: number;
  found: number;
  missing: number;
  pending: number;
  offsitePending: number;
  unexpected: number;
  /** % máy cần tìm đã kiểm (100 nếu không có máy nào cần tìm). */
  progress: number;
};

export function summarizeInventory(items: readonly InventoryItemState[]): InventorySummary {
  const s: InventorySummary = { total: items.length, onsite: 0, checkedOnsite: 0, found: 0, missing: 0, pending: 0, offsitePending: 0, unexpected: 0, progress: 100 };
  for (const item of items) {
    const section = sectionOf(item);
    if (section === "found") s.found += 1;
    else if (section === "missing") s.missing += 1;
    else if (section === "pending") s.pending += 1;
    else if (section === "offsite") s.offsitePending += 1;
    else s.unexpected += 1;
    if (!item.offsite && !item.unexpected) {
      s.onsite += 1;
      if (item.result) s.checkedOnsite += 1;
    }
  }
  // "Thừa" luôn có kết quả found (người kiểm tìm thấy) nên cộng vào found.
  s.found += s.unexpected;
  s.progress = s.onsite ? Math.round((s.checkedOnsite / s.onsite) * 100) : 100;
  return s;
}

export type ChecklistFilter = "pending" | "found" | "missing" | "offsite" | "unexpected" | "all";

export type ChecklistItem = InventoryItemState & {
  equipmentId: string;
  code: string;
  legacyCode: string | null;
  name: string;
  type: string;
  expectedNote: string | null;
};

/** Lọc danh sách kiểm kê theo tab và từ khóa (không phân biệt hoa/thường và dấu; nhiều từ = khớp tất cả). */
export function filterChecklist<T extends ChecklistItem>(items: readonly T[], filter: ChecklistFilter, query: string): T[] {
  const terms = foldText(query).split(" ").filter(Boolean);
  return items.filter((item) => {
    if (filter !== "all") {
      const section = sectionOf(item);
      if (filter === "unexpected" ? section !== "unexpected" : section !== filter) return false;
    }
    if (!terms.length) return true;
    const haystack = foldText([item.code, item.legacyCode, item.name, item.type, item.expectedNote].filter(Boolean).join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}
