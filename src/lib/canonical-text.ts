/**
 * Chuẩn hóa chữ nhập tự do (Loại máy, Vị trí) để "Máy hàn que", "máy hàn  que " và "MÁY HÀN QUE"
 * không thành ba loại khác nhau trong danh sách lọc và báo cáo. Hàm thuần, không phụ thuộc DB.
 *
 * Nguyên tắc: cắt khoảng trắng đầu/cuối, gộp khoảng trắng giữa; so khớp KHÔNG phân biệt hoa/thường
 * (vẫn phân biệt dấu); nếu đã có một cách viết trong danh sách "đã biết" thì dùng đúng cách viết đó,
 * chưa có thì giữ cách viết người dùng nhập (loại/vị trí mới vẫn thêm được).
 */

export function cleanLabel(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function canonicalKey(value: string | null | undefined): string {
  return cleanLabel(value).toLocaleLowerCase("vi");
}

/** Hàm chuẩn hóa: lần đầu gặp một khóa thì ghi nhớ cách viết đó, các lần sau trả đúng cách viết đã ghi nhớ. */
export function createCanonicalizer(known: Iterable<string> = []): (value: string) => string {
  const spellings = new Map<string, string>();
  for (const item of known) {
    const cleaned = cleanLabel(item);
    const key = canonicalKey(cleaned);
    if (cleaned && !spellings.has(key)) spellings.set(key, cleaned);
  }
  return (value: string) => {
    const cleaned = cleanLabel(value);
    if (!cleaned) return "";
    const key = canonicalKey(cleaned);
    const hit = spellings.get(key);
    if (hit) return hit;
    spellings.set(key, cleaned);
    return cleaned;
  };
}

/**
 * Chọn cách viết chuẩn của mỗi nhóm giá trị giống nhau (không phân biệt hoa/thường): cách viết
 * xuất hiện nhiều nhất; hòa thì ưu tiên chữ đầu viết hoa, rồi thứ tự chữ cái. Khớp với khối dọn
 * dữ liệu một lần trong `database/update.sql` (V1.6.13).
 */
export function pickCanonicalSpellings(values: Iterable<string | null | undefined>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const spelling = cleanLabel(raw);
    if (!spelling) continue;
    const key = canonicalKey(spelling);
    const bucket = counts.get(key) ?? new Map<string, number>();
    bucket.set(spelling, (bucket.get(spelling) ?? 0) + 1);
    counts.set(key, bucket);
  }
  const startsUpper = (text: string) => {
    const first = text.charAt(0);
    return first !== first.toLocaleLowerCase("vi") && first === first.toLocaleUpperCase("vi");
  };
  const result = new Map<string, string>();
  for (const [key, bucket] of counts) {
    const best = [...bucket.entries()].sort((a, b) =>
      b[1] - a[1] || Number(startsUpper(b[0])) - Number(startsUpper(a[0])) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    )[0];
    result.set(key, best[0]);
  }
  return result;
}

/** Danh sách gợi ý: mỗi giá trị một lần (cách viết chuẩn), nhiều nhất lên đầu. Dùng cho `<datalist>`. */
export function rankLabels(values: Iterable<string | null | undefined>): string[] {
  const frequency = new Map<string, number>();
  const all: string[] = [];
  for (const raw of values) {
    const cleaned = cleanLabel(raw);
    if (!cleaned) continue;
    all.push(cleaned);
    const key = canonicalKey(cleaned);
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  const canonical = pickCanonicalSpellings(all);
  return [...canonical.entries()]
    .sort((a, b) => (frequency.get(b[0]) ?? 0) - (frequency.get(a[0]) ?? 0) || a[1].localeCompare(b[1], "vi"))
    .map(([, spelling]) => spelling);
}
