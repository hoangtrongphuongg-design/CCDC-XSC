# QUẢN LÝ CCDC - XSC — V1.5.1

Bản GitHub-ready của hệ thống quản lý công cụ dụng cụ Xưởng Sửa chữa.

## Công nghệ

- Next.js 15, React 19, TypeScript
- Neon PostgreSQL, Drizzle ORM
- Vercel
- Xác thực username/password bằng cookie JWT HttpOnly

## Lưu ý cho hệ thống đang có dữ liệu thực tế

Bản V1.5.1 này chỉ sửa cơ chế session/login khi tải lại trang (F5).

**Không có thay đổi schema database cho bản vá này.**

Khi cập nhật từ bản đang chạy có dữ liệu CCDC:

- KHÔNG chạy `npm run db:push`.
- KHÔNG chạy `npm run db:init`.
- KHÔNG chạy `npm run db:seed`.
- KHÔNG chạy lại file SQL/migration cũ chỉ để cập nhật V1.5.1.
- Giữ nguyên `DATABASE_URL` đang trỏ tới Neon hiện tại.
- Giữ nguyên `AUTH_SECRET` trên Vercel; không tạo secret mới khi deploy bản vá.

Các thư mục `database/` và `drizzle/` được giữ lại để bảo toàn lịch sử schema/migration của dự án, nhưng không cần chạy lại khi chỉ nâng V1.5.0 -> V1.5.1.

## Thay đổi V1.5.1

- Sau đăng nhập, server đặt session cookie và redirect trực tiếp tới `/dashboard`.
- Phân biệt lỗi JWT/session với lỗi truy vấn Neon để lỗi database không bị hiểu nhầm thành mất đăng nhập.
- Không thay đổi dữ liệu máy/CCDC.

## Chạy local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Cấu hình:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="chuỗi bí mật dài đang dùng"
```

## Kiểm tra trước deploy

```bash
npm run typecheck
npm test
npm run build
```

## Đưa lên GitHub / Vercel

1. Giải nén gói này.
2. Upload **các file và thư mục bên trong** vào repo GitHub hiện tại.
3. Không upload `.env` hoặc `.env.local`.
4. Không chạy lệnh database đối với bản vá V1.5.1.
5. Push/commit lên nhánh đang liên kết Vercel.
6. Sau khi Vercel deploy xong, đăng nhập lại một lần và thử F5 ở Dashboard, Dụng cụ nhóm tôi và trang chi tiết máy.

## Cấu trúc giữ lại

- `src/`: toàn bộ source ứng dụng.
- `public/`: tài nguyên giao diện/nhận diện.
- `database/`, `drizzle/`: schema và lịch sử migration.
- `scripts/`: công cụ database/import hiện có.
- `tests/`: bộ test dự án.

Bản này đã loại các tài liệu thiết kế và changelog cũ để tổng số file phù hợp giới hạn upload web của GitHub.
