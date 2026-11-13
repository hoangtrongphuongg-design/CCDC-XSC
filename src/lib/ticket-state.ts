/**
 * Trạng thái trả về của cửa sổ "Tạo phiếu" + cách đổi lỗi ném từ Server Action thành thông báo cho người dùng
 * (hàm thuần, có test). Đặt ở `lib/` vì file `"use server"` chỉ được export Server Action.
 */
export type TicketState = { status: "idle" | "success" | "error"; message?: string };

export const TICKET_GENERIC_ERROR = "Không tạo được phiếu. Vui lòng kiểm tra thông tin rồi thử lại.";

/**
 * - Lỗi điều hướng của Next (đăng nhập hết hạn, notFound…) phải ném tiếp để Next xử lý.
 * - `Error` do nghiệp vụ ném (tiếng Việt, hiển thị thẳng) → giữ nguyên nội dung.
 * - Lỗi cơ sở dữ liệu (có `code` của Postgres hoặc câu lệnh SQL) → thông báo chung, không lộ chi tiết.
 */
export function ticketErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_")) {
    throw error;
  }
  if (!(error instanceof Error)) return TICKET_GENERIC_ERROR;
  const dbError = (error as { code?: unknown }).code !== undefined || /^Failed query/i.test(error.message);
  if (dbError || !error.message.trim()) return TICKET_GENERIC_ERROR;
  return error.message;
}
