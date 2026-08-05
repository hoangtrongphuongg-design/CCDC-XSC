# QUẢN LÝ CCDC - XSC — V1.0

Bản code đầu tiên cho hệ thống quản lý máy móc, công cụ dụng cụ của Xưởng Sửa chữa.

## 1. Kiến trúc

- **GitHub:** lưu mã nguồn.
- **Vercel:** build và chạy ứng dụng Next.js.
- **Neon:** cơ sở dữ liệu PostgreSQL.
- **Next.js App Router + TypeScript strict:** giao diện và backend trong cùng một dự án.
- **Drizzle ORM:** schema và truy vấn database.
- **Cookie JWT HttpOnly:** phiên đăng nhập.

## 2. Nghiệp vụ đã có trong V1

- Đăng ký, đăng nhập, tài khoản chờ admin duyệt.
- Admin gán nhóm và quyền `operator`/`manager`.
- Một user có thể có quyền tại nhiều nhóm.
- Tất cả user active xem được CCDC toàn xưởng.
- Chỉ thao tác tại nhóm được phân quyền.
- Máy có một mã duy nhất suốt vòng đời.
- Dụng cụ toàn xưởng và Dụng cụ nhóm tôi.
- Mượn máy có mã.
- Điều chuyển cố định, giữ nguyên mã máy.
- Cho mượn nhanh vật dụng nhỏ/không mã.
- Sửa chữa.
- Thanh lý và xác nhận nhập Kho thanh lý.
- Báo cáo tổng hợp.
- Lịch sử hoạt động.

## 3. Các quy tắc bảo vệ đã đưa vào code

- Quyền ghi được đọc lại trực tiếp từ Neon, không chỉ tin thông tin cũ trong cookie.
- `session_version` làm mất hiệu lực phiên cũ khi khóa tài khoản/reset mật khẩu/thu hồi quyền.
- Mật khẩu bcrypt cost 12.
- Rate-limit đăng nhập theo username.
- Dùng dummy bcrypt hash để giảm khả năng dò username qua thời gian phản hồi.
- Một máy chỉ có một workflow mở của cùng loại; server action khóa dòng máy và kiểm tra workflow khác trong transaction.
- Người tạo không tự duyệt giao dịch ở bước phê duyệt đối ứng.
- Không xóa lịch sử nghiệp vụ; dùng trạng thái hoàn tất/hủy/khóa.
- Mã máy không đổi khi mượn, điều chuyển, sửa chữa hoặc thanh lý.

## 4. Cài đặt local

Yêu cầu Node.js 20 trở lên.

```bash
npm install
cp .env.example .env.local
```

Điền `DATABASE_URL`, `AUTH_SECRET` và thông tin admin vào `.env.local`.

Chạy migration (script sẽ thực thi trực tiếp `drizzle/0000_initial.sql` trên Neon):

```bash
npm run db:migrate
```

Hoặc mở Neon SQL Editor và chạy trực tiếp file `drizzle/0000_initial.sql`. Sau đó tạo admin:

```bash
npm run db:seed
```

Chạy web:

```bash
npm run dev
```

Mở `http://localhost:3000`.

## 5. Import file Excel hiện tại

Chạy thử không ghi database:

```bash
npm run import:excel -- "/duong-dan/THEO DOI CAP PHAT - SUA CHUA CCDC(1).xlsx" --dry-run
```

Nhập chính thức:

```bash
npm run import:excel -- "/duong-dan/THEO DOI CAP PHAT - SUA CHUA CCDC(1).xlsx"
```

Script V1 tự động nhập sheet `DANH_MUC_MAY`, chuẩn hóa các nhóm:

- Workshop
- NBS
- CBL
- Lò
- Mỏ
- NXM
- Cơ khí ca

Các dòng không xác định được được ghi vào `import_issues`. Script chưa tự động nhập toàn bộ nhật ký cấp phát và sửa chữa cũ vì file nguồn có các trường hợp trạng thái/lịch sử không đồng nhất; cần đối chiếu trước khi nhập.

## 6. Kết nối GitHub — Vercel — Neon

### GitHub

