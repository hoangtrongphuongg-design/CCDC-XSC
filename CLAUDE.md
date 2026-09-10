# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này. Viết bằng tiếng Việt vì toàn bộ domain, UI và commit message đều tiếng Việt.

## Lệnh

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # cần AUTH_SECRET + DATABASE_URL trong env, nếu không sẽ lỗi "Collecting page data"
npm run start
npm run typecheck  # tsc --noEmit
npm test           # tsx --test tests/*.test.ts — 24 pass
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
- **Phạm vi xem dữ liệu tổng hợp:** `canViewWholeWorkshop(auth)` (`lib/auth/roles.ts`, hàm thuần dùng được cả client) = `isAdmin || isWsManager || isReadOnlyViewer` → thấy toàn XSC. Người dùng theo nhóm chỉ thấy nhóm mình. Trang chỉ dành cho phạm vi toàn Xưởng gọi `requireWholeWorkshopView()` (vd `/reports`); trang hiện cho mọi người nhưng lọc nội dung theo `auth.permissions` (vd `/activities`, panel phân tích ở `/dashboard`). Sidebar ẩn link "Báo cáo" nếu không có quyền — chỉ là UX, trang vẫn tự gác.
- **Quyền theo nhóm** (`user_group_permissions`): `viewer` < `operator` < `manager`. `isWorkshopAdmin` bỏ qua bậc này (full mọi nhóm); `isReadOnlyViewer` luôn bị chặn ghi.
- Chi tiết ngữ nghĩa vai trò: `docs/PROJECT_BRIEF.md`.

### Mô hình dữ liệu (`src/lib/db/schema.ts`)

- `equipment` — máy **có mã hệ thống riêng** (`code`, unique, không đổi suốt vòng đời kể cả khi điều chuyển). `legacyCode` = mã đã bấm/khắc trên máy. `originGroupId` (nhóm cấp mã gốc) ≠ `ownerGroupId` (nhóm quản lý hiện tại) ≠ `currentGroupId` (nhóm đang giữ). `recordStatus` `draft`/`active` — nghiệp vụ chỉ chạy trên `active`.
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

### Validation

`zod` schema đặt tại `src/lib/validation.ts` (login/register) và inline trong `src/actions/equipment.ts` (`equipmentFormSchema`). Form nghiệp vụ đơn giản parse `formData` thủ công + `throw new Error("thông báo tiếng Việt")` — thông báo này hiển thị trực tiếp cho người dùng.

### Cơ cấu nhóm (`src/lib/group-structure.ts`)

`STANDARD_GROUPS` là nguồn chân lý: 15 nhóm nghiệp vụ + 1 nhóm hệ thống `KHO_TL` (kho thanh lý). `isOfficialOperationalGroupCode()` gác việc gán nhóm cho user/thiết bị. Thêm nhóm = sửa mảng này rồi Admin bấm "Đồng bộ cơ cấu nhóm" (`syncStandardGroupsAction`, upsert theo `code`). `LEGACY_GROUP_CODES` chỉ tự vô hiệu hóa khi hết dữ liệu liên quan.

### Giao diện

- "Corporate Industrial Light UI", màu thương hiệu `#004A8F`. Không dùng theme tím/pastel cũ.
- **Không cuộn ngang toàn trang.** Bảng desktop ép trong viewport, nội dung dài xuống dòng; mobile chuyển bảng → card. `tests/ui.test.ts` canh chừng quy tắc này qua `src/app/globals.css` / `ui-*.css`.
- CSS: `src/app/globals.css` + `ui-current.css` + `ui-v3.css`. Chi tiết: `docs/BRAND_UI_STANDARD.md`, `docs/UI_DESIGN_STANDARD_V3.md`.
- Sidebar (desktop) và MobileNav ẩn/hiện menu theo vai trò — **chỉ là UX**, backend luôn kiểm tra quyền độc lập.
- Toast flash message chỉ render trong `MobileNav`; text đi qua JSX (được escape).

### Thời gian

Nhiều chỗ dùng `new Date().toISOString().slice(0,10)` cho ngày "hôm nay". Không có lib timezone riêng — server chạy UTC trên Vercel nên ngày VN có thể lệch 1 ngày quanh nửa đêm. Cân nhắc khi sửa logic liên quan ngày.

## Database — thay đổi schema

**Hai nguồn song song, dễ lệch:**
- `drizzle/*.sql` (0000–0004) + `drizzle.config.ts` — dùng `drizzle-kit`.
- `database/current_schema.sql` (toàn bộ) + `database/update.sql` (bổ sung cột/bảng, idempotent, `ADD COLUMN IF NOT EXISTS`).

Quy trình thực tế khi deploy (`docs/DEPLOY_CHECKLIST.md`): chạy `database/update.sql` **một lần** trong Neon SQL Editor **trước** khi deploy code. **Không** chạy `npm run db:push` / `db:init` / `db:seed` trên môi trường có dữ liệu. Khi thêm cột/bảng: nối vào cuối `database/update.sql` theo kiểu idempotent, và cập nhật `schema.ts` cho khớp.

## Env

`.env.local` khi chạy local, Vercel Project Settings khi prod. Không có `.env.example`.

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `DATABASE_URL` | ✅ | chuỗi kết nối Neon |
| `AUTH_SECRET` | ✅ (prod) | ≥ 32 ký tự ngẫu nhiên. Thiếu ở prod → app throw khi khởi động / build fail. Local có fallback dev. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMPLOYEE_CODE` / `ADMIN_FULL_NAME` | chỉ khi seed | dùng bởi `scripts/seed.ts` |

## Deploy

GitHub → Vercel (`main`). `next.config.ts` hiện **trống** (không có security header). Lịch sử commit chủ yếu là "Add files via upload" (upload qua web GitHub), lịch sử `git` local có thể lệch với origin.

## Nợ kỹ thuật đã biết

- `tests/loan-policy.test.ts` và một phần `tests/groups.test.ts` là **assert khớp chuỗi source** (đọc file `.ts` bằng regex), không phải test hành vi thật — dễ vỡ khi refactor tên hàm / đổi chuỗi. Khi sửa `src/actions/machine-loans.ts` hoặc `quick-loans.ts` nhớ chạy lại `npm test`.
- Quy tắc quyền của bước "xác nhận nhận lại": **operator+ của nhóm sở hữu/cho mượn** (machine-loan V1.6.4, quick-loan V1.6.7) — không phải viewer.
