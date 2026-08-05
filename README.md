# QUẢN LÝ CCDC - XSC

**Phiên bản:** 1.3.2  
**Kiến trúc:** GitHub → Vercel → Neon PostgreSQL

## Nội dung chính

- Đồng bộ 13 nhóm nghiệp vụ chính thức và nhóm hệ thống `KHO_TL` trên toàn hệ thống.
- Trang **Dụng cụ toàn xưởng** chỉ dùng để tra cứu.
- Thêm và cập nhật dụng cụ tại **Dụng cụ nhóm tôi** bằng cửa sổ nhập liệu thống nhất.
- Tự sinh mã theo nhóm: `COI-0001`, `WS-0001`, `CBL-0001`; dụng cụ theo số lượng dùng dạng `WS-VT-0001`.
- Mã dụng cụ không đổi trong suốt vòng đời và không tái sử dụng.
- Phân loại thiết bị ở mức vừa đủ: 6 nhóm cơ khí, 2 nhóm điện và 1 nhóm khác.
- Nhân viên được xem dữ liệu, tạo thủ tục Mượn máy/Mượn nhanh, xác nhận nhận và báo trả.
- Operator nhóm cho duyệt; Manager nhóm có quyền quản lý và duyệt thay trong phạm vi nhóm.
- Nhân viên thuộc nhóm cho được xác nhận đã nhận lại máy/dụng cụ.
- Người tạo phiếu không được tự duyệt phiếu của chính mình.
- **Quản trị hệ thống** và **Quản lý Xưởng** là hai vai trò độc lập; một vai trò không tự động cấp vai trò còn lại.

## Cơ cấu nhóm chính thức

### Bảo trì cơ

1. Bảo trì cơ - Nhóm Cối
2. Bảo trì cơ - Nhóm CBL
3. Bảo trì cơ - Nghiền BS-NT
4. Bảo trì cơ - Nhóm Lò
5. Bảo trì cơ - Nhóm NXM
6. Bảo trì cơ - Nhóm Workshop
7. Bảo trì cơ - Nhóm Bôi trơn
8. Bảo trì cơ - Nhóm Băng tải

### Bảo trì điện

9. Bảo trì điện - Nhóm điện Mỏ
10. Bảo trì điện - Nhóm điện CBL - NT
11. Bảo trì điện - Nhóm Nghiền BS - Lò nung
12. Bảo trì điện - Nhóm Nghiền XM - Trạm điện - Phụ trợ

### Nhóm khác

13. Nhóm khác (Đơn vị khác; nhà thầu,...)

### Nhóm hệ thống

- `KHO_TL` — Kho thanh lý

## Ma trận vai trò

| Vai trò | Phạm vi chính |
|---|---|
| Nhân viên — Xem & mượn | Xem dữ liệu; tạo đề nghị mượn; xác nhận nhận và báo trả; xác nhận nhận lại nếu thuộc nhóm cho |
| Operator — Thao tác nhóm | Thêm/cập nhật dụng cụ; duyệt và giao máy/dụng cụ của nhóm; xử lý nghiệp vụ thường ngày |
| Manager — Quản lý nhóm | Quản lý toàn bộ dụng cụ của nhóm; xác nhận điều chuyển, thanh lý và xử lý ngoại lệ cấp nhóm |
| Quản lý Xưởng | Duyệt nghiệp vụ cấp Xưởng, điều phối sửa chữa, phê duyệt cuối điều chuyển và thanh lý |
| Quản trị hệ thống | Quản lý tài khoản, cơ cấu nhóm và cấu hình; không tự động được duyệt nghiệp vụ |

`Operator` và `Manager` là hai mức quyền nhóm khác nhau. `Quản lý Xưởng` và `Quản trị hệ thống` là hai vai trò cấp hệ thống độc lập.

## Luồng Mượn máy

```text
Nhân viên nhóm mượn tạo đề nghị
→ Operator nhóm cho duyệt; Manager có thể duyệt thay
→ Operator nhóm cho xác nhận đã giao; Manager có thể thực hiện thay
→ Nhân viên nhóm mượn xác nhận đã nhận
→ Nhân viên nhóm mượn báo trả
→ Nhân viên thuộc nhóm cho xác nhận nhận lại và tình trạng
→ Hoàn thành
```

## Luồng Mượn nhanh

```text
Nhân viên nhóm mượn tạo đề nghị
→ Operator nhóm cho duyệt; Manager có thể duyệt thay
→ Hệ thống trừ số lượng khỏi danh mục nhóm cho
→ Nhân viên nhóm mượn xác nhận đã nhận
→ Nhân viên nhóm mượn báo trả
→ Nhân viên thuộc nhóm cho xác nhận trả tốt / trả hư / mất
→ Hoàn thành
```

## Cài đặt local

Yêu cầu Node.js 20 trở lên.

```bash
npm install
cp .env.example .env
```

Điền biến môi trường:

```env
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
AUTH_SECRET="chuỗi bí mật dài"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="mật khẩu tối thiểu 8 ký tự"
ADMIN_EMPLOYEE_CODE="ADMIN001"
ADMIN_FULL_NAME="Phương - Quản trị XSC"
```

Chạy:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Tài khoản do `db:seed` tạo chỉ có vai trò **Quản trị hệ thống**, không tự động là **Quản lý Xưởng**.

## Nâng cấp từ V1.3.1

Sau khi cập nhật code, chạy migration mới:

```text
drizzle/0004_separate_system_roles.sql
```

Migration này chuẩn hóa tài khoản mặc định `admin`:

- Gỡ vai trò Quản lý Xưởng đã từng được seed tự động.
- Đưa quyền nhóm Workshop về mức Nhân viên.
- Thu hồi quyền Kho thanh lý đã từng được seed tự động.

Các tài khoản khác không bị thay đổi.

Sau migration, vào:

```text
Quản trị → Người dùng & phân quyền → Vai trò cấp hệ thống
```

Cấp riêng **Quản lý Xưởng** cho đúng người phụ trách nghiệp vụ.

## Triển khai GitHub và Vercel

1. Giải nén bộ code và chép toàn bộ nội dung vào repo hiện tại.
2. Không đưa `.env` lên GitHub.
3. Chạy migration trên Neon trước khi redeploy.
4. Commit và push:

```bash
git add .
git commit -m "Upgrade CCDC XSC to V1.3.2"
git push origin main
```

5. Kiểm tra `DATABASE_URL` và `AUTH_SECRET` trên Vercel.
6. Redeploy.

## Kiểm tra trước khi dùng thử

```bash
npm run typecheck
npm test
npm run build
```

Kiểm tra thủ công:

1. Admin chỉ thấy quyền Quản trị hệ thống nếu chưa được cấp thêm vai trò khác.
2. Quản lý Xưởng không vào được trang quản trị user nếu không có quyền Admin.
3. Admin không duyệt điều chuyển/thanh lý nếu không có vai trò Quản lý Xưởng.
4. Nhân viên tạo phiếu mượn được nhưng không duyệt được.
5. Operator nhóm cho duyệt được; Manager nhóm có thể duyệt thay.
6. Nhân viên nhóm cho xác nhận nhận lại được.
7. Mã dụng cụ tự tăng riêng theo từng nhóm.
8. Dụng cụ toàn xưởng không có nút thêm.
