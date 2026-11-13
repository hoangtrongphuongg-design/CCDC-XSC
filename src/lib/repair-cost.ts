/** Chi phí sửa chữa (VNĐ) nhập tay: hàm thuần dùng cho Server Action và test. Cột `repairs.cost` là numeric(18,2). */
export const MAX_REPAIR_COST = 9_999_999_999_999.99;

export type RepairCostResult = { ok: true; cost: number } | { ok: false; message: string };

/** Chấp nhận số hoặc chuỗi (dấu phẩy thập phân kiểu VN được đổi thành dấu chấm); làm tròn 2 số lẻ. */
export function parseRepairCost(input: unknown): RepairCostResult {
  const raw = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim().replace(",", ".") : "";
  if (raw === "") return { ok: false, message: "Hãy nhập chi phí sửa chữa." };
  if (!/^\d+(\.\d+)?$/.test(raw)) return { ok: false, message: "Chi phí phải là số không âm." };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, message: "Chi phí không hợp lệ." };
  const rounded = Math.round(value * 100) / 100;
  if (rounded > MAX_REPAIR_COST) return { ok: false, message: "Chi phí quá lớn." };
  return { ok: true, cost: rounded };
}
