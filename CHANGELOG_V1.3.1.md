# Thay đổi V1.3.1

## Nhóm và phân quyền

- Đồng bộ 13 nhóm nghiệp vụ chính thức trên toàn hệ thống.
- Quyền `viewer` được hiển thị là **Nhân viên — Xem & mượn**.
- Tài khoản Nhân viên không được sửa danh mục nhưng được thực hiện thủ tục mượn.

## Dụng cụ

- Dụng cụ toàn xưởng chuyển thành trang tra cứu, không còn nút thêm.
- Thêm và cập nhật được gom về Dụng cụ nhóm tôi.
- Tự sinh mã riêng theo từng nhóm.
- Bổ sung 9 nhóm thiết bị ở mức phân loại vừa đủ.

## Mượn máy

- Nhân viên nhóm mượn được tạo đề nghị, xác nhận nhận và báo trả.
- Operator/Manager nhóm cho duyệt và xác nhận giao.
- Nhân viên thuộc nhóm cho được xác nhận nhận lại.

## Mượn nhanh

- Bổ sung trạng thái `pending_approval`.
- Nhân viên nhóm mượn tạo đề nghị.
- Operator/Manager nhóm cho duyệt trước khi trừ tồn kho.
- Nhân viên thuộc nhóm cho được chốt số lượng trả tốt, trả hư và mất.

## Database

- Thêm migration `drizzle/0002_employee_loan_permissions.sql`.
- Bổ sung người đề nghị, người duyệt và người đóng phiếu cho Mượn nhanh.
