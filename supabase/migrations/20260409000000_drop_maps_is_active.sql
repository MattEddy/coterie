-- Remove soft-delete from maps — user-owned data should hard-delete
ALTER TABLE maps DROP COLUMN IF EXISTS is_active;
