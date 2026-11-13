/**
 * Nhận diện lỗi vi phạm ràng buộc UNIQUE của Postgres (SQLSTATE 23505) do
 * `pg` ném ra (Drizzle giữ nguyên `.code` / `.constraint`). Dùng để trả thông
 * báo tiếng Việt thay vì để lộ lỗi "duplicate key" thô khi có race
 * check-then-insert.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string } | null;
  if (e?.code !== "23505") return false;
  return constraint ? e.constraint === constraint : true;
}

/** Vi phạm khóa ngoại (SQLSTATE 23503): bản ghi còn được hồ sơ khác tham chiếu. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23503";
}
