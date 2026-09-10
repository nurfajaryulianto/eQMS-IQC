-- ============================================================
-- supabase-fix-pass-all.sql
-- PERBAIKAN FITUR PASS ALL & SINKRONISASI KOLOM STATUS 4 TAHAP
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. TAMBAH KOLOM STATUS YANG BELUM ADA PADA material_master_data
ALTER TABLE public.material_master_data ADD COLUMN IF NOT EXISTS raw_done BOOLEAN DEFAULT FALSE;
ALTER TABLE public.material_master_data ADD COLUMN IF NOT EXISTS laminating_done BOOLEAN DEFAULT FALSE;
ALTER TABLE public.material_master_data ADD COLUMN IF NOT EXISTS bonding_done BOOLEAN DEFAULT FALSE;
ALTER TABLE public.material_master_data ADD COLUMN IF NOT EXISTS rolling_done BOOLEAN DEFAULT FALSE;
ALTER TABLE public.material_master_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- TAMBAH KOLOM TRACEABILITY DUAL-ACTOR PADA material_inspections
ALTER TABLE public.material_inspections ADD COLUMN IF NOT EXISTS executed_by VARCHAR(255);
ALTER TABLE public.material_inspections ADD COLUMN IF NOT EXISTS pass_reason TEXT;

-- 2. HAPUS FUNGSI OVERLOAD LAMA fn_pass_all_materials YANG ERROR
DROP FUNCTION IF EXISTS public.fn_pass_all_materials(bigint[], text, text);
DROP FUNCTION IF EXISTS public.fn_pass_all_materials(bigint[], text, text, text);
DROP FUNCTION IF EXISTS public.fn_pass_all_materials(bigint[], character varying, character varying, text);
DROP FUNCTION IF EXISTS public.fn_pass_all_materials(bigint[], character varying, character varying);

