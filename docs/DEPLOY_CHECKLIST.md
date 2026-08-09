# Checklist triển khai bộ code hiện tại

## Neon

- [ ] Sao lưu dữ liệu quan trọng.
- [ ] Xác nhận đúng `DATABASE_URL` production.
- [ ] Chạy `database/update.sql` một lần trước khi deploy code mới.
- [ ] Kiểm tra script hoàn tất mà không có `DROP TABLE` hoặc xóa dữ liệu.

## Kiểm tra source

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Không commit `.env` / `.env.local`.

## Vercel

- [ ] `DATABASE_URL` đã cấu hình.
- [ ] `AUTH_SECRET` đã cấu hình.
- [ ] Push lên nhánh Vercel đang theo dõi.
- [ ] Deployment ở trạng thái Ready.

## Kiểm thử vai trò

- [ ] Người xem toàn xưởng xem được dữ liệu nhưng không tạo/sửa.
- [ ] Công nhân kỹ thuật xem được CCDC nhưng không thấy quyền thêm/sửa.
- [ ] Kỹ sư giám sát thêm/sửa CCDC nhóm mình.
- [ ] Đốc công thêm/sửa CCDC nhóm mình và kế thừa quyền Kỹ sư.
- [ ] Quản lý Xưởng / Admin thêm CCDC cho bất kỳ nhóm nào và vào trang quản trị user.

## Kiểm thử Dụng cụ nhóm tôi

- [ ] Tạo CCDC hiện hữu sinh mã đúng prefix nhóm.
- [ ] Tạo máy mới bởi Quản lý Xưởng / Admin chọn nhóm nhận và sinh mã theo nhóm nhận.
- [ ] Mã hiện hữu và serial trùng tạo cảnh báo mềm.
- [ ] Hai người tạo gần đồng thời không nhận cùng mã hệ thống.
- [ ] `Lưu & thêm tiếp` hoạt động.
- [ ] `Sao chép để tạo mới` không sao chép serial/mã hiện hữu.
- [ ] Sửa dữ liệu lưu old/new trong lịch sử.
- [ ] Hiệu chỉnh nhạy cảm bởi Quản lý Xưởng / Admin bắt nhập lý do.
- [ ] Mobile không phát sinh cuộn ngang toàn trang.
