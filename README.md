# QUẢN LÝ CCDC - XSC — V1.5.2

Bản vá session khi tải lại trang (F5). Không thay đổi schema/database và không đụng dữ liệu CCDC đã nhập.

## Thay đổi auth
- Dùng cookie mới `ccdc_xsc_session_v2` để loại trừ cookie stale của bản cũ.
- `SameSite=Lax`, `HttpOnly`, `Secure` trên production, `Path=/`.
- Có cả `Max-Age=8h` và `Expires=8h`, priority cao.
- Sau login lấy lại `session_version` trực tiếp từ DB trước khi ký token.
- Protected layout bắt buộc dynamic.
- Khi F5 thất bại, trang login hiển thị mã nguyên nhân:
  - AUTH-C01: trình duyệt không gửi cookie.
  - AUTH-C02: JWT/chữ ký/thời hạn không hợp lệ.
  - AUTH-C03: `session_version` trong DB khác token.
  - AUTH-C04: token không còn khớp user.

## Cập nhật an toàn
Chỉ upload/deploy code. Giữ nguyên `DATABASE_URL` và `AUTH_SECRET` trên Vercel.

KHÔNG chạy:
- `npm run db:push`
- `npm run db:init`
- `npm run db:seed`
- migration/SQL cũ

Sau deploy V1.5.2, cần đăng nhập lại 1 lần vì tên cookie đã đổi.
