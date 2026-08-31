-- ============================================================
-- supabase-material-db.sql
-- Schema PostgreSQL untuk modul IQC Material eQMS
-- Jalankan SEPENUHNYA di Supabase SQL Editor
-- ============================================================

-- ─── 1. TABEL: material_master_data ──────────────────────────

CREATE TABLE IF NOT EXISTS public.material_master_data (
  id                  BIGSERIAL PRIMARY KEY,
  po_number           TEXT          NOT NULL,
  material_name       TEXT          NOT NULL,
  material_description TEXT,
  uom                 TEXT,
  supplier            TEXT,
  supplier_name       TEXT,
  po_area             TEXT,
  batch_size          NUMERIC(12,2) DEFAULT 0,
  product_code        TEXT,
  model_name          TEXT,
  bucket              TEXT,
  receive_date        DATE,
  shipment_number     TEXT,
  no_bc               TEXT,
  bc_type             TEXT,
  receive_number      TEXT,
  material_type       TEXT,
  status              VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in-progress','done')),
  uploaded_by         TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Composite unique index (expression-based — tidak bisa pakai ADD CONSTRAINT di Postgres)
DROP INDEX IF EXISTS uq_md_po_date_mat_recnum_qty;
CREATE UNIQUE INDEX uq_md_po_date_mat_recnum_qty
  ON public.material_master_data (
    lower(po_number),
    receive_date,
    lower(material_name),
    lower(COALESCE(receive_number, '')),
    batch_size
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_md_status        ON public.material_master_data(status);
CREATE INDEX IF NOT EXISTS idx_md_po_number     ON public.material_master_data(lower(po_number));
CREATE INDEX IF NOT EXISTS idx_md_receive_date  ON public.material_master_data(receive_date DESC);
CREATE INDEX IF NOT EXISTS idx_md_material_type ON public.material_master_data(lower(material_type));
CREATE INDEX IF NOT EXISTS idx_md_created_at    ON public.material_master_data(created_at DESC);

-- ─── 2. TABEL: material_inspections ──────────────────────────

CREATE TABLE IF NOT EXISTS public.material_inspections (
  id                       BIGSERIAL PRIMARY KEY,
  inspection_id            VARCHAR(100) UNIQUE NOT NULL,
  master_data_id           BIGINT REFERENCES public.material_master_data(id) ON DELETE SET NULL,
  po_no                    VARCHAR(255),
  material_name            TEXT,
  item_description         TEXT,
  qty_receive              NUMERIC(12,2) DEFAULT 0,
  ok                       NUMERIC(12,2) DEFAULT 0,
  no_qty                   NUMERIC(12,2) DEFAULT 0,
  receive_date             DATE,
  status                   VARCHAR(20)  DEFAULT 'done'
                             CHECK (status IN ('pending','in-progress','done','pass','fail')),
  inspection_date          TIMESTAMPTZ  DEFAULT NOW(),
  inspector_nik            VARCHAR(100),
  defect_notes             TEXT,
  rolling_inspection       VARCHAR(50),
  approved_by_leader       VARCHAR(255),
  evidence_url             TEXT,
  inspection_type          VARCHAR(100),
  color_check_status       VARCHAR(50),
  color_check_result       TEXT,
  packaging_status         VARCHAR(50),
  packaging_reject_reason  TEXT,
  roll_inspection_flag     VARCHAR(50),
  roll_inspection_percentage VARCHAR(50),
  bonding_test_url         TEXT,
  input_type               VARCHAR(50) DEFAULT 'manual',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insp_master_data_id   ON public.material_inspections(master_data_id);
CREATE INDEX IF NOT EXISTS idx_insp_po_no            ON public.material_inspections(lower(po_no));
CREATE INDEX IF NOT EXISTS idx_insp_inspector_nik    ON public.material_inspections(inspector_nik);
CREATE INDEX IF NOT EXISTS idx_insp_inspection_date  ON public.material_inspections(inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_insp_inspection_type  ON public.material_inspections(inspection_type);

-- ─── 3. TABEL: material_claims ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.material_claims (
  id                   BIGSERIAL PRIMARY KEY,
  master_data_id       BIGINT REFERENCES public.material_master_data(id) ON DELETE SET NULL,
  po_number            VARCHAR(255),
  material_name        TEXT,
  vendor_name          TEXT,
  material_type        VARCHAR(100),
  claimed_qty          NUMERIC(12,2) NOT NULL,
  reason               TEXT          NOT NULL,
  ref_number           VARCHAR(255),
  submitted_by         VARCHAR(100),
  original_planned_qty NUMERIC(12,2),
  new_planned_qty      NUMERIC(12,2),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_master_data_id ON public.material_claims(master_data_id);
CREATE INDEX IF NOT EXISTS idx_claims_po_number      ON public.material_claims(lower(po_number));

-- ─── 4. TABEL: material_assignments ──────────────────────────

CREATE TABLE IF NOT EXISTS public.material_assignments (
  id              BIGSERIAL PRIMARY KEY,
  material_type   VARCHAR(100) NOT NULL,
  inspector_nik   VARCHAR(100),
  inspector_name  TEXT,
  updated_by      VARCHAR(100),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 4B. TABEL: material_users (Khusus Modul IQC Material) ────

CREATE TABLE IF NOT EXISTS public.material_users (
  id                  BIGSERIAL PRIMARY KEY,
  nik                 VARCHAR(50)  NOT NULL UNIQUE,
  display_name        TEXT         NOT NULL,
  role                VARCHAR(50)  NOT NULL CHECK (role IN ('admin', 'supervisor', 'manager', 'inspector')),
  material_assignment TEXT         DEFAULT '',
  auth_user_id        UUID         UNIQUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes material_users
CREATE INDEX IF NOT EXISTS idx_mat_users_nik  ON public.material_users(nik);
CREATE INDEX IF NOT EXISTS idx_mat_users_role ON public.material_users(role);

-- ─── 5. TRIGGER: auto-update status master_data ──────────────
-- Setiap kali inspection di-insert/update, hitung ulang status
-- master_data berdasarkan SUM(ok+no_qty) vs batch_size.

CREATE OR REPLACE FUNCTION fn_sync_master_data_status()
RETURNS TRIGGER AS $$
DECLARE
  v_md_id          BIGINT;
  v_batch_size     NUMERIC;
  v_total_checked  NUMERIC;
  v_has_done       BOOLEAN;
  v_new_status     VARCHAR(20);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_md_id := OLD.master_data_id;
  ELSE
    v_md_id := NEW.master_data_id;
  END IF;

  IF v_md_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT batch_size INTO v_batch_size
  FROM public.material_master_data
  WHERE id = v_md_id;

  SELECT
    COALESCE(SUM(ok + no_qty), 0),
    BOOL_OR(status IN ('done', 'pass'))
  INTO v_total_checked, v_has_done
  FROM public.material_inspections
  WHERE master_data_id = v_md_id;

  IF v_has_done OR (v_batch_size > 0 AND v_total_checked >= v_batch_size) THEN
    v_new_status := 'done';
  ELSIF v_total_checked > 0 THEN
    v_new_status := 'in-progress';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.material_master_data
  SET status = v_new_status
  WHERE id = v_md_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_md_status ON public.material_inspections;
CREATE TRIGGER trg_sync_md_status
  AFTER INSERT OR UPDATE OR DELETE ON public.material_inspections
  FOR EACH ROW EXECUTE FUNCTION fn_sync_master_data_status();

-- ─── 6. RPC: fn_pass_all_materials ───────────────────────────

CREATE OR REPLACE FUNCTION fn_pass_all_materials(
  target_ids  BIGINT[],
  admin_nik   TEXT,
  admin_name  TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_id         BIGINT;
  v_row        public.material_master_data%ROWTYPE;
  v_insp_id    TEXT;
  v_count      INT := 0;
  v_insp_nik   TEXT;
  v_insp_name  TEXT;
  v_mat_type   TEXT;
BEGIN
  FOREACH v_id IN ARRAY target_ids LOOP
    SELECT * INTO v_row FROM public.material_master_data WHERE id = v_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_row.status = 'done' THEN CONTINUE; END IF;

    -- Reset inspector variables
    v_insp_nik := NULL;
    v_insp_name := NULL;
    v_mat_type := UPPER(TRIM(COALESCE(v_row.material_type, '')));

    -- 1. Match material_assignments by exact material_type match
    IF v_mat_type <> '' THEN
      SELECT inspector_nik, inspector_name INTO v_insp_nik, v_insp_name
      FROM public.material_assignments
      WHERE UPPER(TRIM(material_type)) = v_mat_type
        AND inspector_nik IS NOT NULL AND TRIM(inspector_nik) <> ''
      LIMIT 1;
    END IF;

    -- 2. Fallback: match material_assignments by keyword in material_name
    IF (v_insp_nik IS NULL OR v_insp_nik = '') AND v_row.material_name IS NOT NULL THEN
      SELECT inspector_nik, inspector_name INTO v_insp_nik, v_insp_name
      FROM public.material_assignments
      WHERE ((UPPER(TRIM(material_type)) IN ('LEATHER', 'LTH') AND UPPER(v_row.material_name) LIKE '%LTH%')
         OR (UPPER(TRIM(material_type)) IN ('TEXTILE', 'TXT') AND UPPER(v_row.material_name) LIKE '%TXT%')
         OR (UPPER(TRIM(material_type)) IN ('SYNTHETIC', 'SYN') AND (UPPER(v_row.material_name) LIKE '%SYN%' OR UPPER(v_row.material_name) LIKE '%PU%')))
        AND inspector_nik IS NOT NULL AND TRIM(inspector_nik) <> ''
      LIMIT 1;
    END IF;

    -- 3. Fallback: check wildcard 'ALL' in material_assignments
    IF v_insp_nik IS NULL OR v_insp_nik = '' THEN
      SELECT inspector_nik, inspector_name INTO v_insp_nik, v_insp_name
      FROM public.material_assignments
      WHERE UPPER(TRIM(material_type)) = 'ALL'
        AND inspector_nik IS NOT NULL AND TRIM(inspector_nik) <> ''
      LIMIT 1;
    END IF;

    -- 4. Fallback: lookup from public.material_users (or app_users fallback)
    IF (v_insp_nik IS NULL OR v_insp_nik = '') AND v_mat_type <> '' THEN
      SELECT nik, display_name INTO v_insp_nik, v_insp_name
      FROM public.material_users
      WHERE LOWER(role) = 'inspector'
        AND (UPPER(material_assignment) LIKE '%' || v_mat_type || '%' OR UPPER(material_assignment) = 'ALL')
      ORDER BY id ASC
      LIMIT 1;
    END IF;

    -- 5. Fallback: pick ANY first available inspector from public.material_users
    IF v_insp_nik IS NULL OR v_insp_nik = '' THEN
      SELECT nik, display_name INTO v_insp_nik, v_insp_name
      FROM public.material_users
      WHERE LOWER(role) = 'inspector'
      ORDER BY id ASC
      LIMIT 1;
    END IF;

    -- 6. Final Fallback: use admin if no inspectors exist at all
    IF v_insp_nik IS NULL OR v_insp_nik = '' THEN
      v_insp_nik := admin_nik;
      v_insp_name := admin_name;
    END IF;

    v_insp_id := 'PASS-' || v_id::TEXT || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT || '-' || (FLOOR(RANDOM()*1000)::INT)::TEXT;

    INSERT INTO public.material_inspections (
      inspection_id, master_data_id, po_no, material_name,
      qty_receive, ok, no_qty,
      receive_date, status, inspection_date,
      inspector_nik, inspection_type, input_type, created_at
    ) VALUES (
      v_insp_id, v_id, v_row.po_number, v_row.material_name,
      v_row.batch_size, v_row.batch_size, 0,
      v_row.receive_date, 'done', NOW(),
      v_insp_nik, COALESCE(NULLIF(v_row.material_type, ''), 'Raw Material'), 'batch_pass_all', NOW()
    );

    -- Update master data status directly to done
    UPDATE public.material_master_data
    SET status = 'done'
    WHERE id = v_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'passed_count', v_count,
    'message', v_count || ' item berhasil di-Pass All.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 7. RPC: fn_submit_claim_material ────────────────────────

CREATE OR REPLACE FUNCTION fn_submit_claim_material(
  p_master_data_id     BIGINT,
  p_claim_qty          NUMERIC,
  p_reason             TEXT,
  p_ref_number         TEXT,
  p_submitted_by       TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_row              public.material_master_data%ROWTYPE;
  v_new_planned_qty  NUMERIC;
BEGIN
  SELECT * INTO v_row FROM public.material_master_data
  WHERE id = p_master_data_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material dengan id % tidak ditemukan.', p_master_data_id;
  END IF;
  IF p_claim_qty <= 0 THEN
    RAISE EXCEPTION 'Qty klaim harus lebih dari 0.';
  END IF;
  IF p_claim_qty >= v_row.batch_size THEN
    RAISE EXCEPTION 'Qty klaim (%) tidak boleh melebihi atau sama dengan batch size (%).', p_claim_qty, v_row.batch_size;
  END IF;

  v_new_planned_qty := v_row.batch_size - p_claim_qty;

  UPDATE public.material_master_data
  SET batch_size = v_new_planned_qty
  WHERE id = p_master_data_id;

  INSERT INTO public.material_claims (
    master_data_id, po_number, material_name, vendor_name, material_type,
    claimed_qty, reason, ref_number, submitted_by,
    original_planned_qty, new_planned_qty
  ) VALUES (
    p_master_data_id, v_row.po_number, v_row.material_name,
    v_row.supplier_name, v_row.material_type,
    p_claim_qty, p_reason, p_ref_number, p_submitted_by,
    v_row.batch_size, v_new_planned_qty
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'po_number', v_row.po_number,
    'material_name', v_row.material_name,
    'original_batch_size', v_row.batch_size,
    'claimed_qty', p_claim_qty,
    'new_batch_size', v_new_planned_qty,
    'message', 'Klaim berhasil. Batch size diperbarui dari ' || v_row.batch_size || ' menjadi ' || v_new_planned_qty || '.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 8. ROW LEVEL SECURITY (RLS) ─────────────────────────────

ALTER TABLE public.material_master_data   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_inspections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_claims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_assignments   ENABLE ROW LEVEL SECURITY;

-- Helper: ambil role dari JWT user_metadata
CREATE OR REPLACE FUNCTION fn_get_material_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt()->'user_metadata'->>'role')::TEXT, ''
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- material_master_data
DROP POLICY IF EXISTS "md_select_authenticated"  ON public.material_master_data;
DROP POLICY IF EXISTS "md_insert_admin"          ON public.material_master_data;
DROP POLICY IF EXISTS "md_update_admin"          ON public.material_master_data;
DROP POLICY IF EXISTS "md_delete_admin"          ON public.material_master_data;

CREATE POLICY "md_select_authenticated" ON public.material_master_data
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "md_insert_admin" ON public.material_master_data
  FOR INSERT TO authenticated WITH CHECK (fn_get_material_role() = 'admin');
CREATE POLICY "md_update_admin" ON public.material_master_data
  FOR UPDATE TO authenticated USING (fn_get_material_role() = 'admin');
CREATE POLICY "md_delete_admin" ON public.material_master_data
  FOR DELETE TO authenticated USING (fn_get_material_role() = 'admin');

-- material_inspections
DROP POLICY IF EXISTS "insp_select_authenticated"      ON public.material_inspections;
DROP POLICY IF EXISTS "insp_insert_admin_inspector"    ON public.material_inspections;
DROP POLICY IF EXISTS "insp_update_admin"              ON public.material_inspections;
DROP POLICY IF EXISTS "insp_delete_admin"              ON public.material_inspections;

CREATE POLICY "insp_select_authenticated" ON public.material_inspections
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "insp_insert_admin_inspector" ON public.material_inspections
  FOR INSERT TO authenticated
  WITH CHECK (fn_get_material_role() IN ('admin','inspector'));
CREATE POLICY "insp_update_admin" ON public.material_inspections
  FOR UPDATE TO authenticated USING (fn_get_material_role() = 'admin');
CREATE POLICY "insp_delete_admin" ON public.material_inspections
  FOR DELETE TO authenticated USING (fn_get_material_role() = 'admin');

-- material_claims
DROP POLICY IF EXISTS "claims_select_auth"             ON public.material_claims;
DROP POLICY IF EXISTS "claims_insert_admin_supervisor" ON public.material_claims;

CREATE POLICY "claims_select_auth" ON public.material_claims
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "claims_insert_admin_supervisor" ON public.material_claims
  FOR INSERT TO authenticated
  WITH CHECK (fn_get_material_role() IN ('admin','supervisor'));

-- material_assignments
DROP POLICY IF EXISTS "assign_select_auth"  ON public.material_assignments;
DROP POLICY IF EXISTS "assign_write_admin"  ON public.material_assignments;

CREATE POLICY "assign_select_auth" ON public.material_assignments
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "assign_write_admin" ON public.material_assignments
  FOR ALL TO authenticated
  USING (fn_get_material_role() = 'admin')
  WITH CHECK (fn_get_material_role() = 'admin');

-- material_users
ALTER TABLE public.material_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mat_users_select_authenticated" ON public.material_users;
DROP POLICY IF EXISTS "mat_users_write_admin"          ON public.material_users;

CREATE POLICY "mat_users_select_authenticated" ON public.material_users
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "mat_users_write_admin" ON public.material_users
  FOR ALL TO authenticated
  USING (fn_get_material_role() = 'admin')
  WITH CHECK (fn_get_material_role() = 'admin');

-- ─── VERIFIKASI ───────────────────────────────────────────────
-- Jalankan query ini untuk cek semua tabel terbuat:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'material_%'
-- ORDER BY table_name;

-- ============================================================
-- ─── BAGIAN 2: SKEMA MODUL IQC SUBCONT (100% IDENTIK SHEET) ──
-- ============================================================

-- ─── 1. TABEL UTAMA: subcont_inspections (Sheet 1 Header) ────

CREATE TABLE IF NOT EXISTS public.subcont_inspections (
  session_id          VARCHAR(100)  PRIMARY KEY,
  timestamp           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  date                DATE,                      -- Tanggal incoming material (Date)
  material_type       VARCHAR(100),              -- upper, bottom, dll.
  inspection_location VARCHAR(50)   DEFAULT 'In-House', -- In-House atau In-Vendor
  user_login          TEXT,                      -- Nama auditor yang login
  auditor_nik         VARCHAR(50),               -- NIK auditor (opsional)
  vendor              TEXT,                      -- Nama vendor (M3M, dll)
  component           TEXT,                      -- Daftar komponen (Foxing, Vamp, dll)
  process             TEXT,                      -- Proses (Screen Printing, Stitching, dll)
  style_number        VARCHAR(100),              -- Style Number
  model               TEXT,                      -- Model Sepatu
  qty_incoming        NUMERIC(12,2) DEFAULT 0,   -- Qty Incoming
  qty_inspect         NUMERIC(12,2) DEFAULT 0,   -- Qty Inspect
  qty_pass            NUMERIC(12,2) DEFAULT 0,   -- Qty Pass
  qty_defect          NUMERIC(12,2) DEFAULT 0,   -- Qty Defect
  ftt                 NUMERIC(6,4)  DEFAULT 0,   -- First Time Through rate (0.0000 - 1.0000)
  redo_rate           NUMERIC(6,4)  DEFAULT 0,   -- Redo / Rework rate
  tanggal_insp        DATE,                      -- Tanggal inspeksi aktual (TanggalInsp)
  bucket              DATE,                      -- Tanggal bucket produksi
  approved_by         VARCHAR(255),              -- Leader approval
  evidence_url        TEXT,                      -- URL foto evidence di Supabase Storage
  status              VARCHAR(50)   NOT NULL DEFAULT 'Done'
                        CHECK (status IN ('Done', 'In-Progress', 'done', 'in-progress', 'Pass', 'Fail')),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subcont_inspections ADD COLUMN IF NOT EXISTS inspection_location VARCHAR(50) DEFAULT 'In-House';

-- Indexing untuk query cepat (<5ms)
CREATE INDEX IF NOT EXISTS idx_subcont_insp_date        ON public.subcont_inspections(date DESC);
CREATE INDEX IF NOT EXISTS idx_subcont_insp_tgl_insp    ON public.subcont_inspections(tanggal_insp DESC);
CREATE INDEX IF NOT EXISTS idx_subcont_insp_vendor      ON public.subcont_inspections(lower(vendor));
CREATE INDEX IF NOT EXISTS idx_subcont_insp_model       ON public.subcont_inspections(lower(model));
CREATE INDEX IF NOT EXISTS idx_subcont_insp_style       ON public.subcont_inspections(lower(style_number));
CREATE INDEX IF NOT EXISTS idx_subcont_insp_status      ON public.subcont_inspections(status);
CREATE INDEX IF NOT EXISTS idx_subcont_insp_created_at  ON public.subcont_inspections(created_at DESC);

-- ─── 2. TABEL RINCIAN: subcont_defect_logs (Sheet 2 Detail) ───

CREATE TABLE IF NOT EXISTS public.subcont_defect_logs (
  id                  BIGSERIAL     PRIMARY KEY,
  session_id          VARCHAR(100)  NOT NULL
                        REFERENCES public.subcont_inspections(session_id)
                        ON DELETE CASCADE,
  date                DATE,                      -- Tanggal inspeksi
  vendor              TEXT,                      -- Vendor
  component           TEXT,                      -- Komponen (Foxing, Vamp, dll)
  issue_finding       TEXT          NOT NULL,    -- Jenis defect (STAIN, DAMAGE, WRINKLE, dll)
  count               INT           NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexing detail defect
CREATE INDEX IF NOT EXISTS idx_subcont_def_sess_id     ON public.subcont_defect_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_subcont_def_date        ON public.subcont_defect_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_subcont_def_vendor      ON public.subcont_defect_logs(lower(vendor));
CREATE INDEX IF NOT EXISTS idx_subcont_def_component   ON public.subcont_defect_logs(lower(component));
CREATE INDEX IF NOT EXISTS idx_subcont_def_issue       ON public.subcont_defect_logs(lower(issue_finding));

-- ─── 3. SUPABASE STORAGE BUCKET: subcont-evidence ────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('subcont-evidence', 'subcont-evidence', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ─── 4. ROW LEVEL SECURITY (RLS) POLICIES ────────────────────

ALTER TABLE public.subcont_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcont_defect_logs ENABLE ROW LEVEL SECURITY;

-- Policy: subcont_inspections
DROP POLICY IF EXISTS "subcont_insp_select_all" ON public.subcont_inspections;
DROP POLICY IF EXISTS "subcont_insp_insert_all" ON public.subcont_inspections;
DROP POLICY IF EXISTS "subcont_insp_update_all" ON public.subcont_inspections;
DROP POLICY IF EXISTS "subcont_insp_delete_all" ON public.subcont_inspections;

CREATE POLICY "subcont_insp_select_all" ON public.subcont_inspections
  FOR SELECT TO authenticated, anon USING (TRUE);

CREATE POLICY "subcont_insp_insert_all" ON public.subcont_inspections
  FOR INSERT TO authenticated, anon WITH CHECK (TRUE);

CREATE POLICY "subcont_insp_update_all" ON public.subcont_inspections
  FOR UPDATE TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "subcont_insp_delete_all" ON public.subcont_inspections
  FOR DELETE TO authenticated, anon USING (TRUE);

-- Policy: subcont_defect_logs
DROP POLICY IF EXISTS "subcont_def_select_all" ON public.subcont_defect_logs;
DROP POLICY IF EXISTS "subcont_def_insert_all" ON public.subcont_defect_logs;
DROP POLICY IF EXISTS "subcont_def_update_all" ON public.subcont_defect_logs;
DROP POLICY IF EXISTS "subcont_def_delete_all" ON public.subcont_defect_logs;

CREATE POLICY "subcont_def_select_all" ON public.subcont_defect_logs
  FOR SELECT TO authenticated, anon USING (TRUE);

CREATE POLICY "subcont_def_insert_all" ON public.subcont_defect_logs
  FOR INSERT TO authenticated, anon WITH CHECK (TRUE);

CREATE POLICY "subcont_def_update_all" ON public.subcont_defect_logs
  FOR UPDATE TO authenticated, anon USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "subcont_def_delete_all" ON public.subcont_defect_logs
  FOR DELETE TO authenticated, anon USING (TRUE);

-- Policy: storage.objects untuk bucket subcont-evidence
DROP POLICY IF EXISTS "subcont_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "subcont_storage_insert" ON storage.objects;

CREATE POLICY "subcont_storage_select" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'subcont-evidence');

CREATE POLICY "subcont_storage_insert" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'subcont-evidence');

