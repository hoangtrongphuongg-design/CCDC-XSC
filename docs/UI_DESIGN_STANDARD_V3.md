# BẢN GHI NHỚ TIÊU CHUẨN THIẾT KẾ GIAO DIỆN WEB NỘI BỘ

**Mục đích:** Dùng làm quy ước chung khi thiết kế các website quản lý, theo dõi nghiệp vụ và vận hành nội bộ. Có thể áp dụng cho các dự án mới mà không phụ thuộc tên hệ thống hoặc ngành nghiệp vụ cụ thể.

> Giao diện không chỉ “đẹp”. Giao diện phải giúp người dùng hiểu đúng trạng thái, thực hiện đúng bước, giảm nhập sai, tránh thao tác ngoài quyền và hoàn thành công việc nhanh trên cả máy tính lẫn điện thoại.

## A. 12 quy tắc nhớ nhanh

1. **Mobile-first:** thiết kế luồng thao tác trên điện thoại trước; desktop mở rộng thêm mật độ và panel chi tiết.
2. **Một việc chính/màn hình:** mỗi trang có một mục tiêu chính và một nút hành động chính nổi bật.
3. **Hiện trạng thái bằng chữ:** không dùng màu đơn độc; luôn có nhãn trạng thái.
4. **Quyền theo vai trò:** ẩn hành động không được phép và kiểm tra lại quyền ở server.
5. **Không cuộn ngang toàn trang:** bảng desktop co giãn; mobile chuyển sang card.
6. **Form ngắn, có cấu trúc:** chia nhóm trường, đánh dấu bắt buộc, báo lỗi tại trường.
7. **Không xóa cứng:** dùng hủy/ngừng hoạt động/lưu trữ; mọi thay đổi có lịch sử.
8. **Phản hồi tức thời:** mọi thao tác có loading, thành công, lỗi và trạng thái trống.
9. **Màu có ý nghĩa:** nền sáng và card trắng làm chủ đạo; indigo/tím-xanh cho hành động; xanh lá/vàng/đỏ cho trạng thái.
10. **Thông tin quan trọng ở đầu:** mã, tên, nhóm, trạng thái và việc cần làm phải nhìn thấy trước.
11. **Ưu tiên khả năng quét:** khoảng trắng, phân cấp chữ, badge và nhóm nội dung rõ.
12. **Thiết kế cho dữ liệu thật:** luôn thử tên dài, số lớn, bảng rỗng, nhiều trạng thái và màn hình hẹp.

## 1. Hệ thống bố cục

### Desktop
- Sidebar trái trên desktop: nền sáng, tên hệ thống, menu theo nhóm nghiệp vụ, mục đang chọn và khu vực tài khoản; dùng viền nhẹ để tách vùng.
- Header: tiêu đề trang, breadcrumb khi cần, tìm kiếm, thông báo.
- Nội dung có container tối đa; không kéo dãn vô hạn.
- Panel chi tiết bên phải khi cần xem/sửa nhanh mà không rời danh sách.
- Chỉ một nút hành động chính ở khu vực tiêu đề.

### Mobile
- Header gọn; tối đa một hành động phụ.
- Bottom navigation 4–5 mục hoặc menu trượt.
- Bảng chuyển thành card.
- Form dài mở toàn màn hình; nút lưu cố định phía dưới.
- Vùng chạm tối thiểu khoảng 44×44 px.

## 2. Design tokens

- **Navy chính:** `#102A43` — sidebar, tiêu đề, cấu trúc.
- **Xanh hành động:** `#1769AA` — nút chính, link, focus.
- **Xanh lá:** `#147D64` — thành công, hoàn thành.
- **Vàng/cam:** `#A15C00` — chờ xử lý, chú ý.
- **Đỏ:** `#B42318` — lỗi, từ chối, nguy hiểm.
- **Xám:** `#627D98` — mô tả, nhãn phụ, đường viền.

Typography: Inter/Arial/Roboto; nội dung 14–16 px; tiêu đề trang 24–30 px. Dùng thang khoảng cách 4/8/12/16/24/32 px; radius 8–16 px; bóng nhẹ.

## 3. Thành phần giao diện chuẩn

### Sidebar/menu
- Nhóm menu theo nghiệp vụ, không theo cấu trúc code.
- Mục đang mở có nền/đường nhấn rõ.
- Menu quản trị tách khỏi menu nghiệp vụ.
- Mục không có quyền nên ẩn.

### Tiêu đề trang
- Tên trang, mô tả ngắn, bộ lọc/số liệu liên quan.
- Chỉ một nút chính; hành động phụ dùng nút nhẹ hoặc menu ba chấm.
- Trang tra cứu toàn xưởng không đặt chức năng thêm mới nếu tạo mới thuộc trách nhiệm trang nhóm.

