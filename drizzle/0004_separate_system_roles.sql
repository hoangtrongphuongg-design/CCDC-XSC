BEGIN;

-- Chuẩn hóa tài khoản admin mặc định đã được tạo bởi các bản trước.
-- Admin hệ thống và Quản lý Xưởng là hai vai trò độc lập.
WITH default_admin AS (
  SELECT id
  FROM users
  WHERE username = 'admin'
    AND is_admin = true
  LIMIT 1
)
UPDATE users
SET
  is_ws_manager = false,
  session_version = session_version + 1,
  updated_at = now()
WHERE id IN (SELECT id FROM default_admin)
  AND is_ws_manager = true;

-- Tài khoản admin mặc định chỉ giữ quyền Nhân viên tại nhóm Workshop.
WITH default_admin AS (
  SELECT id
  FROM users
  WHERE username = 'admin'
    AND is_admin = true
  LIMIT 1
), workshop_group AS (
  SELECT id
  FROM groups
  WHERE code = 'WORKSHOP'
  LIMIT 1
)
UPDATE user_group_permissions
SET
  permission_level = 'viewer',
  is_active = true,
  revoked_by = NULL,
  revoked_at = NULL,
  assigned_at = now()
WHERE user_id IN (SELECT id FROM default_admin)
  AND group_id IN (SELECT id FROM workshop_group);

-- Thu hồi quyền nghiệp vụ Kho thanh lý đã từng được seed tự động cho admin.
WITH default_admin AS (
  SELECT id
  FROM users
  WHERE username = 'admin'
    AND is_admin = true
  LIMIT 1
), disposal_group AS (
  SELECT id
  FROM groups
  WHERE code = 'KHO_TL'
  LIMIT 1
)
UPDATE user_group_permissions
SET
  is_active = false,
  revoked_at = now()
WHERE user_id IN (SELECT id FROM default_admin)
  AND group_id IN (SELECT id FROM disposal_group)
  AND is_active = true;

COMMIT;
