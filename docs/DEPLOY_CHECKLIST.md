# Checklist nâng cấp V1.3.2

## Neon

- [ ] Sao lưu hoặc kiểm tra dữ liệu quan trọng trước khi nâng cấp.
- [ ] Xác nhận `DATABASE_URL` là pooled connection string và có `sslmode=require`.
- [ ] Chạy `drizzle/0004_separate_system_roles.sql` nếu nâng cấp từ V1.3.1.
- [ ] Kiểm tra tài khoản `admin` có `is_admin = true` và `is_ws_manager = false`.
- [ ] Kiểm tra quyền nhóm mặc định của `admin` tại Workshop là `viewer`.
- [ ] Kiểm tra quyền Kho thanh lý của `admin` mặc định đã được thu hồi.
- [ ] Không chạy lại `db:seed` nếu admin đã tồn tại.

## GitHub

- [ ] Giải nén bộ code; không upload nguyên file ZIP vào repo.
- [ ] Không commit `.env` hoặc `.env.local`.
- [ ] Chạy `npm install`.
- [ ] Chạy `npm run typecheck`.
- [ ] Chạy `npm test`.
- [ ] Chạy `npm run build`.
- [ ] Commit và push nhánh `main`.

## Vercel

- [ ] Kiểm tra `DATABASE_URL`.
- [ ] Kiểm tra `AUTH_SECRET`.
- [ ] Redeploy sau khi migration Neon hoàn tất.
- [ ] Kiểm tra deployment ở trạng thái `Ready`.

## Kiểm thử vai trò

- [ ] Admin vào được trang Người dùng và Cơ cấu nhóm.
- [ ] Admin không duyệt điều chuyển hoặc thanh lý nếu không có vai trò Quản lý Xưởng.
- [ ] Quản lý Xưởng duyệt nghiệp vụ cấp Xưởng nhưng không vào được trang quản trị user nếu không có Admin.
- [ ] Cấp/thu hồi Quản lý Xưởng không làm thay đổi quyền Admin.
- [ ] Cấp/thu hồi Admin không làm thay đổi vai trò Quản lý Xưởng.
- [ ] Giao diện hiển thị riêng cả hai vai trò khi một người được cấp cả hai.

## Kiểm thử quyền nhóm và mượn

- [ ] Nhân viên tạo được Mượn máy và Mượn nhanh.
- [ ] Nhân viên không duyệt được phiếu.
- [ ] Operator đúng nhóm cho duyệt được.
- [ ] Operator nhóm khác không duyệt được.
- [ ] Manager nhóm có thể duyệt thay trong phạm vi nhóm.
- [ ] Nhân viên nhóm cho xác nhận nhận lại được.
- [ ] Người tạo không tự duyệt phiếu của chính mình.