### KPI/dashboard
- KPI gồm nhãn, số chính, xu hướng/so sánh và khả năng mở danh sách.
- Ưu tiên việc cần xử lý, không chỉ đếm tổng.
- Không quá 4–6 KPI/hàng.

### Bảng
- Mã/tên ở đầu; trạng thái và thao tác ở cuối.
- Header ưu tiên không xuống dòng; nội dung dài wrap hợp lý.
- Có tìm kiếm, lọc, sắp xếp, tổng số kết quả.
- Thông tin phụ mở trong panel chi tiết.
- Mobile chuyển thành card.

### Form/modal/drawer
- Form ngắn dùng modal; form dài dùng drawer; mobile dùng full-screen sheet.
- Chia nhóm: cơ bản, nhận dạng, tình trạng, hồ sơ.
- Lỗi ngay dưới trường; dữ liệu tự sinh hiển thị chỉ đọc.
- Nút cuối form: Hủy – Lưu nháp – Hoàn thành; chỉ một nút màu chính.

## 4. Giao diện theo quy trình

- Mỗi phiếu có mã, trạng thái, người chịu trách nhiệm, bước tiếp theo và thời hạn.
- Chi tiết dùng timeline thể hiện vòng đời.
- Nút thay đổi theo trạng thái và vai trò.
- Duyệt/từ chối/hủy/ngoại lệ cần xác nhận và lý do khi cần.
- Không cho tự duyệt phiếu của chính mình nếu quy trình yêu cầu tách trách nhiệm.

## 5. Phân quyền

- **Nhân viên:** tra cứu, tạo yêu cầu, xác nhận các bước của bản thân.
- **Operator nhóm:** quản lý dữ liệu và xử lý nghiệp vụ hằng ngày của nhóm.
- **Manager nhóm:** kiểm soát nghiệp vụ, xác nhận cấp nhóm, xử lý bất thường.
- **Quản lý Xưởng:** giám sát toàn xưởng, phê duyệt cuối và xử lý ngoại lệ.
- **Admin:** tài khoản, nhóm, cấu hình; không mặc định có quyền duyệt nghiệp vụ.

Ẩn nút không có quyền chỉ là lớp trải nghiệm. API/server phải kiểm tra quyền hiện hành trước mọi thao tác ghi.

## 6. Trạng thái hệ thống

- Loading: skeleton cho danh sách, spinner nhỏ cho nút, khóa nút chống bấm lặp.
- Empty: phân biệt chưa có dữ liệu và không có kết quả lọc; có hành động phù hợp.
- Success/error: toast ngắn; lỗi validation tại trường; lỗi hệ thống không lộ thông tin kỹ thuật.
- Thao tác nguy hiểm: modal xác nhận, mô tả hậu quả, nút đỏ.

## 7. “Thông minh” nhưng không phức tạp

- Tự điền người tạo, nhóm đang thao tác, ngày và mã hệ thống.
- Gợi ý lựa chọn theo ngữ cảnh.
- Nhớ bộ lọc trong phiên.
- Cảnh báo xung đột nghiệp vụ trước khi lưu.
- Tìm kiếm không dấu theo mã/tên/serial.
- Giải thích lý do nút bị khóa.
- Không tự phê duyệt, tự đổi nhóm, tự xóa lịch sử hoặc tự đoán dữ liệu quan trọng.

## 8. Khả năng tiếp cận

- Tương phản rõ; không dùng chữ xám quá nhạt.
- Input có label; nút chỉ có icon có aria-label/tooltip.
- Focus keyboard rõ; thứ tự tab hợp lý.
- Không truyền đạt trạng thái chỉ bằng màu.
- Câu chữ theo thuật ngữ nghiệp vụ, lỗi nói cách sửa.

## 9. Hiệu năng và ổn định

- Không tải toàn bộ dữ liệu lớn khi mở trang; dùng phân trang và tải theo nhu cầu.
- Ảnh được nén, lazy-load.
- Giữ layout ổn định khi tải.
- API ghi dữ liệu có transaction/idempotency khi có nguy cơ trùng.
- Server đọc lại quyền hiện hành, không tin token cũ cho thao tác ghi.

## 10. Quy ước triển khai

- Một hệ token trung tâm cho màu, spacing, radius, shadow, typography.
- Component dùng lại: Button, Input, Select, Badge, Card, Table, Drawer, Dialog, EmptyState, Skeleton.
- Không hard-code màu/spacing rải rác.
- Mobile thay đổi cấu trúc, không chỉ thu nhỏ desktop.
- Comment code giải thích “vì sao” của quy tắc nghiệp vụ.

