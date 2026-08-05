# Giao diện V1.1 — QUẢN LÝ CCDC - XSC

## Mục tiêu

Nâng cấp toàn bộ lớp giao diện theo phong cách quản trị công nghiệp hiện đại, chuyên nghiệp, dễ đọc trên màn hình máy tính và dễ thao tác trên điện thoại; không thay đổi schema database hay quy trình nghiệp vụ.

## Các thay đổi chính

- Sidebar navy mới, chia nhóm chức năng rõ ràng, tự đánh dấu trang đang mở.
- Topbar hiển thị nhóm, vai trò, phạm vi quyền, ngày làm việc và tài khoản.
- Dashboard điều hành mới: tổng hợp công việc mở, KPI và truy cập nhanh theo nghiệp vụ.
- Màn hình Mượn máy, Mượn nhanh, Điều chuyển, Sửa chữa và Thanh lý có KPI theo trạng thái.
- Card nhập liệu bên phải được thiết kế như panel nghiệp vụ, sticky trên desktop.
- Bảng dữ liệu gọn hơn, có trạng thái dữ liệu, hover rõ và tự chuyển thành thẻ trên mobile.
- Báo cáo có biểu đồ thanh CSS không cần thư viện ngoài.
- Trang đăng nhập/đăng ký được thiết kế lại theo bố cục hai vùng, có mô tả giá trị hệ thống.
- Input mật khẩu có nút hiện/ẩn.
- Loading skeleton, empty state, badge, button và focus bàn phím được chuẩn hóa.
- Không có thanh cuộn ngang toàn trang; bảng mobile chuyển sang card.

## Phạm vi kỹ thuật

- Không thêm dependency mới.
- Không sửa migration hoặc schema Neon.
- Không thay đổi API/action nghiệp vụ.
- Có thể thay trực tiếp code V1.0.2 bằng V1.1.0 rồi deploy lại trên Vercel.

## Kiểm tra đã thực hiện

- Kiểm tra cú pháp TypeScript/TSX bằng TypeScript transpiler: 65 file.
- Kiểm tra toàn bộ import nội bộ `@/`: không thiếu file.
- Kiểm tra CSS vẫn có `overflow-x: hidden` và cơ chế table-to-card trên mobile.

Do môi trường tạo gói không tải được package từ npm registry, chưa thể chạy `npm run build` đầy đủ tại đây. Vercel sẽ thực hiện bước build thực tế sau khi GitHub nhận code mới.
