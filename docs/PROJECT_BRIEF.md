# BẢN GHI NHỚ HIỆN TẠI — QUẢN LÝ CCDC - XSC

## Nguyên tắc dữ liệu

- Một máy có một mã hệ thống duy nhất dùng suốt vòng đời.
- Mã không đổi khi mượn, điều chuyển, sửa chữa, ngừng sử dụng hoặc thanh lý.
- Mã hiện hữu đã bấm/khắc/dán trên máy được lưu riêng để đối chiếu.
- Nhóm quản lý hiện tại khác với nhóm gốc cấp mã ban đầu.
- Không hard-delete hồ sơ nghiệp vụ; mọi hiệu chỉnh cần có lịch sử.

## Vai trò hiện tại

- **Người xem toàn xưởng:** đọc toàn bộ web, không ghi dữ liệu, không bắt buộc thuộc nhóm.
- **Công nhân kỹ thuật (`viewer`):** xem, mượn/trả, báo hỏng; là quyền nghiệp vụ cơ bản theo nhóm.
- **Kỹ sư giám sát (`operator`):** quyền Công nhân + quản lý CCDC, duyệt và xử lý nghiệp vụ thường ngày của nhóm.
- **Đốc công khu vực (`manager`):** cấp trên Kỹ sư giám sát; kế thừa quyền Kỹ sư và có quyền cấp khu vực đối với điều chuyển/thanh lý.
- **Quản lý Xưởng / Admin:** vai trò cấp Xưởng gộp; quản lý toàn Xưởng, cấp phát ban đầu, phê duyệt nghiệp vụ cấp Xưởng, quản trị user và hiệu chỉnh dữ liệu sai.

## Mượn máy / Mượn nhanh

- Công nhân kỹ thuật, Kỹ sư giám sát và Đốc công đều có thể đi mượn; thực tế Kỹ sư/Đốc công thường là người tạo phiếu.
- Kỹ sư giám sát hoặc Đốc công của nhóm cho mượn đều có thể duyệt; ai xử lý trước thì lịch sử ghi người đó.
- Người thuộc nhóm cho mượn có thể xác nhận nhận lại khi trả.

## Điều chuyển / Thanh lý

- Quyền xác nhận cấp khu vực thuộc Đốc công.
- Phê duyệt cuối cấp Xưởng thuộc Quản lý Xưởng / Admin.
- Điều chuyển thay đổi nhóm quản lý nhưng không đổi mã hệ thống.

## Giao diện

- Corporate Industrial Light UI.
- Màu thương hiệu chính `#004A8F`.
- Desktop và mobile cùng hệ thiết kế; sidebar sáng, card trắng, tương phản rõ.
- Không dùng lại theme tím/pastel cũ.
- Không cuộn ngang toàn trang; bảng chuyển thành list/card trên mobile.

## Hạ tầng

- GitHub: mã nguồn.
- Vercel: build/deploy Next.js.
- Neon: PostgreSQL.