-- 3. BUAT FUNGSI fn_pass_all_materials YANG BARU & VALID
CREATE OR REPLACE FUNCTION public.fn_pass_all_materials(
  target_ids  BIGINT[],
  admin_nik   TEXT,
  admin_name  TEXT,
  p_reason    TEXT DEFAULT ''
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
  v_eff_reason TEXT;
BEGIN
  v_eff_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Sertifikat CoA / Lab Test Vendor Valid');

  FOREACH v_id IN ARRAY target_ids LOOP
    SELECT * INTO v_row FROM public.material_master_data WHERE id = v_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_row.status = 'done' THEN CONTINUE; END IF;

    -- Reset inspector variables
    v_insp_nik := NULL;
    v_insp_name := NULL;
    v_mat_type := UPPER(TRIM(COALESCE(v_row.material_type, '')));

    -- 1. Match material_assignments berdasarkan material_type
    IF v_mat_type <> '' THEN
      SELECT inspector_nik, inspector_name INTO v_insp_nik, v_insp_name
      FROM public.material_assignments
      WHERE UPPER(TRIM(material_type)) = v_mat_type
        AND inspector_nik IS NOT NULL AND TRIM(inspector_nik) <> ''
      LIMIT 1;
    END IF;

    -- 2. Fallback: match material_assignments berdasarkan kata kunci material_name
    IF (v_insp_nik IS NULL OR v_insp_nik = '') AND v_row.material_name IS NOT NULL THEN
      SELECT inspector_nik, inspector_name INTO v_insp_nik, v_insp_name
      FROM public.material_assignments
      WHERE ((UPPER(TRIM(material_type)) IN ('LEATHER', 'LTH') AND UPPER(v_row.material_name) LIKE '%LTH%')
         OR (UPPER(TRIM(material_type)) IN ('TEXTILE', 'TXT') AND UPPER(v_row.material_name) LIKE '%TXT%')
         OR (UPPER(TRIM(material_type)) IN ('SYNTHETIC', 'SYN') AND (UPPER(v_row.material_name) LIKE '%SYN%' OR UPPER(v_row.material_name) LIKE '%PU%')))
        AND inspector_nik IS NOT NULL AND TRIM(inspector_nik) <> ''
      LIMIT 1;
    END IF;

    -- 3. Fallback: lookup dari material_users berdasarkan material_assignment
    IF (v_insp_nik IS NULL OR v_insp_nik = '') AND v_mat_type <> '' THEN
      SELECT nik, display_name INTO v_insp_nik, v_insp_name
      FROM public.material_users
      WHERE LOWER(role) = 'inspector'
        AND (UPPER(material_assignment) LIKE '%' || v_mat_type || '%' OR UPPER(material_assignment) = 'ALL')
      ORDER BY id ASC
      LIMIT 1;
    END IF;

    -- 4. Fallback: match kata kunci material_name ke material_users
    IF (v_insp_nik IS NULL OR v_insp_nik = '') AND v_row.material_name IS NOT NULL THEN
      IF UPPER(v_row.material_name) LIKE '%TXT%' OR UPPER(v_row.material_name) LIKE '%MESH%' THEN
        SELECT nik, display_name INTO v_insp_nik, v_insp_name FROM public.material_users WHERE LOWER(role) = 'inspector' AND UPPER(material_assignment) LIKE '%TEXTILE%' ORDER BY id ASC LIMIT 1;
      ELSIF UPPER(v_row.material_name) LIKE '%LTH%' OR UPPER(v_row.material_name) LIKE '%LEATHER%' THEN
        SELECT nik, display_name INTO v_insp_nik, v_insp_name FROM public.material_users WHERE LOWER(role) = 'inspector' AND UPPER(material_assignment) LIKE '%LEATHER%' ORDER BY id ASC LIMIT 1;
      ELSIF UPPER(v_row.material_name) LIKE '%SYN%' OR UPPER(v_row.material_name) LIKE '%PU%' THEN
        SELECT nik, display_name INTO v_insp_nik, v_insp_name FROM public.material_users WHERE LOWER(role) = 'inspector' AND UPPER(material_assignment) LIKE '%SYNTHETIC%' ORDER BY id ASC LIMIT 1;
      END IF;
    END IF;

    -- 5. Fallback: ambil sembarang inspector aktif pertama
    IF v_insp_nik IS NULL OR v_insp_nik = '' THEN
      SELECT nik, display_name INTO v_insp_nik, v_insp_name
      FROM public.material_users
      WHERE LOWER(role) = 'inspector'
      ORDER BY id ASC
      LIMIT 1;
    END IF;

    -- 6. Final fallback: gunakan identitas admin jika belum ada inspector
    IF v_insp_nik IS NULL OR v_insp_nik = '' THEN
      v_insp_nik := admin_nik;
      v_insp_name := admin_name;
    END IF;

    v_insp_id := 'PASS-' || v_id::TEXT || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT || '-' || (FLOOR(RANDOM()*1000)::INT)::TEXT;

    INSERT INTO public.material_inspections (
      inspection_id, master_data_id, po_no, material_name,
      qty_receive, ok, no_qty,
      receive_date, status, inspection_date,
      inspector_nik, inspection_type, input_type,
      executed_by, pass_reason, created_at
    ) VALUES (
      v_insp_id, v_id, v_row.po_number, v_row.material_name,
      v_row.batch_size, v_row.batch_size, 0,
      v_row.receive_date, 'done', NOW(),
      v_insp_nik, COALESCE(NULLIF(v_row.material_type, ''), 'Raw Material'), 'batch_pass_all',
      admin_name, v_eff_reason, NOW()
    );

    -- Update status master data dan tandai seluruh 4 flag inspeksi selesai
    UPDATE public.material_master_data
    SET status = 'done',
        raw_done = TRUE,
        rolling_done = TRUE,
        laminating_done = TRUE,
        bonding_done = TRUE,
        updated_at = NOW()
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

GRANT EXECUTE ON FUNCTION public.fn_pass_all_materials(BIGINT[], TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
