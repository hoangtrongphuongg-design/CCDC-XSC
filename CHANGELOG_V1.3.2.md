# Thay đổi V1.3.2

## Phân tách vai trò cấp hệ thống

- Quản trị hệ thống và Quản lý Xưởng được cấp, thu hồi và hiển thị độc lập.
- Admin không tự động có quyền duyệt nghiệp vụ toàn xưởng.
- Quản lý Xưởng không tự động có quyền quản trị tài khoản hoặc cấu hình.
- Trang Người dùng & phân quyền có hai nút điều khiển riêng cho từng vai trò.
- Giao diện hiển thị đồng thời tất cả vai trò đang có thay vì ưu tiên ẩn một vai trò.

## Tài khoản admin ban đầu

- Script seed tạo `admin` với `is_admin = true`, `is_ws_manager = false`.
- Quyền nhóm mặc định của admin là Nhân viên tại Workshop.
- Không còn tự cấp quyền Manager tại Workshop hoặc Kho thanh lý.

## Migration

- Thêm `drizzle/0004_separate_system_roles.sql` để chuẩn hóa tài khoản mặc định `admin` đã tạo từ bản cũ.

## Quyền nhóm

- Giữ ba mức riêng: Nhân viên, Operator và Manager.
- Operator xử lý nghiệp vụ thường ngày; Manager quản lý nhóm và có thể thực hiện bước duyệt thay trong phạm vi nhóm.
