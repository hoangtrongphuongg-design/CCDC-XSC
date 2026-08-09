# Đặc tả hiện tại — Dụng cụ nhóm tôi

## Phạm vi

Milestone này quản lý **CCDC theo từng thiết bị**. Chưa triển khai ảnh, quản lý theo số lượng, Mượn máy/Mượn nhanh mới, Điều chuyển, Sửa chữa workflow, Thanh lý workflow hoặc import Excel hàng loạt.

## Trường dữ liệu chính

- Nguồn hình thành: `existing`, `new_purchase`, `other`.
- Ngày ghi nhận.
- Tên CCDC.
- Mã hệ thống tự sinh.
- Mã hiện hữu / mã đã gán trên máy.
- Nhóm thiết bị và Loại dụng cụ.
- Hãng, model, serial, năm sản xuất, năm đưa vào sử dụng.
- Thông số kỹ thuật, ghi chú kỹ thuật.
- Tình trạng kỹ thuật, trạng thái nghiệp vụ, vị trí, ghi chú.
- Khi `new_purchase`: ngày mua/tiếp nhận, PO/HĐ, nhà cung cấp, giá mua, bảo hành, ghi chú mua sắm — đều tùy chọn.

## Mã hệ thống

- Sinh theo prefix của nhóm quản lý ban đầu: `WS-0001`, `COI-0001`, ...
- Cấp trong database transaction.
- Counter được đồng bộ với các mã đã tồn tại để không quay lại số cũ.
- Không tái sử dụng số đã cấp.
- Điều chuyển sau này không đổi mã.

## Quyền

- Công nhân kỹ thuật: xem.
- Kỹ sư giám sát / Đốc công: thêm, sửa CCDC nhóm mình.
- Người xem toàn xưởng: xem toàn bộ, không ghi dữ liệu.
- Quản lý Xưởng / Admin: thêm/sửa mọi nhóm, tiếp nhận/cấp phát máy mới, hiệu chỉnh dữ liệu sai toàn Xưởng.

## Audit

Lưu người thực hiện, vai trò, nhóm, thời gian, action, dữ liệu trước/sau và lý do. Hiệu chỉnh các trường nhạy cảm bởi Quản lý Xưởng / Admin bắt buộc có lý do.
