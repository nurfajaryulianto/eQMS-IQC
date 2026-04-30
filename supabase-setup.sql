-- ============================================================
-- eQMS — Supabase Database Setup
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ============================================================
-- 1. TABEL DEFECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.defects (
  id         BIGSERIAL    PRIMARY KEY,
  name       TEXT         NOT NULL UNIQUE,
  label      TEXT         NOT NULL,
  category   TEXT         NOT NULL CHECK (category IN ('minor', 'major', 'critical')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed data defect default
INSERT INTO public.defects (name, label, category) VALUES
  ('OVER CEMENT',               'Over Cement',           'minor'),
  ('STAIN UPPER',               'Stain Upper',           'minor'),
  ('STAIN OUTSOLE',             'Stain Outsole',         'minor'),
  ('THREAD END',                'Thread End',            'minor'),
  ('WRINKLE',                   'Wrinkle',               'minor'),
  ('ALIGN UP',                  'Align Up',              'minor'),
  ('X-RAY',                     'X-Ray',                 'minor'),
  ('STITCH MARGIN / SPI',       'Stitch Margin/SPI',     'minor'),
  ('RAT HOLE',                  'Rat Hole',              'major'),
  ('ARIANCE',                   'Ariance',               'major'),
  ('OVER BUFFING',              'Over Buffing',          'major'),
  ('OFF CENTER',                'Off Center',            'major'),
  ('TOE / HEEL / COLLAR SHAPE', 'Toe/Heel/Collar',       'major'),
  ('ROCKING',                   'Rocking',               'major'),
  ('LOGO / AIR BAG',            'Logo/Air Bag',          'major'),
  ('YELLOWING',                 'Yellowing',             'major'),
  ('COLOR MIGRATION',           'Color Migration',       'major'),
  ('BOND GAP UPPER',            'Bond Gap Upper',        'critical'),
  ('BROKEN STITCHING',          'Broken Stitching',      'critical'),
  ('BOND GAP MIDSOLE',          'Bond Gap Midsole',      'critical'),
  ('DELAMINATION',              'Delamination',          'critical'),
  ('PEEL OFF',                  'Peel Off',              'critical'),
  ('TWISTED SHOE',              'Twisted Shoe',          'critical'),
  ('METAL CONTAMINATION',       'Metal Contamination',   'critical'),
  ('MATERIAL FAILURE',          'Material Failure',      'critical')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. TABEL APP_USERS (dikelola admin, TERPISAH dari auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_users (
  id           BIGSERIAL    PRIMARY KEY,
  nik          TEXT         NOT NULL UNIQUE CHECK (nik ~ '^[a-zA-Z0-9]{1,20}$'),
  display_name TEXT         NOT NULL,
  role         TEXT         NOT NULL CHECK (role IN ('admin', 'supervisor', 'auditor')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed data user default
INSERT INTO public.app_users (nik, display_name, role) VALUES
  ('12345',  'Badrowi',       'auditor'),
  ('spv001', 'Supervisor',    'supervisor'),
  ('admin',  'Administrator', 'admin')
ON CONFLICT (nik) DO NOTHING;

-- ============================================================
-- 3. TABEL VENDORS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendors (
  id         BIGSERIAL    PRIMARY KEY,
  name       TEXT         NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed data vendor default
INSERT INTO public.vendors (name) VALUES
  ('Vendor A'), ('Vendor B'), ('Vendor C'),
  ('Vendor D'), ('Vendor E'), ('Internal')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 4. TABEL COMPONENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.components (
  id         BIGSERIAL    PRIMARY KEY,
  name       TEXT         NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed data component default
INSERT INTO public.components (name) VALUES
  ('Upper'), ('Outsole'), ('Midsole'), ('Insole'), ('Lining'),
  ('Heel Counter'), ('Box Toe'), ('Sockliner'), ('Laces'), ('Hardware')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE public.defects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;

-- ─── DEVELOPMENT MODE (UI_TEST_MODE = true) ─────────────────
-- Izinkan anon (unauthenticated) membaca & menulis semua tabel.
-- Cocok selama masih pakai UI_TEST_MODE = true di auth.js.
-- HAPUS policy ini saat production dan aktifkan policy di bawah.

CREATE POLICY "dev_anon_defects"    ON public.defects
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_app_users"  ON public.app_users
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_vendors"    ON public.vendors
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "dev_anon_components" ON public.components
  FOR ALL TO anon USING (true) WITH CHECK (true);


-- ─── PRODUCTION MODE (setelah UI_TEST_MODE = false) ─────────
-- Uncomment blok ini setelah beralih ke Supabase Auth sungguhan.
-- Hapus dulu semua policy dev_anon_* di atas sebelum aktifkan ini.

/*

-- Semua user login bisa SELECT (diperlukan form inspeksi)
CREATE POLICY "auth_read_defects"    ON public.defects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_vendors"    ON public.vendors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_components" ON public.components
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_app_users"  ON public.app_users
  FOR SELECT TO authenticated USING (true);

-- Hanya admin yang bisa INSERT / UPDATE / DELETE
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

*/

-- ============================================================
-- MIGRATION: Vendor → Component → Process Hierarchy
-- Jalankan query ini di Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tambahkan kolom vendor_id ke tabel components
ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS vendor_id BIGINT REFERENCES public.vendors(id) ON DELETE SET NULL;

-- 2. Tambahkan kolom material_type ke tabel vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS material_type TEXT CHECK (material_type IN ('upper', 'bottom'));

-- 3. Buat tabel processes
CREATE TABLE IF NOT EXISTS public.processes (
  id           BIGSERIAL    PRIMARY KEY,
  name         TEXT         NOT NULL,
  component_id BIGINT       REFERENCES public.components(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (name, component_id)
);

-- Enable RLS
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

-- Dev mode policy (hapus saat production)
CREATE POLICY "dev_anon_processes" ON public.processes
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Production policies (uncomment saat production)
/*
CREATE POLICY "auth_read_processes" ON public.processes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_write_processes" ON public.processes
  FOR ALL TO authenticated
  USING     ((auth.jwt()->'user_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') = 'admin');
*/
