/**
 * Tìm kiếm chung: quy tắc khớp và xếp hạng (hàm thuần, không DB).
 *  - Không phân biệt hoa/thường VÀ không phân biệt dấu ("may han" tìm được "Máy hàn").
 *  - Nhiều từ: máy phải khớp TẤT CẢ các từ (ở bất kỳ trường nào), thứ tự từ không quan trọng.
 *  - Xếp hạng: trùng hẳn mã / tem nhôm / serial lên đầu, rồi bắt đầu bằng, rồi chứa, rồi khớp rải rác.
 */

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_TERMS = 6;

export function foldText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function queryTerms(query: string): string[] {
  return [...new Set(foldText(query).split(" ").filter(Boolean))].slice(0, MAX_QUERY_TERMS);
}

export type SearchFields = {
  /** Mã định danh: mã hệ thống, tem nhôm, serial… — khớp ở đây được xếp trước. */
  primary: ReadonlyArray<string | null | undefined>;
  /** Các trường mô tả: tên, loại, nhóm, vị trí… */
  text: ReadonlyArray<string | null | undefined>;
};

/** 0 = trùng hẳn một mã, 1 = mã bắt đầu bằng, 2 = mã chứa, 3 = khớp ở trường khác; null = không khớp. */
export function rankMatch(fields: SearchFields, query: string): number | null {
  const terms = queryTerms(query);
  if (!terms.length) return null;
  const primary = fields.primary.map(foldText).filter(Boolean);
  const haystack = [...primary, ...fields.text.map(foldText)].filter(Boolean).join(" ");
  if (!terms.every((term) => haystack.includes(term))) return null;

  const whole = terms.join(" ");
  if (primary.some((value) => value === whole)) return 0;
  if (primary.some((value) => value.startsWith(whole))) return 1;
  if (primary.some((value) => value.includes(whole))) return 2;
  return 3;
}

/** Lọc + xếp hạng; giữ thứ tự gốc khi cùng hạng. `total` là số khớp trước khi cắt `limit`. */
export function searchItems<T>(items: readonly T[], query: string, fields: (item: T) => SearchFields, limit: number): { rows: T[]; total: number } {
  const ranked: Array<{ item: T; rank: number; index: number }> = [];
  items.forEach((item, index) => {
    const rank = rankMatch(fields(item), query);
    if (rank !== null) ranked.push({ item, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return { rows: ranked.slice(0, limit).map((entry) => entry.item), total: ranked.length };
}

/** Thoát ký tự đặc biệt của LIKE/ILIKE (\, %, _) để tìm mã phiếu theo đúng chữ người dùng gõ. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Chuẩn hóa chuỗi người dùng gõ: gộp khoảng trắng, cắt 120 ký tự. */
export function cleanQuery(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}
