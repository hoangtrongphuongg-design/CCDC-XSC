# Chuẩn nhận diện giao diện hiện tại

- Màu chính: `#004A8F`
- Hover: `#003B73`
- Xanh đậm: `#002B55`
- Nền xanh nhạt: `#E8F2FA`
- Nền trang: `#F4F7FA`
- Card: `#FFFFFF`
- Chữ chính: `#111827`
- Chữ phụ: `#526071`
- Viền: `#D7E0E8`

Logo và slogan chỉ xuất hiện nổi bật tại đăng nhập. Trong màn hình nghiệp vụ, thương hiệu được dùng tiết chế qua logo nhỏ, màu nút chính và trạng thái active.

## Chữ và màu trạng thái (V1.7)

- Phông: **Be Vietnam Pro** (tự host qua `next/font`, biến `--font-sans`).
- Thang chữ: thân 15px (điện thoại 16px); **không dùng cỡ chữ nhỏ hơn 12px** ở bất kỳ đâu; tiêu đề bảng 12px, nội dung bảng 13px.
- Màn cảm ứng: nút, ô nhập, tab cao tối thiểu 44px.
- Màu trạng thái do `src/lib/status-style.ts` quyết định: xanh lá = sẵn sàng / tốt / hoàn thành; xanh dương = đang diễn ra; cam = cần ai đó xử lý; đỏ = hư hỏng / sự cố / từ chối; xám = chưa đánh giá / ngừng / kho thanh lý. Huy hiệu luôn có chữ và ký hiệu (✓ ! ✕ ● ○), không chỉ dựa vào màu.
