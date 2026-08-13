CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE account_status AS ENUM ('pending','active','rejected','blocked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE permission_level AS ENUM ('viewer','operator','manager'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE equipment_status AS ENUM ('in_use_owner','wait_handover','on_loan','return_requested','wait_inspection','repairing','wait_repair_confirm','wait_disposal','disposal_warehouse','inactive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE equipment_condition AS ENUM ('good','limited','minor_damage','major_damage','awaiting_assessment','irreparable','unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE machine_loan_status AS ENUM ('pending_owner','approved','wait_handover','on_loan','return_requested','completed','rejected','cancelled','incident'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transfer_status AS ENUM ('pending_source','pending_target','pending_ws','wait_handover','completed','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE quick_loan_status AS ENUM ('pending_approval','pending_receipt','borrowed','return_reported','completed','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE repair_status AS ENUM ('pending_acceptance','repairing','wait_owner_confirm','completed','irreparable','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE disposal_status AS ENUM ('pending_group','pending_ws','wait_warehouse','completed','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('info','success','warning','danger'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE equipment_record_status AS ENUM ('draft','active'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE equipment_origin_type AS ENUM ('existing','new_purchase','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  equipment_prefix varchar(16) NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(30) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  employee_code varchar(30) NOT NULL UNIQUE,
  full_name varchar(120) NOT NULL,
  primary_group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  requested_group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  account_status account_status NOT NULL DEFAULT 'pending',
  is_admin boolean NOT NULL DEFAULT false,
  is_ws_manager boolean NOT NULL DEFAULT false,
  is_readonly_viewer boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  session_version integer NOT NULL DEFAULT 1,
  reviewed_at timestamptz,
  reviewed_by uuid,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_format CHECK (
    username = lower(username)
    AND char_length(username) BETWEEN 4 AND 30
    AND username ~ '^[a-z0-9][a-z0-9._]*[a-z0-9]$'
    AND username !~ '\.\.'
  )
);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_reviewed_by_fk;
ALTER TABLE users ADD CONSTRAINT users_reviewed_by_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_status_idx ON users(account_status);

CREATE TABLE IF NOT EXISTS user_group_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  permission_level permission_level NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  UNIQUE(user_id, group_id)
);
CREATE INDEX IF NOT EXISTS user_group_permission_lookup ON user_group_permissions(user_id, group_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_group_per_user ON user_group_permissions(user_id) WHERE is_primary = true AND is_active = true;

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  legacy_code varchar(100),
  name varchar(200) NOT NULL,
  equipment_type varchar(120) NOT NULL,
  category_code varchar(40) NOT NULL DEFAULT 'KHAC',
  specification varchar(240),
  technical_specs text,
  technical_note text,
  unit varchar(30) NOT NULL DEFAULT 'cái',
  record_status equipment_record_status NOT NULL DEFAULT 'active',
  origin_type equipment_origin_type NOT NULL DEFAULT 'existing',
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  model varchar(180),
  serial varchar(150),
  brand varchar(150),
  manufacture_year smallint,
  commission_year smallint,
  origin_group_id uuid NOT NULL REFERENCES groups(id),
  owner_group_id uuid NOT NULL REFERENCES groups(id),
  current_group_id uuid NOT NULL REFERENCES groups(id),
  current_holder_id uuid REFERENCES users(id) ON DELETE SET NULL,
  current_location varchar(255),
  status equipment_status NOT NULL DEFAULT 'in_use_owner',
  condition equipment_condition NOT NULL DEFAULT 'unknown',
  purchase_date date,
  po_contract_no varchar(150),
  supplier_name varchar(200),
  purchase_price numeric(18,2),
  warranty_until date,
  purchase_note text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS equipment_owner_status_idx ON equipment(owner_group_id, status);
CREATE INDEX IF NOT EXISTS equipment_current_group_idx ON equipment(current_group_id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'legacy_code') THEN
    CREATE INDEX IF NOT EXISTS equipment_legacy_code_idx ON equipment(legacy_code);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equipment' AND column_name = 'serial') THEN
    CREATE INDEX IF NOT EXISTS equipment_serial_idx ON equipment(serial);
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS tool_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id),
  code varchar(60),
  category_code varchar(40) NOT NULL DEFAULT 'KHAC',
  equipment_type varchar(120) NOT NULL DEFAULT 'Dụng cụ khác',
  record_status equipment_record_status NOT NULL DEFAULT 'active',
  name varchar(180) NOT NULL,
  specification varchar(180),
  unit varchar(30) NOT NULL DEFAULT 'cái',
  quantity_on_hand numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  purchase_price numeric(18,2),
  current_location varchar(255),
  condition equipment_condition NOT NULL DEFAULT 'good',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_catalog_group_idx ON tool_catalog(group_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS tool_catalog_code_unique ON tool_catalog(code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_counters (
  key varchar(80) PRIMARY KEY,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machine_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  owner_group_id uuid NOT NULL REFERENCES groups(id),
  borrower_group_id uuid NOT NULL REFERENCES groups(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL,
  work_location varchar(180), receiver_name varchar(120),
  expected_return_date date NOT NULL,
  status machine_loan_status NOT NULL DEFAULT 'pending_owner',
  approved_by uuid REFERENCES users(id), approved_at timestamptz,
  handed_over_by uuid REFERENCES users(id), handed_over_at timestamptz,
  received_by uuid REFERENCES users(id), received_at timestamptz,
  return_requested_by uuid REFERENCES users(id), return_requested_at timestamptz,
  closed_by uuid REFERENCES users(id), closed_at timestamptz,
  handover_condition text, return_condition text,
  accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  incident_notes text, rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS machine_loans_status_idx ON machine_loans(status, owner_group_id, borrower_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_machine_loan_per_equipment ON machine_loans(equipment_id)
WHERE status IN ('pending_owner','approved','wait_handover','on_loan','return_requested','incident');

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  source_group_id uuid NOT NULL REFERENCES groups(id),
  target_group_id uuid NOT NULL REFERENCES groups(id),
  proposed_by_group_id uuid NOT NULL REFERENCES groups(id),
  proposed_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  status transfer_status NOT NULL,
  counterpart_accepted_by uuid REFERENCES users(id), counterpart_accepted_at timestamptz,
  ws_approved_by uuid REFERENCES users(id), ws_approved_at timestamptz,
  handed_over_by uuid REFERENCES users(id), handed_over_at timestamptz,
  received_by uuid REFERENCES users(id), received_at timestamptz,
  handover_condition text,
  accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  linked_loan_id uuid REFERENCES machine_loans(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfers_status_idx ON transfers(status);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_transfer_per_equipment ON transfers(equipment_id)
WHERE status IN ('pending_source','pending_target','pending_ws','wait_handover');

CREATE TABLE IF NOT EXISTS quick_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  tool_id uuid REFERENCES tool_catalog(id) ON DELETE SET NULL,
  item_name varchar(180) NOT NULL,
  specification varchar(180), unit varchar(30) NOT NULL DEFAULT 'cái',
  quantity_borrowed numeric(12,2) NOT NULL CHECK (quantity_borrowed > 0),
  returned_good numeric(12,2) NOT NULL DEFAULT 0,
  returned_damaged numeric(12,2) NOT NULL DEFAULT 0,
  lost_quantity numeric(12,2) NOT NULL DEFAULT 0,
  source_group_id uuid NOT NULL REFERENCES groups(id),
  borrower_group_id uuid NOT NULL REFERENCES groups(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id), approved_at timestamptz,
  lender_user_id uuid REFERENCES users(id),
  borrower_user_id uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  expected_return_at timestamptz, received_at timestamptz, return_reported_at timestamptz, closed_at timestamptz,
  status quick_loan_status NOT NULL DEFAULT 'pending_approval',
  lender_note text, borrower_note text, return_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quick_loans_status_idx ON quick_loans(status);

CREATE TABLE IF NOT EXISTS repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  source_loan_id uuid REFERENCES machine_loans(id),
  reported_by_group_id uuid NOT NULL REFERENCES groups(id),
  reported_by uuid NOT NULL REFERENCES users(id),
  issue_description text NOT NULL,
  status repair_status NOT NULL DEFAULT 'pending_acceptance',
  received_by uuid REFERENCES users(id), received_at timestamptz,
  repair_type varchar(30), vendor varchar(180), work_description text,
  cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  completed_by uuid REFERENCES users(id), completed_at timestamptz,
  owner_confirmed_by uuid REFERENCES users(id), owner_confirmed_at timestamptz,
  result_notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repairs_status_idx ON repairs(status);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_repair_per_equipment ON repairs(equipment_id)
WHERE status IN ('pending_acceptance','repairing','wait_owner_confirm');

CREATE TABLE IF NOT EXISTS disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  owner_group_id uuid NOT NULL REFERENCES groups(id),
  proposed_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL, condition_summary text NOT NULL,
  status disposal_status NOT NULL DEFAULT 'pending_group',
  group_confirmed_by uuid REFERENCES users(id), group_confirmed_at timestamptz,
  ws_approved_by uuid REFERENCES users(id), ws_approved_at timestamptz,
  warehouse_received_by uuid REFERENCES users(id), warehouse_received_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disposals_status_idx ON disposals(status);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_disposal_per_equipment ON disposals(equipment_id)
WHERE status IN ('pending_group','pending_ws','wait_warehouse');

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  actor_role varchar(80),
  action varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  description text NOT NULL,
  before_data jsonb, after_data jsonb,
  reason text,
  ip_address varchar(80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON activity_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'info',
  title varchar(180) NOT NULL,
  message text NOT NULL,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_group_idx ON notifications(group_id, read_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key varchar(180) PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  sheet_name varchar(120) NOT NULL,
  row_number integer NOT NULL,
  severity varchar(20) NOT NULL,
  issue_code varchar(80) NOT NULL,
  message text NOT NULL,
  raw_data jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_issues_batch_idx ON import_issues(batch_id, severity);

-- Tương thích khi nâng cấp từ V1.2.x: bảng groups cũ chưa có equipment_prefix.
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

INSERT INTO groups(code, name, equipment_prefix, is_system) VALUES
  ('COI', 'Bảo trì cơ - Nhóm Cối', 'COI', false),
  ('CBL', 'Bảo trì cơ - Nhóm CBL', 'CBL', false),
  ('NBS', 'Bảo trì cơ - Nghiền BS-NT', 'NBSNT', false),
  ('LO', 'Bảo trì cơ - Nhóm Lò', 'LO', false),
  ('NXM', 'Bảo trì cơ - Nhóm NXM', 'NXM', false),
  ('WORKSHOP', 'Bảo trì cơ - Nhóm Workshop', 'WS', false),
  ('BOI_TRON', 'Bảo trì cơ - Nhóm Bôi trơn', 'BT', false),
  ('BANG_TAI', 'Bảo trì cơ - Nhóm Băng tải', 'BTAI', false),
  ('DIEN_MO', 'Bảo trì điện - Nhóm điện Mỏ', 'DMO', false),
  ('DIEN_CBL_NT', 'Bảo trì điện - Nhóm điện CBL - NT', 'DCBLNT', false),
  ('DIEN_NBS_LO', 'Bảo trì điện - Nhóm Nghiền BS - Lò nung', 'DNBSLO', false),
  ('DIEN_NXM_TD_PT', 'Bảo trì điện - Nhóm Nghiền XM - Trạm điện - Phụ trợ', 'DNXMTP', false),
  ('NHOM_KHAC', 'Nhóm khác (Đơn vị khác; nhà thầu,...)', 'KHAC', false),
  ('KHO_TL', 'Kho thanh lý', 'TL', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  equipment_prefix = EXCLUDED.equipment_prefix,
  is_system = EXCLUDED.is_system,
  is_active = true,
  updated_at = now();
