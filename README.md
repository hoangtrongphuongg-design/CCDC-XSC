# QUẢN LÝ CCDC - XSC

Bộ code hiện tại của hệ thống quản lý công cụ dụng cụ Xưởng Sửa chữa.

## Công nghệ

- Next.js 15, React 19, TypeScript
- Neon PostgreSQL, Drizzle ORM
- Vercel
- Xác thực username/password bằng cookie JWT

## Chạy trên máy

```bash
npm install
cp .env.example .env
npm run dev
```

## Database

### Database Neon đang hoạt động

Trước khi deploy code mới, sao lưu dữ liệu quan trọng rồi chạy **một lần** file:

```text
database/update.sql
```

File này chỉ bổ sung schema cần cho milestone `Dụng cụ nhóm tôi`; không xóa bảng hoặc dữ liệu hiện hữu.

### Database mới hoàn toàn

Chạy:

```bash
npm run db:init
npm run db:seed
```

Hoặc chạy `database/current_schema.sql` trong Neon SQL Editor rồi chạy script seed.

## Kiểm tra trước khi deploy

```bash
npm run typecheck
npm test
npm run build
```

## Cập nhật GitHub / Vercel

1. Giải nén bộ code và chép nội dung vào repo hiện tại.
2. Không commit `.env` hoặc `.env.local`.
3. Chạy `database/update.sql` trên Neon hiện tại trước khi deploy code mới.
4. Commit/push lên nhánh đang liên kết Vercel.
5. Kiểm tra build Vercel và thử quyền theo tài khoản thực tế.

## Biến môi trường bắt buộc

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="chuỗi bí mật dài"
```

Thông tin thay đổi của gói hiện tại nằm trong `CHANGES.md`.
