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


-- V1.6.7: Thanh lý CCDC nhỏ lẻ quản lý theo số lượng.
CREATE TABLE IF NOT EXISTS tool_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  tool_id uuid NOT NULL REFERENCES tool_catalog(id),
  owner_group_id uuid NOT NULL REFERENCES groups(id),
  quantity numeric(12,2) NOT NULL,
  proposed_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  condition_summary text,
  status disposal_status NOT NULL DEFAULT 'pending_group',
  group_confirmed_by uuid REFERENCES users(id),
  group_confirmed_at timestamptz,
  ws_approved_by uuid REFERENCES users(id),
  ws_approved_at timestamptz,
  warehouse_received_by uuid REFERENCES users(id),
  warehouse_received_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_disposals_status_idx ON tool_disposals(status);


-- V1.6.12: Chuẩn hóa dữ liệu mượn/trả cũ. Idempotent: chạy lần 2 không đổi thêm gì.
-- NÊN backup trước khi chạy. Chỉ sửa các dòng lệch rõ ràng, không xóa dữ liệu.

-- (a) Phiếu mượn kẹt "có sự cố" dù phiếu sửa nguồn đã kết luận không thể phục hồi
--     và không còn phiếu sửa nào đang mở: đóng phiếu mượn.
UPDATE machine_loans l
SET status = 'completed',
    closed_at = COALESCE(l.closed_at, now()),
    incident_notes = COALESCE(l.incident_notes, '') || ' [Tự đóng: máy đã kết luận không thể phục hồi]',
    updated_at = now()
WHERE l.status = 'incident'
  AND EXISTS (SELECT 1 FROM repairs r WHERE r.source_loan_id = l.id AND r.status = 'irreparable')
  AND NOT EXISTS (
    SELECT 1 FROM repairs r2
    WHERE r2.source_loan_id = l.id AND r2.status IN ('pending_acceptance','repairing','wait_owner_confirm')
  );

-- (b) Máy không còn phiếu mượn/điều chuyển nào đang mở thì phải ở nhóm quản lý
--     (trước đây máy có thể bị kẹt ở nhóm đã mượn và hiện mãi ở "Dụng cụ nhóm tôi" của nhóm đó).
UPDATE equipment e
SET current_group_id = e.owner_group_id,
    current_holder_id = NULL,
    updated_at = now()
WHERE e.current_group_id <> e.owner_group_id
  AND NOT EXISTS (
    SELECT 1 FROM machine_loans l
    WHERE l.equipment_id = e.id
      AND l.status IN ('pending_owner','approved','wait_handover','on_loan','return_requested','incident')
  )
  AND NOT EXISTS (
    SELECT 1 FROM transfers t
    WHERE t.equipment_id = e.id
      AND t.status IN ('pending_source','pending_target','pending_ws','wait_handover')
  );


-- V1.6.13: Chuẩn hóa chữ Loại máy / Vị trí đã nhập tự do ("Máy hàn que" / "máy hàn  que " / "MÁY HÀN QUE").
-- Idempotent: chạy lần 2 không đổi thêm gì. NÊN backup trước khi chạy.
-- Cách chọn cách viết chuẩn (khớp lib/canonical-text.ts): cách viết xuất hiện nhiều nhất; hòa thì
-- ưu tiên chữ đầu viết hoa, rồi thứ tự chữ cái. Loại máy gộp theo từng nhóm thiết bị (category_code).
-- Chỉ gộp các dòng chỉ khác nhau ở hoa/thường và khoảng trắng; không đổi dấu, không xóa dữ liệu.

