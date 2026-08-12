# QUẢN LÝ CCDC - XSC — V1.5.6

Bản V1.5.6 kế thừa toàn bộ V1.5.3 và bản vá session V1.5.2. Không thay đổi schema/database và không đụng dữ liệu CCDC đã nhập.

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


## V1.5.6 - Luồng sửa chữa nội bộ / thuê ngoài

- Sau khi WS tiếp nhận, mặc định chuyển sang sửa chữa nội bộ.
- Nếu sửa nội bộ đạt: hoàn tất, chạy thử và chờ nhóm quản lý nhận lại.
- Nếu nội bộ không sửa được: chuyển `repair_type=external`, lưu đơn vị sửa ngoài và lý do.
- Khi nhận từ đơn vị ngoài: nếu đạt thì chờ nhóm nhận lại; nếu không thể phục hồi mới chuyển chờ thanh lý.
- Tận dụng các cột `repair_type`, `vendor`, `work_description`, `result_notes`, `cost` đã có sẵn; không thay schema và không cần migration.
- Không chạy db:push/db:init/db:seed khi cập nhật bản này trên database đang có dữ liệu.


## V1.5.6
- Bổ sung nhóm KHBT và Ban Quản Đốc vào cơ cấu chuẩn.
- Người xem toàn xưởng được duyệt độc lập, không cần chọn/gán nhóm.
- Sau deploy, Admin vào Cơ cấu nhóm Xưởng và bấm “Đồng bộ 15 nhóm chính thức” một lần để thêm 2 nhóm vào DB hiện hữu. Thao tác dùng upsert, không xóa dữ liệu máy/CCDC.
