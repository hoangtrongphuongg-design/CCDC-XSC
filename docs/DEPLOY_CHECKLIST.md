# Checklist nâng cấp V1.3.1

## Neon

- [ ] Sao lưu hoặc kiểm tra dữ liệu quan trọng trước khi nâng cấp.
- [ ] Xác nhận `DATABASE_URL` là pooled connection string và có `sslmode=require`.
- [ ] Chạy `npm run db:migrate` hoặc chạy thủ công `0001`, `0002` và `0003` trong Neon SQL Editor.
- [ ] Kiểm tra bảng `groups` có đủ 13 nhóm nghiệp vụ và `KHO_TL`.
- [ ] Kiểm tra enum `permission_level` có `viewer`.
- [ ] Kiểm tra enum `quick_loan_status` có `pending_approval`.
- [ ] Không chạy lại `db:seed` nếu admin đã tồn tại.

## GitHub

- [ ] Giải nén bộ code, không upload nguyên file ZIP vào repo.
- [ ] Không commit `.env` hoặc `.env.local`.
- [ ] Chạy `npm install`.
- [ ] Chạy `npm run typecheck`.
- [ ] Chạy `npm test`.
- [ ] Chạy `npm run build`.
- [ ] Commit và push nhánh `main`.

## Vercel

- [ ] Kiểm tra `DATABASE_URL`.
- [ ] Kiểm tra `AUTH_SECRET`.
- [ ] Chỉ redeploy sau khi migration Neon hoàn tất.
- [ ] Kiểm tra deployment ở trạng thái `Ready`.

## Kiểm thử quyền

- [ ] Nhân viên tạo được Mượn máy.
- [ ] Nhân viên tạo được Mượn nhanh.
- [ ] Nhân viên không duyệt được phiếu.
- [ ] Operator đúng nhóm cho duyệt được.
- [ ] Operator nhóm khác không duyệt được.
- [ ] Nhân viên nhóm cho xác nhận nhận lại được.
- [ ] Người tạo không tự duyệt phiếu của chính mình.
