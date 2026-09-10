# drizzle/ — lịch sử migration cũ (KHÔNG phải nguồn chân lý)

Các file `0000_*.sql` … `0004_*.sql` là lịch sử migration của giai đoạn đầu, **đã áp
dụng xong trên production**. Giữ lại để tra cứu, không dùng để dựng lại DB.

## Nguồn chân lý về schema

1. **`src/lib/db/schema.ts`** — định nghĩa Drizzle mà ứng dụng đọc lúc chạy.
2. **`database/current_schema.sql`** + **`database/update.sql`** — DDL viết tay,
   áp thủ công trong Neon SQL Editor. `update.sql` idempotent (`ADD COLUMN IF NOT
   EXISTS`, `CREATE TYPE … EXCEPTION WHEN duplicate_object`), nối thêm vào cuối khi
   có thay đổi. Xem `docs/DEPLOY_CHECKLIST.md`.

Khi sửa schema: cập nhật cả `schema.ts` và `database/*.sql` cho khớp. Không cần thêm
file vào thư mục này.

`npm run db:push` / `db:generate` (drizzle-kit) không nằm trong quy trình deploy
thực tế — chỉ dùng khi dựng DB mới hoàn toàn ở môi trường thử.