1. Tạo repo trống hoặc dùng repo đã tạo.
2. Giải nén bộ code vào thư mục repo.
3. Chạy:

```bash
git add .
git commit -m "Initial CCDC XSC V1"
git push origin main
```

### Vercel

1. Mở project Vercel đã tạo.
2. Chọn **Settings → Git → Connect Git Repository**.
3. Chọn đúng repo GitHub.
4. Framework preset: **Next.js**.
5. Thêm Environment Variables:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `ADMIN_EMPLOYEE_CODE`
   - `ADMIN_FULL_NAME`
6. Deploy.

### Neon

1. Lấy **pooled connection string**.
2. Bảo đảm chuỗi có `sslmode=require`.
3. Chạy `drizzle/0000_initial.sql` trong Neon SQL Editor.
4. Chạy seed admin từ máy local với cùng `DATABASE_URL`.

## 7. Vai trò và quyền

### User active không có quyền nhóm

- Xem toàn bộ CCDC.
- Không thao tác nghiệp vụ.

### Operator nhóm

- Tạo yêu cầu mượn.
- Xác nhận nhận máy.
- Báo trả.
- Tạo mượn nhanh.
- Báo hư.
- Tạo đề xuất điều chuyển/thanh lý.

### Manager nhóm

- Có toàn bộ quyền operator.
- Duyệt máy thuộc nhóm.
- Xác nhận bàn giao/nhận lại.
- Đồng ý điều chuyển.
- Xác nhận đề xuất thanh lý của nhóm.

### WS Manager

- Duyệt điều chuyển cuối.
- Quản lý sửa chữa toàn xưởng.
- Duyệt thanh lý.

### Admin

- Duyệt user.
- Gán/thu hồi quyền nhóm.
- Khóa/mở tài khoản.
- Không mặc định duyệt thay nghiệp vụ.

## 8. Kho thanh lý

Migration tạo nhóm hệ thống `KHO_TL`.

Luồng:

```text
Nhóm tạo đề xuất
→ Manager nhóm xác nhận
→ WS Manager duyệt
→ User có quyền tại KHO_TL xác nhận nhập kho
→ Máy chuyển sang disposal_warehouse
```

Sau khi nhập kho, máy không thể mượn, điều chuyển, sửa chữa hoặc cấp phát lại.

## 9. Chưa đưa vào V1

- Upload và lưu ảnh thực tế.
- Email/Zalo notification.
- Kiểm kê.
- SSO giữa các dự án.
- Import tự động toàn bộ lịch sử cấp phát/sửa chữa cũ.
- Biên bản PDF có chữ ký số.

Schema đã chuẩn bị `notifications` và các trường phụ kiện/ghi chú để mở rộng sau.

## 10. Kiểm tra trước khi production

```bash
npm run typecheck
npm run test
npm run build
```

Kiểm tra thủ công:

1. Đăng ký → pending.
2. Admin duyệt và gán nhóm.
3. User đăng nhập, chỉ thao tác tại nhóm được gán.
4. Mượn máy đủ các bước giao–nhận–trả.
5. Điều chuyển đủ xác nhận hai nhóm + WS.
6. Mượn nhanh xử lý trả tốt/hư/mất.
7. Sửa chữa và trường hợp không thể phục hồi.
8. Thanh lý và nhập Kho thanh lý.
9. Khóa user đang đăng nhập → thao tác tiếp theo bị từ chối.
10. Không xuất hiện cuộn ngang toàn trang trên mobile và desktop hẹp.

## 11. Ghi chú V1

Đây là bản đầu tiên có schema và luồng nghiệp vụ đầy đủ để chạy thử nội bộ. Trước khi dùng production, nên kiểm thử bằng dữ liệu thật của từng nhóm và chốt danh sách user quản lý nhóm/WS Manager/Kho thanh lý.

## 12. Tài liệu kèm theo

- `docs/PROJECT_BRIEF.md`: bản ghi nhớ nghiệp vụ và giao diện.
- `docs/VALIDATION.md`: phạm vi kiểm tra đã thực hiện và các kiểm tra bắt buộc sau khi cài dependency.
- `docs/DEPLOY_CHECKLIST.md`: checklist kết nối GitHub — Neon — Vercel.
