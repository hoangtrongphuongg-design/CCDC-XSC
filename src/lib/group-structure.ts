export const GROUP_CATEGORY_LABELS = {
  mechanical: "Bảo trì cơ",
  electrical: "Bảo trì điện",
  external: "Nhóm khác",
  system: "Hệ thống",
} as const;

export type GroupCategory = keyof typeof GROUP_CATEGORY_LABELS;

export const STANDARD_GROUPS = [
  { code: "COI", name: "Bảo trì cơ - Nhóm Cối", category: "mechanical", isSystem: false },
  { code: "CBL", name: "Bảo trì cơ - Nhóm CBL", category: "mechanical", isSystem: false },
  { code: "NBS", name: "Bảo trì cơ - Nghiền BS-NT", category: "mechanical", isSystem: false },
  { code: "LO", name: "Bảo trì cơ - Nhóm Lò", category: "mechanical", isSystem: false },
  { code: "NXM", name: "Bảo trì cơ - Nhóm NXM", category: "mechanical", isSystem: false },
  { code: "WORKSHOP", name: "Bảo trì cơ - Nhóm Workshop", category: "mechanical", isSystem: false },
  { code: "BOI_TRON", name: "Bảo trì cơ - Nhóm Bôi trơn", category: "mechanical", isSystem: false },
  { code: "BANG_TAI", name: "Bảo trì cơ - Nhóm Băng tải", category: "mechanical", isSystem: false },
  { code: "DIEN_MO", name: "Bảo trì điện - Nhóm điện Mỏ", category: "electrical", isSystem: false },
  { code: "DIEN_CBL_NT", name: "Bảo trì điện - Nhóm điện CBL - NT", category: "electrical", isSystem: false },
  { code: "DIEN_NBS_LO", name: "Bảo trì điện - Nhóm Nghiền BS - Lò nung", category: "electrical", isSystem: false },
  { code: "DIEN_NXM_TD_PT", name: "Bảo trì điện - Nhóm Nghiền XM - Trạm điện - Phụ trợ", category: "electrical", isSystem: false },
  { code: "NHOM_KHAC", name: "Nhóm khác (Đơn vị khác; nhà thầu,...)", category: "external", isSystem: false },
  { code: "KHO_TL", name: "Kho thanh lý", category: "system", isSystem: true },
] as const satisfies readonly {
  code: string;
  name: string;
  category: GroupCategory;
  isSystem: boolean;
}[];

// Hai mã của cơ cấu thử nghiệm cũ. Chỉ tự ngừng sử dụng khi không còn dữ liệu liên quan.
export const LEGACY_GROUP_CODES = ["MO", "CK_CA"] as const;

export const OPERATIONAL_GROUP_CODES = STANDARD_GROUPS
  .filter((group) => !group.isSystem)
  .map((group) => group.code);

export const SYSTEM_GROUP_CODES = STANDARD_GROUPS
  .filter((group) => group.isSystem)
  .map((group) => group.code);

const order = new Map(STANDARD_GROUPS.map((group, index) => [group.code, index]));
const categoryByCode = new Map(STANDARD_GROUPS.map((group) => [group.code, group.category]));

export function groupSortOrder(code: string) {
  return order.get(code as (typeof STANDARD_GROUPS)[number]["code"]) ?? 999;
}

export function getGroupCategory(code: string, isSystem = false): GroupCategory {
  if (isSystem) return "system";
  return categoryByCode.get(code as (typeof STANDARD_GROUPS)[number]["code"]) ?? "external";
}

export function getGroupCategoryLabel(code: string, isSystem = false) {
  return GROUP_CATEGORY_LABELS[getGroupCategory(code, isSystem)];
}

export function normalizeGroupCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}
