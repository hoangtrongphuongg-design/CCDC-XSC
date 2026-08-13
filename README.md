# QUẢN LÝ CCDC - XSC — V1.6.3

## Thay đổi V1.6.3

- Rút gọn luồng Mượn máy còn 4 bước: Tạo đề nghị → Nhóm cho mượn Duyệt (đồng thời bàn giao/đã nhận) → Nhóm mượn Gửi trả → Nhóm chủ máy Xác nhận nhận lại.
- Mobile có khu vực **Việc cần xử lý** để duyệt/từ chối, gửi trả và xác nhận nhận lại theo đúng quyền; Mượn nhanh cũng có các action chính trên mobile.
- Ghi thêm audit theo chính CCDC ở các mốc tạo đề nghị, duyệt/bàn giao, gửi trả, hoàn tất để lịch sử máy truy vết được vòng đời mượn/trả.
- Trang **Dụng cụ nhóm tôi** cân lại cột Cập nhật/Thao tác, không chồng chữ và vẫn không cuộn ngang.
- Không thay đổi schema/database, không migration, không reset dữ liệu.

## Mobile V1
- Trang Tổng quan trên điện thoại chuyển thành màn hình thao tác nhanh: Tìm CCDC, Mượn CCDC, Trả CCDC, Báo hư, CCDC nhóm tôi.
- Chỉ hiển thị thông tin nhận diện tối thiểu trên card mobile.
- Việc cần xử lý và CCDC đang liên quan hiển thị gọn theo quyền người dùng.
- Mượn máy và CCDC lặt vặt được trình bày như hai lựa chọn trong cùng khu vực mobile; backend vẫn giữ hai workflow riêng.
- Trang Mượn trên mobile ưu tiên form trước; danh sách/bảng chi tiết giữ cho desktop.
- Có danh sách nhanh CCDC đang mượn/chờ trả để thao tác Trả ngay trên mobile.
- Thanh điều hướng mobile đổi thành Trang chủ / CCDC / Thao tác nhanh / Mượn-Trả / Cá nhân.
- Không thay database, không migration, không reset dữ liệu.

# QUẢN LÝ CCDC - XSC — V1.5.9

Bản V1.5.9 phát triển từ V1.5.8. Không thay đổi schema/database và không reset dữ liệu CCDC, tài khoản hay lịch sử nghiệp vụ hiện có.

## Thay đổi chính V1.5.9

### 1. Mượn máy
- Trường **Máy cần mượn** đổi từ dropdown dài sang ô tìm kiếm có gợi ý.
- Có thể gõ mã hệ thống, mã hiện hữu, tên máy, model, loại hoặc nhóm quản lý.
- Chỉ đề xuất máy **Sẵn sàng + tình trạng Tốt** và không nằm trong workflow đang mở.
- Không hiện máy đang mượn, sửa chữa, điều chuyển, thanh lý hoặc đã có đề nghị mượn đang mở.
- Backend kiểm tra lại trạng thái và workflow ngay khi gửi đề nghị để tránh chọn trùng.
- Trên mobile, danh sách chọn mở thành panel lớn dễ thao tác bằng cảm ứng.

### 2. Cho mượn nhanh
- Trường chọn dụng cụ đổi sang ô tìm kiếm có gợi ý.
- Chỉ hiện dụng cụ còn số lượng tại đúng **Nhóm cho mượn** đang chọn.
- Có thể tìm theo mã, tên, quy cách.
- Khi chọn dụng cụ từ danh mục, backend lấy tên/quy cách/đơn vị chuẩn từ database và kiểm tra lại tồn trước khi tạo phiếu.
- Form responsive cho desktop/mobile.

### 3. Điều chuyển
- Chỉ **Đốc công khu vực** của nhóm quản lý máy được tạo đề xuất điều chuyển.
- Danh sách máy chỉ hiện máy thuộc **Nhóm đại diện** mà người dùng đang có vai trò Đốc công.
- Không hiển thị máy của nhóm khác.
- Không hiển thị máy đang nằm trong workflow mượn/sửa chữa/điều chuyển/thanh lý khác.
- Backend bắt buộc `actingGroupId = ownerGroupId` và kiểm tra lại workflow trước khi tạo phiếu.
- Ô chọn máy dùng tìm kiếm có gợi ý, tối ưu desktop/mobile.

### 4. Giao diện theo vai trò
- Menu nghiệp vụ được ẩn/hiện theo quyền thực tế.
- **Người xem toàn xưởng** không thấy các menu thao tác nghiệp vụ.
- **Điều chuyển/Thanh lý** chỉ hiện cho Đốc công hoặc quyền toàn Xưởng tương ứng.
- **Admin** vẫn có menu Quản trị.
- Việc ẩn menu chỉ là UX; backend vẫn kiểm tra quyền độc lập.

