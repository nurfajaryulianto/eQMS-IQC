-- ============================================================
-- migration_bucket_type.sql
-- Memperbaiki tipe data kolom bucket agar dapat menyimpan >1 tanggal
-- Jalankan skrip ini di Supabase Dashboard: SQL Editor -> Run
-- ============================================================

ALTER TABLE public.subcont_inspections 
ALTER COLUMN bucket TYPE TEXT USING bucket::TEXT;
