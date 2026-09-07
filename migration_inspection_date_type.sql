-- ============================================================
-- migration_inspection_date_type.sql
-- Memperbaiki tipe data kolom tanggal_insp, defect log date,
-- serta style_number & model agar dapat menyimpan >1 data
-- Jalankan skrip ini di Supabase Dashboard: SQL Editor -> Run
-- ============================================================

-- 1. Ubah tipe kolom tanggal_insp di subcont_inspections ke TEXT
ALTER TABLE public.subcont_inspections 
ALTER COLUMN tanggal_insp TYPE TEXT USING tanggal_insp::TEXT;

-- 2. Ubah tipe kolom date di subcont_defect_logs ke TEXT
ALTER TABLE public.subcont_defect_logs 
ALTER COLUMN date TYPE TEXT USING date::TEXT;

-- 3. Pastikan style_number dan model di subcont_inspections bertipe TEXT untuk menampung multi-style
ALTER TABLE public.subcont_inspections 
ALTER COLUMN style_number TYPE TEXT,
ALTER COLUMN model TYPE TEXT;
