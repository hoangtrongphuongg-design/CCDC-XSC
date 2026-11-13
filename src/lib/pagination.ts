/**
 * Phân trang (hàm thuần): trang hiện tại, khoảng dòng và dãy số trang gọn ("1 2 … 7 8 9 … 25").
 */
export const DEFAULT_PAGE_SIZE = 50;

export type PageInfo = { page: number; pageCount: number; size: number; total: number; from: number; to: number; offset: number };

/** `rawPage` từ query (chuỗi bậy → trang 1; quá số trang → trang cuối). */
export function paginate(total: number, rawPage: unknown, size: number = DEFAULT_PAGE_SIZE): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const parsed = Number.parseInt(String(Array.isArray(rawPage) ? rawPage[0] : rawPage ?? ""), 10);
  const page = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, pageCount) : 1;
  const offset = (page - 1) * size;
  return { page, pageCount, size, total, from: total ? offset + 1 : 0, to: Math.min(offset + size, total), offset };
}

/** Dãy số trang cần hiện: luôn có trang đầu, trang cuối và 1 trang mỗi bên trang hiện tại; chỗ ngắt là null ("…"). */
export function pageWindow(page: number, pageCount: number): Array<number | null> {
  const wanted = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  pages.forEach((p, index) => {
    if (index > 0 && p - pages[index - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}
