/**
 * Kiểm tra ngày dạng chuỗi (YYYY-MM-DD) cho form mượn/trả. Hàm thuần, không phụ
 * thuộc thư viện nên test được trực tiếp.
 */

/** Chuỗi YYYY-MM-DD là một ngày có thật (không nhận 2026-02-31, "abc", rỗng). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Ngày hợp lệ và không ở quá khứ. So theo ngày UTC của server: giờ Việt Nam đi
 * trước UTC nên ngày "hôm nay" theo giờ VN không bao giờ bị chặn nhầm.
 */
export function isNotPastDate(value: string, now: Date = new Date()): boolean {
  return isIsoDate(value) && value >= now.toISOString().slice(0, 10);
}
