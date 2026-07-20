-- ============================================================
-- eQMS — App Users Role Constraint Migration
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Hapus constraint check role yang lama jika ada
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- Pasang constraint baru yang mengizinkan role 'manager'
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'supervisor', 'manager', 'auditor'));
