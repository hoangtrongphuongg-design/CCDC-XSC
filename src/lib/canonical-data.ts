import { asc, count, desc, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, equipmentTypeCatalog } from "@/lib/db/schema";
import { EQUIPMENT_CATEGORIES } from "@/lib/equipment-categories";
import { createCanonicalizer } from "@/lib/canonical-text";

/**
 * Hai hàm chuẩn hóa dựa trên dữ liệu đang có: Loại máy (theo từng nhóm thiết bị: gợi ý có sẵn +
 * danh mục loại đã tạo) và Vị trí (cách viết đang dùng nhiều nhất trên máy). Dùng khi lưu máy
 * và khi nhập Excel để chữ nhập tự do không đẻ thêm bản "na ná" của loại/vị trí đã có.
 */
export async function loadCanonicalizers(): Promise<{
  canonicalType: (categoryCode: string, value: string) => string;
  canonicalLocation: (value: string) => string;
}> {
  const [catalogRows, locationRows] = await Promise.all([
    db.select({ categoryCode: equipmentTypeCatalog.categoryCode, name: equipmentTypeCatalog.name }).from(equipmentTypeCatalog)
      .orderBy(desc(equipmentTypeCatalog.isActive), asc(equipmentTypeCatalog.name)),
    db.select({ location: equipment.currentLocation, n: count() }).from(equipment)
      .where(isNotNull(equipment.currentLocation)).groupBy(equipment.currentLocation).orderBy(desc(count())),
  ]);

  const typeByCategory = new Map<string, (value: string) => string>();
  const knownByCategory = new Map<string, string[]>();
  for (const category of EQUIPMENT_CATEGORIES) knownByCategory.set(category.code, [...category.suggestedTypes]);
  for (const row of catalogRows) {
    const list = knownByCategory.get(row.categoryCode) ?? [];
    list.push(row.name);
    knownByCategory.set(row.categoryCode, list);
  }
  for (const [code, known] of knownByCategory) typeByCategory.set(code, createCanonicalizer(known));

  const canonicalLocation = createCanonicalizer(locationRows.map((row) => row.location as string));
  return {
    canonicalType: (categoryCode, value) => {
      let canon = typeByCategory.get(categoryCode);
      if (!canon) { canon = createCanonicalizer(); typeByCategory.set(categoryCode, canon); }
      return canon(value);
    },
    canonicalLocation,
  };
}
