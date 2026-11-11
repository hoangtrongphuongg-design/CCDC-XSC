# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này. Viết bằng tiếng Việt vì toàn bộ domain, UI và commit message đều tiếng Việt.

## Lệnh

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # cần AUTH_SECRET + DATABASE_URL trong env, nếu không sẽ lỗi "Collecting page data"
npm run start
npm run typecheck  # tsc --noEmit
npm test           # tsx --test tests/*.test.ts — 91 pass
```

Không có ESLint script.

## Kiến trúc

Next.js 15 App Router + React 19 + TypeScript. Một Postgres (Neon) qua **Drizzle ORM** (`drizzle-orm/node-postgres` + `pg.Pool`, `src/lib/db/index.ts`).

Ứng dụng nội bộ quản lý CCDC (công cụ dụng cụ) của Xưởng Sửa chữa: theo dõi vòng đời máy/CCDC và các nghiệp vụ mượn máy, cho mượn nhanh, sửa chữa, điều chuyển, thanh lý.

### Xác thực & phân quyền (`src/lib/auth/`)

- Không dùng NextAuth. Tự làm: đăng nhập bằng `employeeCode` + mật khẩu (`bcryptjs`, cost 12) → JWT ký HS256 bằng `AUTH_SECRET` (`jose`), lưu cookie `ccdc_xsc_session_v2` (httpOnly, 8h, `SESSION_TTL_SECONDS`).
- `getAuthResult()` (`session.ts`) verify JWT **và** đối chiếu `sessionVersion` trong token với DB. Mọi thao tác thay quyền/khóa tài khoản/đổi mật khẩu đều `sessionVersion + 1` để vô hiệu hóa mọi phiên cũ.
- **Không có `middleware.ts`.** Bảo vệ route qua `src/app/(app)/layout.tsx` gọi `requireUser()` (`export const dynamic = "force-dynamic"`). Trang trong nhóm `(app)` được bảo vệ nhờ layout này; trang cần quyền cao hơn phải tự gọi `requireAdmin()` / `requireWsManager()` trong thân trang (vd `groups/page.tsx`, `users/page.tsx`).
- Guards (`guards.ts`): `requireUser` → `requireWsManager` (Quản lý Xưởng hoặc Admin) → `requireAdmin` (Admin hệ thống). `hasGroupPermission(auth, groupId, "viewer"|"operator"|"manager")` / `requireGroupPermission(...)` cho quyền theo nhóm.
- **Vai trò hệ thống** (cột boolean trên `users`, mỗi user đúng 1 vai trò chính): `isAdmin`, `isWsManager`, `isReadOnlyViewer`, hoặc "người dùng theo nhóm" (không cột nào). `isWorkshopAdmin` = `isAdmin || isWsManager` (dẫn xuất, không lưu DB).
- **Phạm vi xem dữ liệu tổng hợp:** `canViewWholeWorkshop(auth)` (`lib/auth/roles.ts`, hàm thuần dùng được cả client) = `isAdmin || isWsManager || isReadOnlyViewer` → thấy toàn XSC. Người dùng theo nhóm chỉ thấy nhóm mình. Trang chỉ dành cho phạm vi toàn Xưởng gọi `requireWholeWorkshopView()` (vd `/reports`); trang hiện cho mọi người nhưng lọc nội dung theo `auth.permissions` (vd panel phân tích ở `/dashboard`). Ngoại lệ chủ ý: `/activities` hiện hoạt động mới nhất của **toàn Xưởng** cho mọi tài khoản (xem mục Lịch sử hoạt động). Sidebar ẩn link "Báo cáo" nếu không có quyền — chỉ là UX, trang vẫn tự gác. Riêng `/my-equipment` ("Dụng cụ nhóm tôi"): Admin / Quản lý Xưởng / Người xem vẫn tải máy của mọi nhóm nhưng ô lọc nhóm mặc định là nhóm chính của tài khoản (`defaultGroupId`), không có nhóm chính thì "Tất cả nhóm". Máy của nhóm mượn được suy ra từ phiếu mượn đang giữ (`isHeldByBorrower`, `lib/loan-status.ts`), không dựa vào `equipment.current_group_id`.
- **Quyền theo nhóm** (`user_group_permissions`): `viewer` < `operator` < `manager`. `isWorkshopAdmin` bỏ qua bậc này (full mọi nhóm); `isReadOnlyViewer` luôn bị chặn ghi.
- Chi tiết ngữ nghĩa vai trò: `docs/PROJECT_BRIEF.md`.

### Mô hình dữ liệu (`src/lib/db/schema.ts`)

- `equipment` — máy **có mã hệ thống riêng** (`code`, unique, không đổi suốt vòng đời kể cả khi điều chuyển). `legacyCode` = mã đã bấm/khắc trên máy, **hiển thị trên giao diện và file Excel là “Tem nhôm”** (còn `code` hiển thị là “Mã hệ thống”). `originGroupId` (nhóm cấp mã gốc) ≠ `ownerGroupId` (nhóm quản lý hiện tại) ≠ `currentGroupId` (nhóm đang giữ). `recordStatus` `draft`/`active` — nghiệp vụ chỉ chạy trên `active`.
- `tool_catalog` — CCDC nhỏ lẻ **quản lý theo số lượng** (`quantityOnHand`), có thể có `code` hoặc không.
- 5 workflow, mỗi cái 1 bảng + 1 pgEnum trạng thái: `machine_loans`, `quick_loans`, `transfers`, `repairs`, `disposals` (+ `tool_disposals` cho CCDC theo số lượng).
- `activity_logs` — audit **append-only**. Mọi hàm ghi gọi `writeAudit(tx, {...})` trong cùng transaction, lưu `beforeData`/`afterData` snapshot. Không hard-delete hồ sơ nghiệp vụ.
- `workflow_counters` / mã nghiệp vụ: `nextWorkflowCode(tx, "PM"|"CM"|"DC"|"SC"|"TL"|"TLVT")` → `PM-2026-0001`. Mã tài sản: `nextAssetCode(tx, {groupCode, equipmentPrefix, mode})`. Cả hai dùng `INSERT ... ON CONFLICT` để chống race.
- `auth_rate_limits` — rate limit đăng nhập/đăng ký, lưu ở DB (`src/lib/auth/rate-limit.ts`), không phải in-memory. Khóa theo IP lấy từ `getClientIp()` (ưu tiên `x-real-ip`, rồi hop cuối của `x-vercel-forwarded-for`/`x-forwarded-for` — **không** lấy phần tử đầu vì client giả mạo được).

### Quy ước viết Server Action nghiệp vụ

Xem `src/actions/*.ts`. Mẫu chuẩn cho mọi hàm chuyển trạng thái workflow:

1. Đọc bản ghi hiện tại (`db.select().limit(1)`).
2. `requireGroupPermission(<groupId đúng phía>, <bậc>)` — phía tạo phiếu thường `viewer`, phía duyệt `operator`, điều chuyển/thanh lý cấp nhóm `manager`, cấp Xưởng `requireWsManager()`.
3. Chặn tself-approval: `if (loan.requestedBy === auth.userId) throw ...`.
4. `db.transaction(async (tx) => { ... })`:
   - Với thao tác trên `equipment`: `lockEquipment(tx, id)` (SELECT ... FOR UPDATE) + `assertEquipmentHasNoOtherOpenWorkflow(tx, id, {except})`.
   - `UPDATE ... WHERE id = ? AND status = '<trạng thái kỳ vọng>'` rồi `if (!updated) throw "Phiếu đã được người khác xử lý"` — optimistic concurrency, **luôn giữ pattern này**.
   - `writeAudit(tx, {...})` cho cả entity workflow và (nếu liên quan) `equipment`.
5. `revalidatePath(...)` các trang liên quan + `setFlashMessage("success", ...)`.

`workflows.ts` = helper dùng chung (`lockEquipment`, `assertEquipmentHasNoOtherOpenWorkflow`, các hàm sinh mã).

Trang danh sách quy trình (Mượn máy, Mượn nhanh, Điều chuyển, Sửa chữa, Thanh lý) luôn tải **đủ phiếu đang mở** + `RECENT_CLOSED_LIMIT` (100) phiếu đã đóng gần nhất — không dùng `limit(100)` chung vì phiếu mở cũ sẽ rớt khỏi danh sách. Hằng trạng thái mở/đóng ở `lib/workflow-status.ts` (mượn máy: `lib/loan-status.ts`); `tests/workflow-status.test.ts` đối chiếu với enum trong `schema.ts` nên thêm trạng thái mới mà quên khai báo thì test fail. Lịch sử từng máy (tab "Lịch sử") tải theo yêu cầu bằng `loadEquipmentHistoryAction` (≤200 dòng, kiểm quyền bằng `canViewEquipmentHistory`), không tải sẵn ở trang.

### Việc chờ tôi xử lý (chuông, số trên menu, thẻ ở Tổng quan)

- `lib/my-tasks.ts` (hàm thuần) quyết định phiếu nào đang chờ **chính người dùng**; `lib/my-tasks-data.ts` chỉ đọc các phiếu **đang mở** (`loadMyTasks(auth)`, bọc `react.cache` để layout và trang dùng chung một lần truy vấn, lỗi DB thì trả rỗng chứ không làm hỏng trang). `(app)/layout.tsx` tính số đếm → `AppShell` → huy hiệu ở Sidebar (Mượn – Trả, Điều chuyển, Sửa chữa, Thanh lý), MobileNav (Trang chủ = tổng, Mượn/Trả = mượn) và chuông `Topbar` (link `/dashboard#viec-cho-toi`). Thẻ "Việc chờ tôi xử lý" ở `/dashboard` (tối đa 8 việc, chờ lâu nhất lên đầu).
- Quy tắc: bước cấp nhóm chỉ tính cho **thành viên nhóm** đủ bậc mà Server Action đòi (Admin/Quản lý Xưởng KHÔNG tự có việc của mọi nhóm, dù backend cho họ thao tác); bước cấp Xưởng (tiếp nhận sửa, duyệt điều chuyển/thanh lý) tính cho Quản lý Xưởng/Admin; Kho thanh lý tính cho operator+ nhóm `KHO_TL`; người tạo phiếu không tự thấy việc duyệt phiếu của mình; Người xem toàn xưởng không có việc nào; phiếu sửa "đang sửa" không tính (không phải việc chờ). Quá hạn trả tính cho nhóm đang mượn.
- **Thêm trạng thái/bước duyệt mới** cho workflow thì thêm quy tắc vào `buildMyTasks` + test trong `tests/my-tasks.test.ts`, kẻo huy hiệu không hiện việc mới.

### Tìm kiếm chung (`/search`)

- Ô tìm kiếm ở thanh trên (`components/global-search-box.tsx`, phím `/` để nhảy vào ô) và ở trang chủ điện thoại (thanh trên bị ẩn ở mobile) gửi GET tới `/search?q=`. Mọi tài khoản đăng nhập vào được.
- Quy tắc khớp ở `lib/global-search.ts` (hàm thuần, có test): **không phân biệt hoa/thường và dấu** ("may han" ra "Máy hàn"), nhiều từ = khớp TẤT CẢ từ (thứ tự tùy ý), xếp hạng trùng hẳn mã hệ thống / tem nhôm / serial > bắt đầu bằng > chứa > khớp ở trường mô tả. Cần ≥ 2 ký tự.
- `lib/global-search-data.ts` (`globalSearch(auth, q)`): **máy** (đã hoàn thành hồ sơ) và **CCDC theo số lượng** tìm trên TOÀN Xưởng (khớp quyền trang "Dụng cụ toàn xưởng"; máy được lọc bằng JS sau khi tải để bỏ dấu được, hiện 20 máy / 10 CCDC khớp nhất, kèm nhóm đang giữ do mượn); **phiếu** (mượn máy, mượn nhanh, điều chuyển, sửa chữa, thanh lý máy / CCDC) tìm theo **mã phiếu** bằng ILIKE, mỗi loại tối đa 5, chỉ phiếu liên quan nhóm của người dùng (vai trò xem toàn Xưởng thấy hết). Link máy → `/equipment?q=<mã>` (chưa có trang hồ sơ máy riêng).
- Lưu ý: ô tìm của chính trang `/equipment` (`equipmentSearchValues`) chưa tìm theo serial; `/search` có.

### Báo cáo điều hành (`/reports`)

- Chỉ vai trò xem toàn Xưởng (`requireWholeWorkshopView`). Ngoài các số đếm cũ (cơ cấu theo trạng thái / nhóm) có thêm: **phiếu quá hạn trả** (mượn máy đang `on_loan`/`incident` + mượn nhanh `borrowed`, trễ nhiều ngày nhất lên đầu), **chi phí sửa chữa 12 tháng gần nhất** theo tháng và theo nhóm quản lý máy (tính theo `repairs.completed_at` giờ VN, cộng `cost`), **máy nằm không** (Sẵn sàng + tình trạng Tốt, không có phiếu mượn nào ngoài rejected/cancelled trong 180 ngày; chưa từng mượn thì tính từ `recorded_date`; liệt kê 50 máy lâu nhất).
- Phân tầng: `lib/reports.ts` (hàm thuần, ngày theo giờ VN, có test) → `lib/reports-data.ts` (`loadOperationsReport()`, MỘT nguồn cho cả trang và Excel) → `lib/export/report-workbook.ts` → `GET /reports/export` (3 sheet: Quá hạn trả / Chi phí sửa chữa / Máy nằm không; chi phí ghi dạng số). Ngưỡng 180 ngày / 12 tháng / 50 dòng là hằng ở đầu `lib/reports.ts`.

### Chuẩn hóa Loại máy / Vị trí

- Hai ô chữ tự do này được **đưa về đúng cách viết đã có** khi lưu (không phân biệt hoa/thường, gộp khoảng trắng; vẫn phân biệt dấu): `lib/canonical-text.ts` (hàm thuần: `createCanonicalizer`, `pickCanonicalSpellings`, `rankLabels`) + `lib/canonical-data.ts` (`loadCanonicalizers()`: Loại theo từng nhóm thiết bị = gợi ý có sẵn + `equipment_type_catalog`; Vị trí = cách viết đang dùng nhiều nhất trên máy). Áp ở `saveEquipmentRecordAction` và `importEquipmentAction` (`applyCanonicalText`, cả bảng xem trước). Loại/vị trí chưa có vẫn thêm được. Ô Vị trí ở form có `<datalist>` các vị trí đã dùng.
- Dữ liệu cũ: khối **V1.6.13** trong `database/update.sql` (kèm câu SELECT xem trước, mặc định đang comment) gộp `equipment.equipment_type` (theo nhóm thiết bị) và `current_location` về cách viết phổ biến nhất, tắt (không xóa) bản na ná trong `equipment_type_catalog`. Admin tự chạy sau khi backup; quy tắc chọn cách viết chuẩn phải khớp `pickCanonicalSpellings`.

### Validation

`zod` schema đặt tại `src/lib/validation.ts` (login/register) và inline trong `src/actions/equipment.ts` (`equipmentFormSchema`). Form nghiệp vụ đơn giản parse `formData` thủ công + `throw new Error("thông báo tiếng Việt")` — thông báo này hiển thị trực tiếp cho người dùng.

### Cơ cấu nhóm (`src/lib/group-structure.ts`)

`STANDARD_GROUPS` là nguồn chân lý: 15 nhóm nghiệp vụ + 1 nhóm hệ thống `KHO_TL` (kho thanh lý). `isOfficialOperationalGroupCode()` gác việc gán nhóm cho user/thiết bị. Thêm nhóm = sửa mảng này rồi Admin bấm "Đồng bộ cơ cấu nhóm" (`syncStandardGroupsAction`, upsert theo `code`). `LEGACY_GROUP_CODES` chỉ tự vô hiệu hóa khi hết dữ liệu liên quan.

### Giao diện

- "Corporate Industrial Light UI", màu thương hiệu `#004A8F`. Không dùng theme tím/pastel cũ.
- **Không cuộn ngang toàn trang.** Bảng desktop ép trong viewport, nội dung dài xuống dòng; mobile chuyển bảng → card. `tests/ui.test.ts` canh chừng quy tắc này qua `src/app/globals.css` / `ui-*.css`.
- CSS: `src/app/globals.css` + `ui-current.css` + `ui-v3.css`. Chi tiết: `docs/BRAND_UI_STANDARD.md`, `docs/UI_DESIGN_STANDARD_V3.md`.
- Sidebar (desktop) và MobileNav ẩn/hiện menu theo vai trò — **chỉ là UX**, backend luôn kiểm tra quyền độc lập. Menu có **một** mục "Mượn – Trả" (`/machine-loans`, sáng cả ở `/quick-loans` nhờ `isActivePath` trong `lib/nav-active.ts`); hai trang chia sẻ thanh tab `LoanTabs` (Máy có mã | CCDC lặt vặt).
- Nhãn hiển thị không được trùng giữa **Trạng thái** (`EQUIPMENT_STATUS_LABELS`) và **Tình trạng** (`CONDITION_LABELS`: Tốt / Hư hỏng / Chưa đánh giá / Không thể phục hồi) — có test canh. Chỉ đổi chữ hiển thị, giá trị lưu trong DB giữ nguyên.
- Toast flash message chỉ render trong `MobileNav`; text đi qua JSX (được escape).

### Xuất Excel

- Hai route `GET` (tải file, không phải trang): `/equipment/export?q=` (báo cáo toàn xưởng, mọi tài khoản đã đăng nhập, 1 sheet phân nhóm quản lý → loại) và `/my-equipment/export?group=<id|all>` (kiểm kê, chỉ nhóm trong phạm vi quyền, 403 nếu ngoài). Route handler **không đi qua `(app)/layout.tsx`** nên tự gọi `getActiveAuthOrNull()` (`guards.ts`) và chuyển `/login` nếu chưa đăng nhập.
- Thư viện `exceljs` (chỉ server; `serverExternalPackages` trong `next.config.ts`). Chuỗi người dùng nhập luôn ghi dạng text, công thức duy nhất là cột "Chênh lệch" của sheet kiểm kê CCDC theo số lượng.
- Phân tầng: `lib/equipment-data.ts` (truy vấn dùng chung với trang "Dụng cụ nhóm tôi": `loadScopedEquipment`, `loadWorkshopEquipment`, `loadTools`) → `lib/export/equipment-export.ts` (hàm thuần: cây nhóm → loại, ghi chú, tên sheet/file, ngày giờ VN) → `lib/export/equipment-workbook.ts` (dựng file). Test dữ liệu giả ở `tests/equipment-export.test.ts`.
- `equipmentSearchValues()` phản chiếu các trường tìm kiếm của trang `/equipment` — đổi một nơi thì sửa nơi kia. "Nhóm đang giữ" trong file xuất suy ra từ phiếu mượn (không dùng `current_group_id`). Không xuất đơn giá.

### Nhập máy từ Excel (`/import`, chỉ Admin hệ thống)

- Trang `/import` (menu QUẢN TRỊ → "Nhập dữ liệu") + `GET /import/template` (file mẫu: tiêu đề dòng 1, ô chọn danh sách Nhóm quản lý / Nhóm thiết bị / Tình trạng, sheet Hướng dẫn + Danh mục). Hai bước trong một màn (`components/import/equipment-import-form.tsx` giữ file trong state): **Kiểm tra file** (`mode=check`, không ghi gì, trả bảng từng dòng hợp lệ / lỗi / bỏ qua trùng) → **Nhập vào hệ thống** (`mode=commit`, kiểm tra lại với dữ liệu mới nhất).
- `actions/import.ts`: còn dòng **lỗi** thì không ghi gì; dòng trùng **Tem nhôm / Serial** (với DB hoặc dòng khác trong file, không phân biệt hoa thường; ô "-"/"N/A" coi như trống) bị **bỏ qua** và báo rõ; chỉ **tạo mới**, không cập nhật máy đã có; tối đa 1000 dòng, 2 MB, chỉ `.xlsx`. Toàn bộ trong **một transaction**, cấp mã liền bằng `nextAssetCodes` (`lib/workflows.ts`, một câu lệnh cho cả nhóm), ghi máy theo lô 200 dòng. `next.config.ts` nâng `serverActions.bodySizeLimit` lên 3 MB; trang đặt `maxDuration = 60`.
- Phân tầng: `lib/import/equipment-import.ts` (hàm thuần: tiêu đề, kiểm tra dòng, trùng) → `lib/import/read-workbook.ts` (đọc exceljs, ô nào cũng ra chuỗi) → `lib/export/import-template.ts` → `actions/import.ts`. Việc dựng giá trị máy mới dùng chung với form "Thêm CCDC" qua `lib/equipment-create.ts` (`buildEquipmentInsertValues`, `insertEquipmentRecord`) — **không** đặt hàm dùng chung trong file `"use server"` vì mọi export ở đó thành Server Action.
- Nhật ký: mỗi máy một dòng `equipment.import_create` (chỉ cho tab Lịch sử của máy, khai báo `mirror` nên ẩn khỏi `/activities`) + **một** dòng tổng hợp `equipment.import` hiện ở Lịch sử hoạt động.
- Chưa hỗ trợ nhập CCDC theo số lượng và cập nhật máy đã có.

### Lịch sử hoạt động (`/activities`)

- Bảng `activity_logs` do `writeAudit()` ghi (xem trên). Trang `/activities`: **100 hoạt động mới nhất toàn Xưởng**, mọi tài khoản đã đăng nhập thấy, chỉ hiện **tên** người thực hiện (không số danh bộ). Sự kiện `user.*` / `group.*` (tài khoản, quyền, nhóm) **chỉ Admin hệ thống** thấy; bản sao ghi theo máy của bước mượn/trả (`equipment.loan_*`, `equipment.return_requested`) bị ẩn để khỏi trùng — chúng chỉ dùng cho tab Lịch sử từng máy. Quy tắc nằm ở `lib/activity-log.ts` (hàm thuần) + `lib/activity-query.ts` (SQL).
- `GET /activities/export?from=&to=` (khoảng ngày giờ VN, mặc định từ đầu tháng): Excel mỗi nghiệp vụ một sheet (Cho mượn gộp mượn máy + mượn nhanh, Điều chuyển, Sửa chữa, Thanh lý, CCDC, Tài khoản & nhóm chỉ Admin, Khác), tối đa 20.000 dòng. Định dạng dùng chung `lib/export/workbook-kit.ts`.
- **Thêm sự kiện audit mới** (`writeAudit` với `action` mới) thì phải thêm vào `ACTIVITY_ACTIONS` (nhãn tiếng Việt + nghiệp vụ); `tests/activity-log.test.ts` quét `src/actions` và sẽ fail nếu thiếu.
- `formatDateTime` / `formatDate` (`lib/utils.ts`) ép múi giờ `Asia/Ho_Chi_Minh` vì server Vercel chạy UTC.

### Thời gian

Nhiều chỗ dùng `new Date().toISOString().slice(0,10)` cho ngày "hôm nay". Không có lib timezone riêng — server chạy UTC trên Vercel nên ngày VN có thể lệch 1 ngày quanh nửa đêm. Cân nhắc khi sửa logic liên quan ngày.

## Database — thay đổi schema

**Nguồn chân lý:** `src/lib/db/schema.ts` (Drizzle, app đọc lúc chạy) **+** `database/current_schema.sql` / `database/update.sql` (DDL viết tay, áp thủ công). Sửa schema là cập nhật **cả hai** cho khớp. `drizzle/*.sql` (0000–0004) chỉ là lịch sử cũ đã áp xong — xem `drizzle/README.md`, đừng thêm file vào đó.

Quy trình thực tế khi deploy (`docs/DEPLOY_CHECKLIST.md`): chạy `database/update.sql` **một lần** trong Neon SQL Editor **trước** khi deploy code (`update.sql` idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE TYPE … EXCEPTION WHEN duplicate_object`). **Không** chạy `npm run db:push` / `db:init` / `db:seed` trên môi trường có dữ liệu — chúng chỉ để dựng DB mới ở môi trường thử.

Lỗi vi phạm UNIQUE (race check-then-insert) nhận diện bằng `isUniqueViolation(error)` (`src/lib/db/errors.ts`, SQLSTATE 23505) để trả thông báo tiếng Việt thay vì lỗi thô.

## Env

`.env.local` khi chạy local, Vercel Project Settings khi prod. Không có `.env.example`.

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `DATABASE_URL` | ✅ | chuỗi kết nối Neon |
| `AUTH_SECRET` | ✅ (prod) | ≥ 32 ký tự ngẫu nhiên. Thiếu ở prod → app throw khi khởi động / build fail. Local có fallback dev. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMPLOYEE_CODE` / `ADMIN_FULL_NAME` | chỉ khi seed | dùng bởi `scripts/seed.ts` |

## Deploy

GitHub → Vercel (`main`). `next.config.ts` set sẵn bộ security header cho mọi route. Lịch sử commit gốc chủ yếu là "Add files via upload" (upload qua web GitHub).

## Nợ kỹ thuật đã biết

Bản rà soát tháng 9/2026 đã xử lý: security header, `.gitignore` + lockfile, 3 test lỗi thời, scoping `/activities` + `/reports`, rate-limit IP giả mạo được, khóa đăng nhập có chủ đích, race check-then-insert, `recordStatus` ở `updateEquipmentConditionAction`, tài liệu nguồn schema.

Còn tồn (mức thấp, chưa xử lý):

- **Test kiểu khớp chuỗi source.** `tests/loan-policy.test.ts` và một phần `tests/groups.test.ts` đọc file `.ts` bằng regex, không test hành vi thật — dễ vỡ khi đổi tên hàm / chuỗi. Sửa `src/actions/machine-loans.ts` / `quick-loans.ts` / `lib/group-structure.ts` thì chạy lại `npm test`. Quy tắc quyền bước "xác nhận nhận lại" là **operator+** (machine-loan V1.6.4, quick-loan V1.6.7), không phải viewer.
- **Xử lý ngày theo UTC.** Nhiều chỗ `new Date().toISOString().slice(0,10)` cho ngày "hôm nay"; server Vercel chạy UTC → ngày VN lệch 1 ngày quanh nửa đêm. Chưa có lib timezone.
- **`auth_rate_limits` phình dần.** `checkRateLimit` chỉ upsert, không dọn dòng cũ; `resetRateLimit` chỉ xóa 1 key khi đăng nhập thành công. Cần cron/TTL dọn định kỳ nếu bảng lớn.
- **`drizzle.config.ts` `out: "./database/generated"`** trỏ tới thư mục không tồn tại và khác `drizzle/` — `db:generate` sẽ ghi ra chỗ lạ. Không ảnh hưởng runtime (xem `drizzle/README.md`).
- **`src/lib/db/index.ts`**: `ssl: { rejectUnauthorized: true }` không kèm CA bundle, dựa vào root store hệ thống — chạy được với Neon nhưng dễ vỡ nếu đổi provider.
- **Flash cookie** để `httpOnly: false` không cần thiết (chỉ dùng phía server).
- Không có `.env.example`. `next-env.d.ts` cố tình giữ bản 2 dòng tối giản (xem comment trong `.gitignore`).
