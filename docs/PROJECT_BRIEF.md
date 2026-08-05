# BẢN GHI NHỚ CHÍNH THỨC — QUẢN LÝ CCDC - XSC

## Nguyên tắc dữ liệu

- Một máy có một mã duy nhất dùng suốt vòng đời.
- Không đổi mã khi cho mượn, điều chuyển, sửa chữa, ngừng sử dụng hoặc thanh lý.
- Tách máy/CCDC có mã khỏi dụng cụ nhỏ không có mã máy.
- Nhóm quản lý và nhóm đang sử dụng là hai thông tin khác nhau.
- Không xóa lịch sử nghiệp vụ.

## Quyền

- Tài khoản active được xem toàn bộ CCDC của Xưởng Sửa chữa.
- Chỉ thao tác tại nhóm được phân quyền.
- Một user có thể có quyền tại nhiều nhóm.
- `operator`: thao tác nghiệp vụ tại nhóm.
- `manager`: thêm quyền duyệt/xác nhận của nhóm.
- `Quản lý Xưởng`: duyệt điều chuyển, sửa chữa và thanh lý toàn xưởng.
- `Admin`: quản trị user, nhóm, quyền và cấu hình.
- `Quản lý Xưởng` và `Admin` là hai vai trò độc lập; vai trò này không tự động cấp vai trò kia.
- Người tạo phiếu không tự duyệt bước đối ứng của chính phiếu đó.

## Mượn máy

- Dùng cho máy có mã.
- Nhóm quản lý không đổi.
- Nhóm mượn đề xuất; nhóm quản lý duyệt và giao; nhóm mượn xác nhận nhận; khi trả, nhóm quản lý xác nhận nhận lại.
- Máy hư khi đang mượn phải liên kết phiếu sửa chữa với phiếu mượn.

## Điều chuyển cố định

- Thay đổi nhóm quản lý, giữ nguyên mã máy.
- Hai nhóm đồng ý, Quản lý Xưởng duyệt, hai bên xác nhận bàn giao.
- Máy đang được mượn có thể chuyển cố định cho chính nhóm đang giữ; phiếu điều chuyển phải liên kết và đóng phiếu mượn.

## Cho mượn nhanh

- Dùng cho mũi khoan, taro, đồng hồ, cảo, đồ gá, phụ kiện và dụng cụ nhỏ.
- Bên cho tạo, bên mượn xác nhận, bên mượn báo trả, bên cho xác nhận.
- Có số lượng trả tốt, trả hư, mất; tổng phải bằng số đã mượn.
- Vật tư tiêu hao không hoàn trả không thuộc chức năng này.

## Sửa chữa

- Nhóm đang quản lý hoặc đang giữ máy được báo hư.
- WS tiếp nhận, sửa, ghi chi phí và kết quả.
- Nhóm quản lý xác nhận nhận lại.
- Không thể phục hồi thì chuyển sang chờ đề xuất thanh lý.

## Thanh lý

- Nhóm tạo đề xuất.
- Manager nhóm xác nhận.
- Quản lý Xưởng duyệt.
- User được phân quyền tại `KHO_TL` xác nhận nhập Kho thanh lý.
- Sau khi nhập kho, thiết bị không được mượn, điều chuyển, sửa chữa hoặc cấp phát lại.
- Mã máy vẫn được giữ trong lịch sử.

## Giao diện

- Tên hệ thống: `QUẢN LÝ CCDC - XSC`.
- Tông xanh navy – trắng; gọn, hiện đại, chuyên nghiệp.
- Desktop: sidebar trái, nội dung chính, panel/form bên phải khi phù hợp.
- Mobile-first cho Mượn nhanh, Mượn máy và Điều chuyển.
- Không có cuộn ngang toàn trang.
- Bảng nhiều cột chuyển thành card trên điện thoại.
- Màu, spacing, radius và shadow dùng token trung tâm.
- Trạng thái luôn có chữ; không truyền đạt chỉ bằng màu.
- Mọi input có label và vùng chạm đủ lớn.

## Hạ tầng

- GitHub: mã nguồn.
- Vercel: build và chạy Next.js.
- Neon: PostgreSQL.
