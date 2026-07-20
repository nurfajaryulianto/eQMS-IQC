-- ============================================================
-- eQMS — Style Models Table Migration
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Buat tabel style_models untuk mapping Style Number → Model Name
CREATE TABLE IF NOT EXISTS public.style_models (
  id           BIGSERIAL    PRIMARY KEY,
  style_number TEXT         NOT NULL UNIQUE,
  model_name   TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.style_models ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow clean re-run of this migration
DROP POLICY IF EXISTS "dev_anon_style_models" ON public.style_models;
DROP POLICY IF EXISTS "auth_read_style_models" ON public.style_models;
DROP POLICY IF EXISTS "admin_write_style_models" ON public.style_models;

-- ─── DEVELOPMENT MODE ───────────────────────────────────────
-- Izinkan anon (tanpa login) membaca & menulis
CREATE POLICY "dev_anon_style_models" ON public.style_models
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── PRODUCTION MODE ────────────────────────────────────────
-- Semua user login (authenticated) bisa SELECT/membaca
CREATE POLICY "auth_read_style_models" ON public.style_models
  FOR SELECT TO authenticated USING (true);

-- Hanya user login dengan role = 'admin' yang bisa melakukan tulis (ALL)
CREATE POLICY "admin_write_style_models" ON public.style_models
  FOR ALL TO authenticated
  USING     ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