## 11. Checklist trước production

- [ ] Mục tiêu trang và nút chính rõ.
- [ ] Không cuộn ngang toàn trang.
- [ ] Tên dài, mã dài, số lớn không vỡ bố cục.
- [ ] Có loading, empty, success, warning, error.
- [ ] Nút đúng theo vai trò và trạng thái.
- [ ] API kiểm tra quyền.
- [ ] Chống bấm hai lần.
- [ ] Validation tại trường.
- [ ] Thao tác nguy hiểm có xác nhận.
- [ ] Lịch sử ghi người, thời gian, vai trò/nhóm, dữ liệu cũ-mới.
- [ ] Kiểm thử bằng tài khoản riêng từng vai trò.
- [ ] Kiểm thử mobile.
- [ ] Không lộ biến môi trường hoặc lỗi kỹ thuật.
- [ ] Build production thành công.

## 12. Mẫu brief cho web mới

1. Mục tiêu hệ thống.
2. Vai trò và ma trận quyền.
3. Đối tượng dữ liệu, mã, trạng thái.
4. Luồng nghiệp vụ và điều kiện chuyển bước.
5. Ngoại lệ: từ chối, hủy, quá hạn, thiếu người duyệt, dữ liệu sai.
6. Danh sách màn hình và mục tiêu của từng trang.
7. Yêu cầu mobile/hiện trường.
8. Báo cáo cần cho quyết định nào.
9. Lịch sử cần lưu.
10. Tích hợp Excel/file/hệ thống khác.

## 13. Prompt dùng lại

```text
Thiết kế một web nội bộ cho [TÊN DỰ ÁN] theo bộ tiêu chuẩn sau:
- Giao diện chuyên nghiệp, hiện đại, quiet-premium; nền sáng trắng/xám tím nhạt, card trắng, viền mảnh, bóng rất nhẹ và một accent indigo/tím-xanh.
- Mobile-first; desktop dùng cùng ngôn ngữ màu và bề mặt với mobile, có sidebar sáng, header, bảng gọn và panel chi tiết.
- Không cuộn ngang toàn trang; bảng mobile chuyển thành card.
- Mỗi trang chỉ có một mục tiêu chính và một nút hành động chính.
- Form chia nhóm rõ, validation tại trường, có loading/empty/success/error.
- Hành động hiển thị theo vai trò và trạng thái; API kiểm tra quyền server-side.
- Mọi thay đổi quan trọng có lịch sử; không xóa cứng dữ liệu nghiệp vụ.
- Dùng design tokens và component dùng lại; không hard-code rải rác.
- Thiết kế bằng dữ liệu thật, tên dài và trường hợp ngoại lệ.

Bối cảnh: [MÔ TẢ VẤN ĐỀ]
Người dùng/vai trò: [DANH SÁCH VAI TRÒ]
Đối tượng dữ liệu chính: [DANH SÁCH]
Luồng nghiệp vụ: [CÁC BƯỚC]
Màn hình cần có: [DANH SÁCH MÀN HÌNH]
Yêu cầu đầu ra: trước tiên lập sơ đồ thông tin, ma trận quyền, luồng nghiệp vụ, danh sách component và mockup mô tả; chỉ code khi các mục này được duyệt.
```

**Kết luận:** Đẹp là điều kiện cần. Rõ nghiệp vụ, đúng quyền, ít sai và dùng được lâu dài mới là tiêu chuẩn hoàn thành.

---

## 14. Phong cách thẩm mỹ tham chiếu chung cho mobile và desktop

### 14.1. Quyết định đã chốt

Hình mobile là **tham chiếu thị giác duy nhất**. Desktop không dùng hình tham chiếu desktop cũ và không chuyển sang phong cách sidebar tối. Desktop chỉ mở rộng cấu trúc và mật độ dữ liệu; màu sắc, typography, icon, card, bo góc và cảm giác tổng thể phải đồng nhất với mobile.

### 14.2. Ngôn ngữ thị giác chính

- Nền trắng hoặc xám tím rất nhạt; card và panel trắng, viền mảnh, bóng rất nhẹ.
- Một màu accent chính, ưu tiên indigo/tím-xanh, cho tab active, nút chính, focus, biểu đồ và lựa chọn đang bật.
- Card bo mềm, khoảng trắng rõ, icon nét gọn, typography hiện đại và dễ đọc.
- Số liệu quan trọng nổi bật vừa đủ; không dùng hiệu ứng nặng hoặc mảng màu đậm chiếm diện tích lớn.
- Màu semantic luôn có chữ đi kèm; không truyền đạt trạng thái chỉ bằng màu.

