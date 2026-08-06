# Nâng cấp giao diện V1.4.0

Phiên bản này chỉ thay đổi ngôn ngữ giao diện, không thay đổi schema Neon hoặc quy trình nghiệp vụ.

## Nguyên tắc áp dụng

- Mobile là tham chiếu thị giác chính.
- Desktop dùng cùng palette sáng, card trắng và accent indigo với mobile.
- Sidebar desktop chuyển sang nền sáng; không còn mảng navy/đen.
- Mobile dùng bottom navigation với hành động trung tâm nổi bật.
- Bảng desktop đặt trong card nhẹ; mobile chuyển thành thẻ.
- Form, modal, drawer và trang đăng nhập dùng cùng bề mặt, bo góc và hệ màu.

## Token chính

- App background: `#F6F7FB`
- Sidebar: `#FAFAFF`
- Surface: `#FFFFFF`
- Accent: `#5B4CF5`
- Accent soft: `#EEECFF`
- Text: `#111827`
- Muted text: `#6B7280`

## Triển khai

Không cần chạy migration. Chỉ cập nhật code lên GitHub và chờ Vercel build lại.
