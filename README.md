# QUẢN LÝ CCDC - XSC — V1.5.4

Bản V1.5.4 kế thừa toàn bộ V1.5.3 và bản vá session V1.5.2. Không thay đổi schema/database và không đụng dữ liệu CCDC đã nhập.

## Nội dung đã gộp
- Giữ nguyên sửa lỗi F5/session của V1.5.2.
- Trang **Dụng cụ toàn xưởng**:
  - có cụm tìm kiếm compact trên một hàng: kính lúp + ô từ khóa + nút **Tìm**;
  - tìm theo mã, tên, loại, nhóm, vị trí, tình trạng/trạng thái;
  - khi có từ khóa tìm kiếm, hiển thị dashboard phân bố **Máy/CCDC có mã theo Nhóm quản lý**, cho biết mỗi nhóm có bao nhiêu máy phù hợp;
  - bảng **Danh mục máy/CCDC có mã** không còn cột **Người giữ**.
- Form **Thêm/Cập nhật máy-CCDC** có trường **Đơn giá mua (VNĐ)**; dùng lại `equipment.purchase_price` đã có sẵn.
- Trang **Dụng cụ nhóm tôi**:
  - dashboard đổi sang 6 card compact: **Tổng CCDC / Sẵn sàng / Đang mượn / Cho mượn / Sửa chữa / Điều chuyển**;
  - bỏ ô **Khác**;
  - card co theo nội dung, không kéo giãn toàn màn hình;
  - card có thể bấm để lọc nhanh danh sách bên dưới;
  - **Đang mượn** và **Cho mượn** được tách theo phía nhóm mượn/nhóm cho mượn;
  - **Sửa chữa** và **Điều chuyển** đọc từ workflow đang mở thay vì gom chung vào trạng thái khác.

## Session/F5 giữ nguyên từ V1.5.2
- Cookie `ccdc_xsc_session_v2`.
- `SameSite=Lax`, `HttpOnly`, `Secure` trên production, `Path=/`.
- `Max-Age=8h`, `Expires=8h`.
- Giữ nguyên cơ chế kiểm tra `session_version`.

## Cập nhật an toàn
Chỉ upload/deploy code. Giữ nguyên `DATABASE_URL` và `AUTH_SECRET` trên Vercel.

**KHÔNG chạy:**
- `npm run db:push`
- `npm run db:init`
- `npm run db:seed`
- migration/SQL khởi tạo cũ

Bản này không yêu cầu migration database.