-- (0) XEM TRƯỚC (chỉ SELECT, chạy trước để biết sẽ đổi gì): các cách viết sẽ bị gộp.
--   Bỏ dấu "--" ở đầu từng dòng của khối dưới đây để chạy.
-- WITH counted AS (
--   SELECT category_code,
--          lower(btrim(regexp_replace(equipment_type, '\s+', ' ', 'g'))) AS k,
--          btrim(regexp_replace(equipment_type, '\s+', ' ', 'g')) AS spelling,
--          count(*) AS n
--   FROM equipment WHERE btrim(coalesce(equipment_type, '')) <> '' GROUP BY 1, 2, 3
-- ), ranked AS (
--   SELECT *, row_number() OVER (PARTITION BY category_code, k
--          ORDER BY n DESC, (spelling ~ '^[[:upper:]]') DESC, spelling ASC) AS rn
--   FROM counted
-- )
-- SELECT r.category_code, r.spelling AS "chuẩn", o.spelling AS "sẽ đổi từ", o.n AS "số máy"
-- FROM ranked r JOIN ranked o ON o.category_code = r.category_code AND o.k = r.k AND o.rn > 1
-- WHERE r.rn = 1 ORDER BY 1, 2;

-- (a) Loại máy: gộp về cách viết chuẩn trong cùng nhóm thiết bị.
WITH counted AS (
  SELECT category_code,
         lower(btrim(regexp_replace(equipment_type, '\s+', ' ', 'g'))) AS k,
         btrim(regexp_replace(equipment_type, '\s+', ' ', 'g')) AS spelling,
         count(*) AS n
  FROM equipment WHERE btrim(coalesce(equipment_type, '')) <> '' GROUP BY 1, 2, 3
), canonical AS (
  SELECT category_code, k, spelling FROM (
    SELECT *, row_number() OVER (PARTITION BY category_code, k
           ORDER BY n DESC, (spelling ~ '^[[:upper:]]') DESC, spelling ASC) AS rn
    FROM counted
  ) ranked WHERE rn = 1
)
UPDATE equipment e
SET equipment_type = c.spelling, updated_at = now()
FROM canonical c
WHERE c.category_code = e.category_code
  AND c.k = lower(btrim(regexp_replace(e.equipment_type, '\s+', ' ', 'g')))
  AND e.equipment_type IS DISTINCT FROM c.spelling;

-- (b) Vị trí: cùng quy tắc, gộp toàn xưởng (không theo nhóm thiết bị).
WITH counted AS (
  SELECT lower(btrim(regexp_replace(current_location, '\s+', ' ', 'g'))) AS k,
         btrim(regexp_replace(current_location, '\s+', ' ', 'g')) AS spelling,
         count(*) AS n
  FROM equipment WHERE btrim(coalesce(current_location, '')) <> '' GROUP BY 1, 2
), canonical AS (
  SELECT k, spelling FROM (
    SELECT *, row_number() OVER (PARTITION BY k
           ORDER BY n DESC, (spelling ~ '^[[:upper:]]') DESC, spelling ASC) AS rn
    FROM counted
  ) ranked WHERE rn = 1
)
UPDATE equipment e
SET current_location = c.spelling, updated_at = now()
FROM canonical c
WHERE c.k = lower(btrim(regexp_replace(e.current_location, '\s+', ' ', 'g')))
  AND e.current_location IS DISTINCT FROM c.spelling;

-- (c) Danh mục loại máy: tắt (không xóa) các bản "na ná" không còn máy nào dùng,
--     để ô gợi ý không còn hiện hai cách viết của cùng một loại.
UPDATE equipment_type_catalog t
SET is_active = false, updated_at = now()
WHERE t.is_active
  AND NOT EXISTS (
    SELECT 1 FROM equipment e
    WHERE e.category_code = t.category_code AND e.equipment_type = t.name
  )
  AND EXISTS (
    SELECT 1 FROM equipment_type_catalog o
    WHERE o.category_code = t.category_code AND o.id <> t.id AND o.is_active
      AND lower(btrim(regexp_replace(o.name, '\s+', ' ', 'g'))) = lower(btrim(regexp_replace(t.name, '\s+', ' ', 'g')))
      AND (EXISTS (SELECT 1 FROM equipment e2 WHERE e2.category_code = o.category_code AND e2.equipment_type = o.name)
           OR o.name < t.name)
  );