### 5. Tổng quan
Giữ nguyên dashboard điều hành và bổ sung:
- KPI: Cần xử lý, Tổng CCDC, Sẵn sàng, Đang mượn, Sửa chữa, Điều chuyển.
- **Công việc cần xử lý** theo vai trò.
- **Trạng thái dụng cụ**.
- **Phân bố CCDC theo nhóm**.
- **Hoạt động gần đây**.
- Phạm vi dashboard tự điều chỉnh theo vai trò: Admin/Quản lý Xưởng/Người xem toàn xưởng xem toàn XSC; người dùng theo nhóm xem các nhóm được phân quyền.
- Thêm **Tìm kiếm & phân tích CCDC**: gõ ví dụ `máy hàn` hoặc lọc nhóm/trạng thái để tạo dashboard thống kê riêng cho tập kết quả mà không làm mất dashboard Tổng quan cũ.

### 6. Nguyên tắc không cuộn ngang
- Bảng desktop ép trong chiều rộng viewport, nội dung dài tự xuống dòng.
- Mobile chuyển bảng sang card khi cần.
- Không dùng thanh cuộn ngang để xem hết nội dung chính.
- Các tab mobile được co trong chiều rộng màn hình.

## Các chức năng trước vẫn giữ
- Sửa lỗi F5/session từ V1.5.2.
- Đơn giá mua.
- Tìm kiếm Dụng cụ toàn xưởng + thống kê theo nhóm.
- Dashboard 6 ô Dụng cụ nhóm tôi.
- Workflow sửa chữa nội bộ / thuê ngoài.
- Phân quyền tập trung V1.5.7 và bảo vệ Admin.
- Nhóm KHBT và Ban Quản Đốc đã nằm trong cơ cấu chuẩn; database hiện hữu vẫn cần có 2 bản ghi nhóm tương ứng.

## V1.6.0 — Cho mượn nhanh linh hoạt CCDC ngoài danh mục
- CCDC trong danh mục: tìm kiếm theo mã/tên/quy cách và chọn để liên kết; hệ thống kiểm soát số lượng tồn khi duyệt.
- CCDC chưa có trong danh mục: được nhập trực tiếp tên + quy cách + số lượng + đơn vị, không bắt buộc tạo danh mục trước.
- Bản ghi được hiển thị rõ `Có trong danh mục` hoặc `Ngoài danh mục`.
- CCDC ngoài danh mục không tự trừ tồn kho; lịch sử mượn/trả vẫn được lưu đầy đủ.
- Form được bố trí thành 2 lựa chọn rõ ràng, responsive trên desktop/mobile và không cuộn ngang.
- Không thay đổi schema database, không cần migration.

## Cập nhật an toàn
Chỉ upload/deploy code. Giữ nguyên `DATABASE_URL` và `AUTH_SECRET` trên Vercel.

**KHÔNG chạy:**
- `npm run db:push`
- `npm run db:init`
- `npm run db:seed`
- migration/SQL khởi tạo cũ

Bản này **không yêu cầu migration database**.

## V1.6.4
- Thông báo kết quả thao tác chuyển thành cửa sổ xác nhận ở giữa màn hình (mobile + desktop).
- Mượn máy: trạng thái hiển thị theo góc nhìn nhóm: nhóm sở hữu = Đang cho mượn; nhóm nhận = Đang mượn.
- Trả máy: nhóm mượn chỉ Báo trả; chỉ Kỹ sư/Đốc công (operator+) của nhóm sở hữu được Xác nhận nhận lại. Backend kiểm tra lại quyền.
- Thêm / cấp phát CCDC: bổ sung Kiểu quản lý `Có mã riêng` và `Theo số lượng`. CCDC nhỏ lẻ nhập Tên, Loại, Quy cách, ĐVT, Số lượng, Đơn giá, Nhóm quản lý, Vị trí, Tình trạng, Ghi chú.
- Giữ các cập nhật V1.6.3: mobile action inbox, luồng mượn rút gọn, audit mượn/trả, cân cột Dụng cụ nhóm tôi.

### Cập nhật DB cho V1.6.4
Không reset/seed database. Chỉ chạy `database/update.sql` một lần; phần V1.6.4 dùng `ADD COLUMN IF NOT EXISTS` để bổ sung `purchase_price`, `current_location`, `condition` cho `tool_catalog`.
