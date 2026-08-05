-- V1.3.1: mọi nhân viên được tạo thủ tục mượn; Operator nhóm cho duyệt;
-- nhân viên thuộc nhóm cho được xác nhận nhận lại.

ALTER TYPE quick_loan_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'pending_receipt';
ALTER TYPE quick_loan_status ADD VALUE IF NOT EXISTS 'rejected' BEFORE 'cancelled';

ALTER TABLE quick_loans ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES users(id);
ALTER TABLE quick_loans ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE quick_loans ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE quick_loans ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES users(id);

-- Dữ liệu cũ dùng lender_user_id là người đã khởi tạo/giao. Dùng giá trị này để
-- bảo toàn người liên quan khi bổ sung trường người đề nghị.
UPDATE quick_loans
SET requested_by = lender_user_id
WHERE requested_by IS NULL;

ALTER TABLE quick_loans ALTER COLUMN requested_by SET NOT NULL;
ALTER TABLE quick_loans ALTER COLUMN lender_user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS quick_loans_requester_idx ON quick_loans(requested_by, status);
CREATE INDEX IF NOT EXISTS quick_loans_group_flow_idx ON quick_loans(source_group_id, borrower_group_id, status);
