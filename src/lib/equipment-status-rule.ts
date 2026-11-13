/**
 * Quy tắc "Sẵn sàng chỉ khi tình trạng Tốt" (hàm thuần, dùng ở server và form).
 * Máy ở trạng thái Sẵn sàng nhưng tình trạng Hư hỏng / Chưa đánh giá / Không thể phục hồi vừa sai sự thật vừa không
 * mượn được (phiếu mượn đòi `in_use_owner` + `good`) → tự chuyển "Chờ kiểm tra". Các trạng thái khác do quy trình
 * điều khiển (mượn, sửa, điều chuyển, thanh lý, ngừng sử dụng) giữ nguyên. Chiều ngược lại không tự bật Sẵn sàng.
 */
export function isReadyCondition(condition: string): boolean {
  return condition === "good";
}

export function statusForCondition(status: string, condition: string): string {
  return status === "in_use_owner" && !isReadyCondition(condition) ? "wait_inspection" : status;
}
