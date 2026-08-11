# QUẢN LÝ CCDC - XSC — V1.5.3

Bản V1.5.3 kế thừa bản vá session V1.5.2 và bổ sung tra cứu/đơn giá mua. Không thay đổi schema/database và không đụng dữ liệu CCDC đã nhập.

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

Nếu nâng trực tiếp từ V1.5.1 hoặc cũ hơn, cần đăng nhập lại 1 lần vì V1.5.2 đã đổi tên cookie. Nâng từ V1.5.2 lên V1.5.3 không đổi cơ chế session.


## V1.5.3 - cập nhật 11/08/2026

- Trang **Dụng cụ toàn xưởng** có ô tìm kiếm ở phía trên bên phải; tìm theo mã, tên, loại, nhóm, vị trí và trạng thái.
- Bảng **Danh mục máy/CCDC có mã** đã bỏ cột **Người giữ**.
- Form **Thêm/Cập nhật máy-CCDC** có trường **Đơn giá mua (VNĐ)** cho mọi nguồn hình thành. Trường này dùng lại cột `equipment.purchase_price` đã có sẵn nên **không cần migration và không ảnh hưởng dữ liệu hiện có**.
- Khi cập nhật bản này: **không chạy `db:push`, `db:init`, `db:seed` hoặc SQL khởi tạo cũ**.
