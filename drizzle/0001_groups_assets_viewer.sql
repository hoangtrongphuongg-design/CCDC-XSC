-- V1.3.0: đồng bộ nhóm, quyền chỉ xem, phân loại dụng cụ và mã tự sinh.

ALTER TYPE permission_level ADD VALUE IF NOT EXISTS 'viewer' BEFORE 'operator';
DO $$ BEGIN
  CREATE TYPE equipment_record_status AS ENUM ('draft','active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS equipment_prefix varchar(16);
UPDATE groups
SET equipment_prefix = CASE code
  WHEN 'COI' THEN 'COI'
  WHEN 'CBL' THEN 'CBL'
  WHEN 'NBS' THEN 'NBSNT'
  WHEN 'LO' THEN 'LO'
  WHEN 'NXM' THEN 'NXM'
  WHEN 'WORKSHOP' THEN 'WS'
  WHEN 'BOI_TRON' THEN 'BT'
  WHEN 'BANG_TAI' THEN 'BTAI'
  WHEN 'DIEN_MO' THEN 'DMO'
  WHEN 'DIEN_CBL_NT' THEN 'DCBLNT'
  WHEN 'DIEN_NBS_LO' THEN 'DNBSLO'
  WHEN 'DIEN_NXM_TD_PT' THEN 'DNXMTP'
  WHEN 'NHOM_KHAC' THEN 'KHAC'
  WHEN 'KHO_TL' THEN 'TL'
  ELSE left(regexp_replace(upper(code), '[^A-Z0-9]+', '', 'g'), 16)
END
WHERE equipment_prefix IS NULL OR equipment_prefix = '';
UPDATE groups SET equipment_prefix = 'GEN' WHERE equipment_prefix IS NULL OR equipment_prefix = '';
ALTER TABLE groups ALTER COLUMN equipment_prefix SET DEFAULT 'GEN';
ALTER TABLE groups ALTER COLUMN equipment_prefix SET NOT NULL;

ALTER TABLE workflow_counters ALTER COLUMN key TYPE varchar(80);

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS category_code varchar(40) NOT NULL DEFAULT 'KHAC';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS specification varchar(240);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS unit varchar(30) NOT NULL DEFAULT 'cái';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS record_status equipment_record_status NOT NULL DEFAULT 'active';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS code varchar(60);
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS category_code varchar(40) NOT NULL DEFAULT 'KHAC';
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS equipment_type varchar(120) NOT NULL DEFAULT 'Dụng cụ khác';
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS record_status equipment_record_status NOT NULL DEFAULT 'active';
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tool_catalog_code_unique ON tool_catalog(code) WHERE code IS NOT NULL;

INSERT INTO groups(code, name, equipment_prefix, is_system, is_active) VALUES
  ('COI', 'Bảo trì cơ - Nhóm Cối', 'COI', false, true),
  ('CBL', 'Bảo trì cơ - Nhóm CBL', 'CBL', false, true),
  ('NBS', 'Bảo trì cơ - Nghiền BS-NT', 'NBSNT', false, true),
  ('LO', 'Bảo trì cơ - Nhóm Lò', 'LO', false, true),
  ('NXM', 'Bảo trì cơ - Nhóm NXM', 'NXM', false, true),
  ('WORKSHOP', 'Bảo trì cơ - Nhóm Workshop', 'WS', false, true),
  ('BOI_TRON', 'Bảo trì cơ - Nhóm Bôi trơn', 'BT', false, true),
  ('BANG_TAI', 'Bảo trì cơ - Nhóm Băng tải', 'BTAI', false, true),
  ('DIEN_MO', 'Bảo trì điện - Nhóm điện Mỏ', 'DMO', false, true),
  ('DIEN_CBL_NT', 'Bảo trì điện - Nhóm điện CBL - NT', 'DCBLNT', false, true),
  ('DIEN_NBS_LO', 'Bảo trì điện - Nhóm Nghiền BS - Lò nung', 'DNBSLO', false, true),
  ('DIEN_NXM_TD_PT', 'Bảo trì điện - Nhóm Nghiền XM - Trạm điện - Phụ trợ', 'DNXMTP', false, true),
  ('NHOM_KHAC', 'Nhóm khác (Đơn vị khác; nhà thầu,...)', 'KHAC', false, true),
  ('KHO_TL', 'Kho thanh lý', 'TL', true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  equipment_prefix = EXCLUDED.equipment_prefix,
  is_system = EXCLUDED.is_system,
  is_active = true,
  updated_at = now();

-- Khởi tạo bộ đếm từ mã hiện có để không cấp lại số đã dùng.
INSERT INTO workflow_counters(key, value, updated_at)
SELECT
  'ASSET:' || g.code,
  COALESCE(MAX(NULLIF(substring(e.code FROM '([0-9]+)$'), '')::integer), 0),
  now()
FROM groups g
LEFT JOIN equipment e ON e.owner_group_id = g.id
GROUP BY g.code
ON CONFLICT (key) DO UPDATE
SET value = GREATEST(workflow_counters.value, EXCLUDED.value), updated_at = now();

INSERT INTO workflow_counters(key, value, updated_at)
SELECT
  'TOOL:' || g.code,
  COALESCE(MAX(NULLIF(substring(t.code FROM '([0-9]+)$'), '')::integer), 0),
  now()
FROM groups g
LEFT JOIN tool_catalog t ON t.group_id = g.id
GROUP BY g.code
ON CONFLICT (key) DO UPDATE
SET value = GREATEST(workflow_counters.value, EXCLUDED.value), updated_at = now();
