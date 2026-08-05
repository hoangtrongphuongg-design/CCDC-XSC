# Checklist GitHub — Neon — Vercel

## Neon

- [ ] Tạo/copy pooled connection string có `sslmode=require`.
- [ ] Chạy `drizzle/0000_initial.sql` trong Neon SQL Editor hoặc `npm run db:migrate`.
- [ ] Chạy `npm run db:seed` để tạo admin đầu tiên.
- [ ] Đổi ngay mật khẩu tạm khi đăng nhập lần đầu.

## GitHub

- [ ] Giải nén vào repo đã tạo.
- [ ] Không commit `.env.local`.
- [ ] Chạy `npm install`, `npm run typecheck`, `npm test`, `npm run build`.
- [ ] Commit và push nhánh `main`.

## Vercel

- [ ] Kết nối đúng repo GitHub.
- [ ] Framework preset: Next.js.
- [ ] Khai báo `DATABASE_URL`.
- [ ] Khai báo `AUTH_SECRET` bằng chuỗi ngẫu nhiên dài.
- [ ] Không cần giữ `ADMIN_PASSWORD` trên Vercel sau khi đã seed admin từ máy local.
- [ ] Deploy Preview trước, kiểm thử, sau đó mới promote Production.

## Dữ liệu

- [ ] Chạy import Excel ở chế độ `--dry-run`.
- [ ] Kiểm tra bảng `import_issues`.
- [ ] Chốt các mã/nhóm bất thường trước khi import chính thức.
- [ ] Không tự động nhập lịch sử cấp phát/sửa chữa cũ chưa đối chiếu.
