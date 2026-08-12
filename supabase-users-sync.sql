-- ============================================================
-- eQMS — SQL Migrasi & Sync User dari Google Sheets ke Supabase
-- Berdasarkan Data Tabel Lengkap (20 User)
-- Jalankan skrip ini di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0. ALTER CONSTRAINT TABEL APP_USERS (Agar Menerima Role manager & inspector)
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'supervisor', 'manager', 'inspector', 'auditor'));
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS material_assignment TEXT DEFAULT '';


-- 1. UTILITY FUNCTION: Otomatis Daftarkan User ke auth.users & public.app_users
CREATE OR REPLACE FUNCTION public.create_supabase_user(
    p_nik TEXT,
    p_name TEXT,
    p_role TEXT,
    p_password TEXT DEFAULT 'user123',
    p_material_assignment TEXT DEFAULT ''
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_encrypted_pw TEXT;
BEGIN
    v_email := LOWER(TRIM(p_nik)) || '@eqms.internal';
    v_encrypted_pw := crypt(p_password, gen_salt('bf', 10));

    -- A. Cek apakah user sudah ada berdasarkan email di auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- Update user yang sudah ada (termasuk reset password)
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = jsonb_build_object(
                'nik', p_nik,
                'name', p_name,
                'display_name', p_name,
                'role', LOWER(p_role),
                'module', 'material',
                'material_assignment', p_material_assignment
            ),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- Buat user baru jika belum ada
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            v_email,
            v_encrypted_pw,
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'nik', p_nik,
                'name', p_name,
                'display_name', p_name,
                'role', LOWER(p_role),
                'module', 'material',
                'material_assignment', p_material_assignment
            ),
            NOW(),
            NOW(),
            'authenticated',
            'authenticated'
        );
    END IF;

    -- B. Selalu Wajib Insert / Update auth.identities (Mencegah Supabase GoTrue 500 Error)
    -- SUPER PENTING: provider_id UNTUK EMAIL HARUS BERUPA UUID STRING (v_user_id::text), BUKAN EMAIL!
    BEGIN
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(), -- ID identity biarkan unik
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
            'email',
            v_user_id::text, -- <--- ROOT CAUSE FIX: HARUS UUID STRING!
            NOW(),
            NOW(),
            NOW()
        )
        ON CONFLICT (provider, provider_id) DO UPDATE SET
            identity_data = EXCLUDED.identity_data,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- C. Insert/Update ke public.app_users
    BEGIN
        INSERT INTO public.app_users (nik, display_name, role, material_assignment, auth_user_id)
        VALUES (p_nik, p_name, LOWER(p_role), p_material_assignment, v_user_id)
        ON CONFLICT (nik) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            role = EXCLUDED.role,
            material_assignment = EXCLUDED.material_assignment,
            auth_user_id = EXCLUDED.auth_user_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. SEED DATA DARI TABEL SPREADSHEET (20 USER SINKRON)
-- ============================================================

SELECT public.create_supabase_user('admin',      'ADMIN IQC MATERIAL',   'admin',      'admin123', '');
SELECT public.create_supabase_user('291221',     'AHMAD TAUFIQQUROHMAN', 'supervisor', 'user123',  '');
SELECT public.create_supabase_user('7020718',    'ZISKA MUKTIANSAH',     'manager',    'user123',  '');
SELECT public.create_supabase_user('331221',     'KARIMA HAQ',           'supervisor', 'user123',  '');
SELECT public.create_supabase_user('4590424',    'BAYU AJI HERLAMBANG',   'inspector',  'user123',  'LAMINATING & RAW MATERIAL, TEXTILE, SYNTHETIC');
SELECT public.create_supabase_user('32003',      'NURDIN PURNAMA',       'supervisor', 'user123',  '');
SELECT public.create_supabase_user('superadmin', 'superadmin',           'admin',      'admin123', '');
SELECT public.create_supabase_user('31975',      'USMAN',                'inspector',  'user1234', 'TEXTILE');
SELECT public.create_supabase_user('4450424',    'SURYA FIQRI GHAZALI',  'inspector',  'admin123', 'SYNTHETIC');
SELECT public.create_supabase_user('4390424',    'RIZKI ALAN SETIA',     'inspector',  'user123',  'LAMINATING TEXTILE, SYNTHETIC');
SELECT public.create_supabase_user('108725',     'SUKRI QOZALI',         'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('107477',     'MASYUDI EKO P',        'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('107221',     'EDI SUANDA',           'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('31481',      'SANUSI',               'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('5330524',    'IQBAL YASIN',          'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('108906',     'SENO PRASETYA',        'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('31592',      'BRAHMA DWI PUTRO',     'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('108814',     'FAJAR MULTIKADER',     'inspector',  'user123',  'LEATHER');
SELECT public.create_supabase_user('4510424',    'AGILE NUGROHO',        'inspector',  'user123',  'LAMINATING & RAW MATERIAL, TEXTILE, SYNTHETIC');
SELECT public.create_supabase_user('2960523',    'WISMO JOKO P',         'inspector',  'user123',  'LAMINATING TEST LAB TEXTILE, SYNTHETIC');

-- PERBAIKAN TOTAL IDENTITIES: Rebuild seluruh tabel identities agar 100% cocok dengan auth.users
DELETE FROM auth.identities WHERE provider = 'email';

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', u.id::text, NOW(), NOW(), NOW()
FROM auth.users u;

-- ============================================================
-- HAK AKSES PERMISSION FUNCTION
-- ============================================================
GRANT EXECUTE ON FUNCTION public.create_supabase_user TO anon, authenticated, service_role;
