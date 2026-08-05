# Báo cáo kiểm tra bộ code V1.0

Ngày kiểm tra: 2026-08-05

## Đã kiểm tra trong môi trường tạo mã

- 62 file `.ts`/`.tsx` đã được TypeScript transpile kiểm tra cú pháp: **0 lỗi**.
- Toàn bộ import nội bộ dạng `@/...` đã được đối chiếu với file thực tế: **0 đường dẫn thiếu**.
- `package.json` và `tsconfig.json` đọc được dưới dạng JSON hợp lệ.
- Không phát hiện connection string, mật khẩu thật, private key hoặc secret thật trong bộ code.
- File Excel nguồn không được đóng gói vào repo; script import nhận đường dẫn file do người triển khai cung cấp.
- Schema SQL có partial unique index để ngăn nhiều phiếu mở cùng loại trên một máy.
- Server action khóa dòng máy bằng `FOR UPDATE`, kiểm tra workflow chéo và thực hiện thay đổi trong transaction.
- Quyền tài khoản và quyền nhóm được đọc lại từ Neon cho mỗi thao tác bảo vệ.

## Chưa thể chạy trong môi trường tạo mã

Không thể hoàn tất `npm install`, `npm run typecheck`, `npm test` và `npm run build` vì npm registry nội bộ của môi trường tạo mã trả lỗi `404` đối với gói `next`. Đây là hạn chế của môi trường đóng gói, không phải kết quả build của dự án.

## Bắt buộc chạy sau khi giải nén

```bash
npm install
npm run typecheck
npm test
npm run build
```

Sau đó mới kết nối production trên Vercel.

## Kiểm thử nghiệp vụ tối thiểu trước khi dùng thật

1. Đăng ký tài khoản mới → `pending`.
2. Admin duyệt và gán quyền nhóm.
3. Khóa user đang đăng nhập → thao tác kế tiếp bị từ chối.
4. Hai user cùng yêu cầu một máy → chỉ một workflow được tạo hợp lệ.
5. Mượn máy đủ luồng duyệt, giao, nhận, báo trả, nhận lại.
6. Chuyển phiếu mượn đang hoạt động thành điều chuyển cố định.
7. Cho mượn nhanh trả tốt, hư, mất và trả một phần.
8. Báo hư khi máy đang mượn và tạo phiếu sửa chữa liên kết.
9. Sửa không phục hồi → đề xuất thanh lý.
10. Thanh lý chỉ hoàn thành sau khi user có quyền `KHO_TL` xác nhận nhận kho.
11. Máy trong Kho thanh lý không mở được phiếu mượn, điều chuyển hoặc sửa chữa.
12. Kiểm tra responsive ở 390px, 768px, 1024px, 1280px và 1366px; không có cuộn ngang toàn trang.
