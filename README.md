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

- Database đang hoạt động: không cần chạy SQL khi cập nhật bộ code này.
- Tạo database mới hoàn toàn: chạy `npm run db:init` hoặc chạy `database/current_schema.sql` trong Neon SQL Editor.
- `database/update.sql` ghi rõ thay đổi cần áp dụng cho database hiện tại.

## Cập nhật GitHub/Vercel

1. Giải nén gói code.
2. Chép toàn bộ nội dung vào repo hiện tại.
3. Không chép file `.env` lên GitHub.
4. Commit và push lên nhánh đang liên kết Vercel.
5. Vercel tự build và triển khai.

## Biến môi trường bắt buộc

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="chuỗi bí mật dài"
```

Thông tin thay đổi của gói này nằm trong `CHANGES.md`.
