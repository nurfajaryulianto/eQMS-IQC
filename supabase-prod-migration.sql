-- ============================================================
-- eQMS — Production RLS Migration
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- Prasyarat: supabase-setup.sql sudah pernah dijalankan
-- ============================================================

-- ─── STEP 1: Hapus semua policy development (anon) ───────────
DROP POLICY IF EXISTS "dev_anon_defects"    ON public.defects;
DROP POLICY IF EXISTS "dev_anon_app_users"  ON public.app_users;
DROP POLICY IF EXISTS "dev_anon_vendors"    ON public.vendors;
DROP POLICY IF EXISTS "dev_anon_components" ON public.components;

-- ─── STEP 2: Policy production — SELECT untuk semua user login ───
-- Form inspeksi (auditor) butuh baca defects, vendors, components, app_users.

CREATE POLICY "auth_read_defects"    ON public.defects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_vendors"    ON public.vendors
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_components" ON public.components
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_app_users"  ON public.app_users
  FOR SELECT TO authenticated USING (true);

-- ─── STEP 3: Policy production — INSERT/UPDATE/DELETE hanya admin ───

CREATE POLICY "admin_write_defects"    ON public.defects
  FOR ALL TO authenticated
  USING     ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

CREATE POLICY "admin_write_vendors"    ON public.vendors
  FOR ALL TO authenticated
  USING     ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

CREATE POLICY "admin_write_components" ON public.components
  FOR ALL TO authenticated
  USING     ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

CREATE POLICY "admin_write_app_users"  ON public.app_users
  FOR ALL TO authenticated
  USING     ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');

-- ─── VERIFIKASI (jalankan terpisah, hanya untuk cek) ─────────
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