### 14.3. Mobile

- Dashboard có hero metric vừa phải, card thống kê nhỏ và danh sách gần đây.
- Bottom navigation 4–5 mục; FAB chỉ dùng khi có một hành động tạo mới nổi trội.
- Danh sách dùng card thấp, dễ quét; search và filter chip ở đầu.
- Form dài dùng full-screen sheet; nút hoàn thành cố định phía dưới.
- Vùng chạm lớn và ưu tiên thao tác một tay.

### 14.4. Desktop cùng phong cách mobile

- Desktop vẫn có sidebar, header, toolbar, bảng và panel chi tiết; đây là thay đổi về bố cục, không phải thay đổi phong cách.
- Sidebar dùng nền trắng hoặc xám tím rất nhạt; mục active dùng nền indigo nhạt và chữ/icon accent.
- Header và toolbar dùng nền sáng; nút chính indigo, nút phụ trắng/outline.
- Bảng đặt trong card trắng, bo 10–14 px, đường phân tách mảnh và hover nền tím-xám rất nhạt.
- Drawer, modal và panel chi tiết dùng cùng bề mặt trắng, bo mềm, viền nhẹ như mobile.
- Biểu đồ dùng cùng palette mobile; tránh mảng màu đậm, sidebar đen/navy và action bar đen.
- Desktop tăng mật độ bằng cột, bảng và panel nhưng vẫn giữ cảm giác nhẹ, thoáng và hiện đại.

### 14.5. Ngôn ngữ thống nhất

| Thành phần | Mobile | Desktop | Quy tắc chung |
|---|---|---|---|
| Nền | Trắng/xám tím rất nhạt | Cùng nền sáng | Không đổi palette theo thiết bị |
| Điều hướng | Bottom nav/menu sheet | Sidebar sáng, có thể thu gọn | Cùng tên, icon và active state |
| Nút chính | FAB hoặc nút sticky khi phù hợp | Nút trên toolbar | Cùng accent indigo |
| Danh sách | Card thấp | Bảng trong card trắng | Cùng mã, trạng thái và logic |
| Chi tiết | Full-screen/bottom sheet | Drawer/panel/popover | Cùng bề mặt, bo góc và viền |
| Mật độ | Thoáng, vùng chạm lớn | Gọn hơn nhưng vẫn nhẹ | Khác bố cục, không khác phong cách |

### 14.6. Token đã chốt

- Nền ứng dụng: `#F6F7FB`
- Nền sidebar sáng: `#FAFAFF` hoặc `#F4F3FF`
- Card/bề mặt: `#FFFFFF`
- Viền nhẹ: `#E5E7EB`
- Chữ chính: `#111827`
- Chữ phụ: `#6B7280`
- Accent chính: `#5B4CF5`
- Accent nhạt: `#EEECFF`
- Thành công: `#147D64`
- Cảnh báo: `#A15C00`
- Nguy hiểm: `#B42318`

### 14.7. Điều cần tránh

- Không dùng hình tham chiếu desktop cũ.
- Không dùng sidebar tối hoặc nền đen/navy chiếm mảng lớn.
- Không tạo palette riêng cho desktop.
- Không làm desktop quá chật, vuông cứng hoặc mang cảm giác phần mềm legacy.
- Không lạm dụng gradient, bóng sâu, biểu đồ trang trí và nhiều màu accent.
- Không sao chép nguyên mẫu; phải chuyển ngôn ngữ thị giác sang đúng nghiệp vụ và dữ liệu tiếng Việt.

### 14.8. Prompt bổ sung

```text
Phong cách giao diện tham chiếu:
- Dùng hình mobile làm ngôn ngữ thị giác chính cho cả mobile và desktop.
- Nền sáng trắng/xám tím nhạt, card trắng, viền mảnh, bóng rất nhẹ, bo mềm và một accent indigo/tím-xanh.
- Desktop vẫn có sidebar, toolbar, bảng và panel chi tiết nhưng tất cả dùng cùng màu, typography, icon, card và trạng thái với mobile.
- Sidebar desktop phải sáng; mục active dùng nền indigo nhạt. Không dùng sidebar đen/navy hoặc mảng màu nặng.
- Mobile dùng bottom navigation, card và full-screen sheet; desktop tăng mật độ bằng bảng và panel, không đổi phong cách.
- Không sao chép nguyên mẫu; áp dụng đúng nghiệp vụ, thương hiệu và dữ liệu tiếng Việt.
- Chỉ một hành động chính theo ngữ cảnh; trạng thái luôn có chữ; quyền được kiểm tra ở server.
```
