-- Tách riêng để PostgreSQL đã commit enum pending_approval trước khi dùng làm default.
ALTER TABLE quick_loans ALTER COLUMN status SET DEFAULT 'pending_approval';
