# QUẢN LÝ CCDC - XSC

**Phiên bản:** 1.3.1  
**Kiến trúc:** GitHub → Vercel → Neon PostgreSQL

## 1. Nội dung chính của V1.3.1

- Đồng bộ 13 nhóm nghiệp vụ chính thức và 1 nhóm hệ thống `KHO_TL`.
- Danh sách nhóm được dùng thống nhất tại đăng ký, phân quyền, danh mục dụng cụ, mượn, điều chuyển, sửa chữa, thanh lý và báo cáo.
- Trang **Dụng cụ toàn xưởng** chỉ dùng để tra cứu.
- Việc thêm và cập nhật được chuyển về **Dụng cụ nhóm tôi** bằng một cửa sổ nhập liệu thống nhất.
- Hệ thống tự sinh mã theo nhóm:
  - Máy/CCDC quản lý từng thiết bị: `COI-0001`, `WS-0001`, `CBL-0001`.
  - Dụng cụ quản lý theo số lượng: `COI-VT-0001`, `WS-VT-0001`.
- Mã đã cấp không đổi trong suốt vòng đời và không tái sử dụng.
- Phân loại thiết bị ở mức vừa đủ: 6 nhóm cơ khí, 2 nhóm điện và 1 nhóm khác.
- Bổ sung quyền `viewer`, hiển thị là **Nhân viên — Xem & mượn**.
- Mọi nhân viên thuộc nhóm được lập thủ tục **Mượn máy** và **Mượn nhanh**.
- Operator/Manager của nhóm cho duyệt phiếu.
- Nhân viên thuộc nhóm cho được xác nhận đã nhận lại máy/dụng cụ.
- Người tạo phiếu không được tự duyệt chính phiếu đó.

## 2. Cơ cấu nhóm chính thức

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

### Khác

13. Nhóm khác (Đơn vị khác; nhà thầu,...)

### Nhóm hệ thống

- `KHO_TL` — Kho thanh lý

## 3. Quyền người dùng

| Mức quyền | Phạm vi chính |
|---|---|
| Nhân viên — Xem & mượn | Xem dữ liệu; tạo đề nghị mượn máy/mượn nhanh; xác nhận nhận, báo trả; xác nhận nhận lại nếu thuộc nhóm cho |
| Operator — Thao tác nhóm | Có quyền Nhân viên; thêm/cập nhật dụng cụ; duyệt và giao máy/dụng cụ của nhóm |
| Manager — Quản lý nhóm | Kế thừa Operator; hoàn thành hồ sơ nháp và xử lý các bước quản lý nhóm |
| WS Manager | Duyệt nghiệp vụ cấp Xưởng, sửa chữa và thanh lý theo luồng |
| Admin | Quản lý tài khoản, nhóm và cấu hình; không tự động có quyền duyệt nghiệp vụ nếu chưa được gán quyền nhóm |

## 4. Luồng Mượn máy

```text
Nhân viên nhóm mượn tạo đề nghị
→ Operator/Manager nhóm cho duyệt
→ Operator/Manager nhóm cho xác nhận đã giao
→ Nhân viên nhóm mượn xác nhận đã nhận
→ Nhân viên nhóm mượn báo trả
→ Nhân viên bất kỳ thuộc nhóm cho xác nhận nhận lại và tình trạng
→ Hoàn thành
```

## 5. Luồng Mượn nhanh

```text
Nhân viên nhóm mượn tạo đề nghị
→ Operator/Manager nhóm cho duyệt
→ Hệ thống trừ số lượng khỏi danh mục nhóm cho
→ Nhân viên nhóm mượn xác nhận đã nhận
→ Nhân viên nhóm mượn báo trả
→ Nhân viên thuộc nhóm cho xác nhận trả tốt / trả hư / mất
→ Hoàn thành
```

## 6. Cài đặt local

Yêu cầu Node.js 20 trở lên.

```bash
npm install
cp .env.example .env
```

Điền các biến trong `.env`:

```env
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
AUTH_SECRET="chuỗi bí mật dài"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="mật khẩu tối thiểu 8 ký tự"
ADMIN_EMPLOYEE_CODE="ADMIN001"
ADMIN_FULL_NAME="Phương - Quản trị XSC"
```

Chạy migration:

```bash
npm run db:migrate
```

Tạo admin lần đầu:

```bash
npm run db:seed
```

Chạy web:

```bash
npm run dev
```

Mở `http://localhost:3000`.

## 7. Nâng cấp từ bản đang dùng

Bản V1.3.1 có thay đổi database. Sau khi cập nhật code, phải chạy migration trước khi trải nghiệm tính năng mới.

### Cách 1 — Chạy bằng Terminal

```bash
npm install
npm run db:migrate
```

Script sẽ chạy lần lượt:

```text
drizzle/0000_initial.sql
drizzle/0001_groups_assets_viewer.sql
drizzle/0002_employee_loan_permissions.sql
drizzle/0003_quick_loan_default.sql
```

### Cách 2 — Chạy trực tiếp trên Neon

Mở Neon → SQL Editor và chạy lần lượt các file chưa chạy:

```text
drizzle/0001_groups_assets_viewer.sql
drizzle/0002_employee_loan_permissions.sql
drizzle/0003_quick_loan_default.sql
```

Sau đó vào web:

```text
Quản trị → Cơ cấu nhóm Xưởng → Đồng bộ 13 nhóm chính thức
```

Không xóa database cũ và không chạy lại seed nếu tài khoản admin đã tồn tại.

## 8. Triển khai GitHub và Vercel

1. Giải nén bộ code.
2. Chép toàn bộ nội dung vào repo GitHub hiện tại.
3. Không đưa `.env` lên GitHub.
4. Commit và push:

```bash
git add .
git commit -m "Upgrade CCDC XSC to V1.3.1"
git push origin main
```

5. Trên Vercel, kiểm tra:
   - `DATABASE_URL`
   - `AUTH_SECRET`
6. Redeploy sau khi migration Neon đã hoàn tất.

## 9. Kiểm tra trước khi dùng thử

```bash
npm run typecheck
npm test
npm run build
```

Kiểm tra thủ công:

1. Admin đồng bộ 13 nhóm chính thức.
2. Gán một user mức Nhân viên, một user mức Operator.
3. Nhân viên tạo phiếu Mượn máy.
4. Operator nhóm cho duyệt và giao.
5. Nhân viên nhóm mượn nhận và báo trả.
6. Một Nhân viên của nhóm cho xác nhận nhận lại.
7. Lặp lại với Mượn nhanh.
8. Kiểm tra mã tự sinh tại Dụng cụ nhóm tôi.
9. Kiểm tra Dụng cụ toàn xưởng không còn nút thêm.
10. Kiểm tra lịch sử hoạt động ghi đúng người, nhóm và thời gian.

## 10. Lưu ý

- Bản này chưa tích hợp upload ảnh thật lên dịch vụ lưu trữ.
- Không tự động migrate database khi Vercel build; migration phải chạy riêng trên Neon hoặc máy local.
- Trước khi đưa vào vận hành chính thức, nên thử với 3–5 tài khoản và 20–30 dụng cụ thật.
