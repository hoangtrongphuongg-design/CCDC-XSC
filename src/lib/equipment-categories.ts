export const EQUIPMENT_DISCIPLINE_LABELS = {
  mechanical: "Thiết bị cơ khí",
  electrical: "Thiết bị điện",
  other: "Nhóm khác",
} as const;

export type EquipmentDiscipline = keyof typeof EQUIPMENT_DISCIPLINE_LABELS;

export const EQUIPMENT_CATEGORIES = [
  {
    code: "CK_HAN_CAT",
    name: "Cơ khí - Hàn, cắt và gia nhiệt",
    discipline: "mechanical",
    suggestedTypes: ["Máy hàn que", "Máy hàn MIG/MAG", "Máy hàn TIG", "Máy cắt plasma", "Máy cắt gió đá", "Máy sấy que", "Máy khò"],
  },
  {
    code: "CK_MAY_CAM_TAY",
    name: "Cơ khí - Máy gia công cầm tay",
    discipline: "mechanical",
    suggestedTypes: ["Máy mài góc", "Máy mài thẳng", "Máy khoan điện", "Máy khoan từ", "Máy taro", "Máy cưa", "Máy đánh bóng"],
  },
  {
    code: "CK_NANG_HA",
    name: "Cơ khí - Nâng hạ và kéo",
    discipline: "mechanical",
    suggestedTypes: ["Palang xích kéo tay", "Palang điện", "Tirfor", "Kích thủy lực", "Con đội cơ khí", "Tời điện", "Xe nâng tay"],
  },
  {
    code: "CK_THAO_LAP",
    name: "Cơ khí - Tháo lắp và gia công nguội",
    discipline: "mechanical",
    suggestedTypes: ["Bộ tuýp", "Cờ lê lực", "Cảo/vam", "Kìm", "Búa", "Đục", "Bộ taro", "Bàn ren"],
  },
  {
    code: "CK_DO_KIEM",
    name: "Cơ khí - Đo lường và kiểm tra",
    discipline: "mechanical",
    suggestedTypes: ["Thước cặp", "Panme", "Đồng hồ so", "Thước đo sâu", "Thước lá", "Nivo", "Máy đo rung", "Súng đo nhiệt độ"],
  },
  {
    code: "CK_THUY_LUC_KHI_NEN",
    name: "Cơ khí - Thủy lực và khí nén",
    discipline: "mechanical",
    suggestedTypes: ["Bơm thủy lực", "Kích rỗng tâm", "Bộ test áp", "Súng siết khí nén", "Máy ép thủy lực"],
  },
  {
    code: "DIEN_DO_KIEM",
    name: "Điện - Đo lường và kiểm tra",
    discipline: "electrical",
    suggestedTypes: ["Đồng hồ vạn năng", "Ampe kìm", "Megohm", "Máy đo tiếp địa", "Máy đo thứ tự pha", "Camera nhiệt", "Bút thử điện"],
  },
  {
    code: "DIEN_THI_CONG",
    name: "Điện - Thi công và sửa chữa",
    discipline: "electrical",
    suggestedTypes: ["Kìm ép cos", "Máy ép cos", "Máy cắt cáp", "Máy tuốt dây", "Bộ dụng cụ điện", "Máy đánh số dây"],
  },
  {
    code: "KHAC",
    name: "Khác và thiết bị chuyên dụng",
    discipline: "other",
    suggestedTypes: ["Thiết bị chuyên dụng", "Dụng cụ khác"],
  },
] as const satisfies readonly {
  code: string;
  name: string;
  discipline: EquipmentDiscipline;
  suggestedTypes: readonly string[];
}[];

export type EquipmentCategoryCode = (typeof EQUIPMENT_CATEGORIES)[number]["code"];

const categoryMap = new Map(EQUIPMENT_CATEGORIES.map((category) => [category.code, category]));

export function getEquipmentCategoryLabel(code: string) {
  return categoryMap.get(code as EquipmentCategoryCode)?.name ?? "Khác và thiết bị chuyên dụng";
}
