# Thay đổi của bộ code hiện tại

Ngày cập nhật: 09/08/2026

## Dụng cụ nhóm tôi

- Hoàn thiện danh sách CCDC, KPI nhanh, tìm kiếm và bộ lọc.
- Thêm form tạo CCDC theo từng thiết bị: nguồn hình thành, nhóm quản lý, mã hiện hữu, nhận dạng, phân loại, thông số kỹ thuật, hiện trạng, vị trí và thông tin mua sắm tùy chọn.
- Mã hệ thống tự sinh theo nhóm quản lý ban đầu, cấp trong transaction và tự đồng bộ với mã đã tồn tại để tránh quay lại số cũ.
- Mã hệ thống giữ nguyên khi thiết bị đổi nhóm sau này; mã hiện hữu được lưu riêng để đối chiếu mã đã bấm/khắc/dán trên máy.
- Kỹ sư giám sát và Đốc công được thêm/sửa CCDC thuộc nhóm mình.
- Quản lý Xưởng / Admin được thêm CCDC cho bất kỳ nhóm nào, tiếp nhận/cấp phát máy mua mới và hiệu chỉnh dữ liệu toàn Xưởng.
- Hiệu chỉnh nhạy cảm bởi Quản lý Xưởng / Admin yêu cầu lý do và ghi lịch sử trước/sau.
- Bổ sung `Lưu & thêm tiếp`, `Sao chép để tạo mới`, chi tiết CCDC và lịch sử thay đổi.
- Chưa triển khai hình ảnh trong milestone này.

## Vai trò

- `viewer` hiển thị là **Công nhân kỹ thuật**.
- `operator` hiển thị là **Kỹ sư giám sát**.
- `manager` hiển thị là **Đốc công khu vực** và kế thừa quyền của Kỹ sư giám sát.
- Gộp **Quản lý Xưởng / Admin** thành vai trò cấp hệ thống cao nhất.
- Bổ sung **Người xem toàn xưởng**: được đọc toàn bộ web nhưng không được ghi dữ liệu và không bắt buộc thuộc nhóm.

## Database

- Bổ sung các trường hồ sơ CCDC chi tiết và `origin_group_id`.
- Bổ sung `equipment_type_catalog`.
- Bổ sung `is_readonly_viewer` cho user.
- Bổ sung `actor_role` và `reason` cho lịch sử hoạt động.
- Database hiện tại cần chạy `database/update.sql` một lần trước khi deploy code mới.
