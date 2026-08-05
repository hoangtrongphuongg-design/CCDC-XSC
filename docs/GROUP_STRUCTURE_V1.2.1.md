# Cơ cấu nhóm chính thức — V1.2.1

## Bảo trì cơ

1. `COI` — Bảo trì cơ - Nhóm Cối
2. `CBL` — Bảo trì cơ - Nhóm CBL
3. `NBS` — Bảo trì cơ - Nghiền BS-NT
4. `LO` — Bảo trì cơ - Nhóm Lò
5. `NXM` — Bảo trì cơ - Nhóm NXM
6. `WORKSHOP` — Bảo trì cơ - Nhóm Workshop
7. `BOI_TRON` — Bảo trì cơ - Nhóm Bôi trơn
8. `BANG_TAI` — Bảo trì cơ - Nhóm Băng tải

## Bảo trì điện

1. `DIEN_MO` — Bảo trì điện - Nhóm điện Mỏ
2. `DIEN_CBL_NT` — Bảo trì điện - Nhóm điện CBL - NT
3. `DIEN_NBS_LO` — Bảo trì điện - Nhóm Nghiền BS - Lò nung
4. `DIEN_NXM_TD_PT` — Bảo trì điện - Nhóm Nghiền XM - Trạm điện - Phụ trợ

## Nhóm khác và nhóm hệ thống

- `NHOM_KHAC` — Nhóm khác (Đơn vị khác; nhà thầu,...)
- `KHO_TL` — Kho thanh lý; nhóm hệ thống, không xuất hiện khi đăng ký tài khoản.

## Quy tắc đồng bộ

- Đồng bộ tạo nhóm còn thiếu, cập nhật đúng tên và kích hoạt các nhóm chính thức.
- Các mã `WORKSHOP`, `CBL`, `NBS`, `LO`, `NXM` được giữ lại để không phá lịch sử dữ liệu cũ.
- Hai mã thử nghiệm cũ `MO` và `CK_CA` chỉ tự ngừng hoạt động nếu không còn máy, người dùng hoặc quyền đang gán.
- Không xóa cứng nhóm đã phát sinh dữ liệu.
