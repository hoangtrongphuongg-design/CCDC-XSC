-- Milestone: hoàn thiện Dụng cụ nhóm tôi.
-- An toàn cho database hiện tại: chỉ bổ sung cột/bảng, không xóa dữ liệu.

DO $$ BEGIN
  CREATE TYPE equipment_origin_type AS ENUM ('existing','new_purchase','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_readonly_viewer boolean NOT NULL DEFAULT false;

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS legacy_code varchar(100);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS technical_specs text;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS technical_note text;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS origin_type equipment_origin_type NOT NULL DEFAULT 'existing';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS recorded_date date;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS manufacture_year smallint;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS commission_year smallint;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS origin_group_id uuid REFERENCES groups(id);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS po_contract_no varchar(150);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS supplier_name varchar(200);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS warranty_until date;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_note text;

-- Mở rộng độ dài các trường nhận dạng/vị trí cho dữ liệu thực tế.
ALTER TABLE equipment ALTER COLUMN name TYPE varchar(200);
ALTER TABLE equipment ALTER COLUMN serial TYPE varchar(150);
ALTER TABLE equipment ALTER COLUMN brand TYPE varchar(150);
ALTER TABLE equipment ALTER COLUMN current_location TYPE varchar(255);

UPDATE equipment
SET origin_group_id = owner_group_id
WHERE origin_group_id IS NULL;

UPDATE equipment
SET recorded_date = COALESCE(purchase_date, created_at::date, CURRENT_DATE)
WHERE recorded_date IS NULL;

UPDATE equipment
SET technical_specs = specification
WHERE technical_specs IS NULL AND specification IS NOT NULL;

ALTER TABLE equipment ALTER COLUMN origin_group_id SET NOT NULL;
ALTER TABLE equipment ALTER COLUMN recorded_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS equipment_legacy_code_idx ON equipment(legacy_code);
CREATE INDEX IF NOT EXISTS equipment_serial_idx ON equipment(serial);

CREATE TABLE IF NOT EXISTS equipment_type_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_code, name)
);
CREATE INDEX IF NOT EXISTS equipment_type_catalog_active_idx ON equipment_type_catalog(category_code, is_active);

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_role varchar(80);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS reason text;


-- V1.6.4: CCDC nhỏ lẻ quản lý theo số lượng.
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS purchase_price numeric(18,2);
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS current_location varchar(255);
ALTER TABLE tool_catalog ADD COLUMN IF NOT EXISTS condition equipment_condition NOT NULL DEFAULT 'good';
