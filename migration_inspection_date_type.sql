-- ============================================================
-- migration_inspection_date_type.sql
-- Memperbaiki tipe data kolom tanggal_insp dan defect log date
-- agar dapat menyimpan >1 tanggal inspeksi lanjutan tanpa error date syntax
-- Jalankan skrip ini di Supabase Dashboard: SQL Editor -> Run
-- ============================================================

-- 1. Ubah tipe kolom tanggal_insp di subcont_inspections ke TEXT
ALTER TABLE public.subcont_inspections 
ALTER COLUMN tanggal_insp TYPE TEXT USING tanggal_insp::TEXT;

-- 2. Ubah tipe kolom date di subcont_defect_logs ke TEXT
ALTER TABLE public.subcont_defect_logs 
ALTER COLUMN date TYPE TEXT USING date::TEXT;
