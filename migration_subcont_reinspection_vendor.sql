-- ============================================================
-- migration_subcont_reinspection_vendor.sql
-- Menambahkan dukungan Re-Inspection (max 1x) pada IQC Subcont
-- serta role 'vendor' dan vendor assignment pada app_users.
-- Jalankan di: Supabase Dashboard -> SQL Editor -> Run
-- ============================================================

-- 1. Kolom relasi & penanda reinspection pada subcont_inspections
ALTER TABLE public.subcont_inspections
  ADD COLUMN IF NOT EXISTS parent_session_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_reinspection BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_subcont_insp_parent
  ON public.subcont_inspections(parent_session_id);

CREATE INDEX IF NOT EXISTS idx_subcont_insp_is_reinsp
  ON public.subcont_inspections(is_reinspection);

-- Pastikan constraint status mengizinkan Pass, Fail, Done, In-Progress
ALTER TABLE public.subcont_inspections
  DROP CONSTRAINT IF EXISTS subcont_inspections_status_check;

ALTER TABLE public.subcont_inspections
  ADD CONSTRAINT subcont_inspections_status_check
  CHECK (status IN ('Done', 'In-Progress', 'done', 'in-progress', 'Pass', 'Fail', 'pass', 'fail'));

-- 2. Role 'vendor' dan assigned_vendor pada app_users
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'supervisor', 'manager', 'auditor', 'inspector', 'vendor'));

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS assigned_vendor TEXT;
