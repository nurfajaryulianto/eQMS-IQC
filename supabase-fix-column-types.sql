-- ============================================================
-- supabase-fix-column-types.sql
-- Migrasi tipe data kolom dari VARCHAR terbatas ke TEXT
-- Jalankan skrip ini di Supabase SQL Editor (Dashboard > SQL Editor > Run)
-- ============================================================

-- 1. Tabel: material_master_data
ALTER TABLE IF EXISTS public.material_master_data
  ALTER COLUMN po_number TYPE TEXT,
  ALTER COLUMN product_code TYPE TEXT,
  ALTER COLUMN receive_number TYPE TEXT,
  ALTER COLUMN uom TYPE TEXT,
  ALTER COLUMN po_area TYPE TEXT,
  ALTER COLUMN bucket TYPE TEXT,
  ALTER COLUMN no_bc TYPE TEXT,
  ALTER COLUMN bc_type TYPE TEXT,
  ALTER COLUMN material_type TYPE TEXT,
  ALTER COLUMN uploaded_by TYPE TEXT;

-- 2. Tabel: material_inspections
ALTER TABLE IF EXISTS public.material_inspections
  ALTER COLUMN po_no TYPE TEXT,
  ALTER COLUMN inspector_nik TYPE TEXT,
  ALTER COLUMN rolling_inspection TYPE TEXT,
  ALTER COLUMN approved_by_leader TYPE TEXT,
  ALTER COLUMN inspection_type TYPE TEXT,
  ALTER COLUMN color_check_status TYPE TEXT,
  ALTER COLUMN packaging_status TYPE TEXT,
  ALTER COLUMN roll_inspection_flag TYPE TEXT,
  ALTER COLUMN roll_inspection_percentage TYPE TEXT,
  ALTER COLUMN input_type TYPE TEXT;

-- 3. Tabel: material_claims
ALTER TABLE IF EXISTS public.material_claims
  ALTER COLUMN po_number TYPE TEXT,
  ALTER COLUMN material_type TYPE TEXT,
  ALTER COLUMN no_bc TYPE TEXT,
  ALTER COLUMN supplier_pengirim TYPE TEXT,
  ALTER COLUMN status TYPE TEXT,
  ALTER COLUMN created_by TYPE TEXT;

-- 4. Tabel: subcont_inspections
ALTER TABLE IF EXISTS public.subcont_inspections
  ALTER COLUMN session_id TYPE TEXT,
  ALTER COLUMN material_type TYPE TEXT,
  ALTER COLUMN user_login TYPE TEXT,
  ALTER COLUMN vendor TYPE TEXT,
  ALTER COLUMN component TYPE TEXT,
  ALTER COLUMN process TYPE TEXT,
  ALTER COLUMN style_number TYPE TEXT,
  ALTER COLUMN model TYPE TEXT,
  ALTER COLUMN bucket TYPE TEXT,
  ALTER COLUMN approved_by TYPE TEXT,
  ALTER COLUMN status TYPE TEXT;

-- 5. Tabel: subcont_defect_logs
ALTER TABLE IF EXISTS public.subcont_defect_logs
  ALTER COLUMN session_id TYPE TEXT,
  ALTER COLUMN vendor TYPE TEXT,
  ALTER COLUMN component TYPE TEXT,
  ALTER COLUMN issue_finding TYPE TEXT;
