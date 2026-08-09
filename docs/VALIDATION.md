# Báo cáo kiểm tra bộ code hiện tại

Ngày kiểm tra: 09/08/2026

## Đã kiểm tra trong môi trường đóng gói

- 75 file `.ts`/`.tsx` (không tính `.d.ts`) được TypeScript parser kiểm tra cú pháp: **0 lỗi cú pháp**.
- 284 import nội bộ được đối chiếu với cây source: **0 đường dẫn thiếu**.
- 18 kiểm tra tĩnh của milestone Dụng cụ nhóm tôi đạt: mã hiện hữu, cấp phát ban đầu, audit Admin, counter DB, form, migration và vai trò.
- `database/update.sql` không có `DROP TABLE` và chỉ bổ sung schema cho milestone hiện tại.
- File ZIP sẽ được kiểm tra toàn vẹn trước khi bàn giao.

## Chưa thể chạy trong môi trường đóng gói

Không thể chạy `npm install`, `npm run typecheck`, `npm test` và `npm run build` đầy đủ vì môi trường không có dependency của dự án và npm cache trống. Cần chạy các lệnh này sau khi đưa source vào môi trường có npm registry/dependency.

## Bắt buộc trước production

```bash
npm install
npm run typecheck
npm test
npm run build
```

Sau đó chạy thử module bằng dữ liệu thật quy mô nhỏ trước khi nhập hàng loạt.
