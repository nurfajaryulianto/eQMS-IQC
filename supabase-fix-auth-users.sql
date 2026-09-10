-- ============================================================
-- supabase-fix-auth-users.sql (REVISED v2)
-- PERBAIKAN ERROR "Database error querying schema" PADA SUPABASE AUTH
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. UPDATE NULL TOKEN COLUMNS PADA auth.users
-- CATATAN: 
-- - 'confirmed_at' adalah GENERATED COLUMN (dihitung otomatis dari email_confirmed_at).
-- - 'phone' memiliki UNIQUE constraint (users_phone_key), jadi TIDAK boleh diisi string kosong ('') untuk banyak user.
UPDATE auth.users
SET 
    confirmation_token          = COALESCE(confirmation_token, ''),
    recovery_token              = COALESCE(recovery_token, ''),
    email_change_token_new      = COALESCE(email_change_token_new, ''),
    email_change                = COALESCE(email_change, ''),
    email_change_token_current  = COALESCE(email_change_token_current, ''),
    reauthentication_token      = COALESCE(reauthentication_token, ''),
    email_confirmed_at          = COALESCE(email_confirmed_at, created_at, NOW()),
    is_sso_user                 = COALESCE(is_sso_user, false),
    is_anonymous                = COALESCE(is_anonymous, false)
WHERE 
    confirmation_token IS NULL
    OR recovery_token IS NULL
    OR email_change_token_new IS NULL
    OR email_change IS NULL
    OR email_change_token_current IS NULL
    OR reauthentication_token IS NULL
    OR email_confirmed_at IS NULL;


-- 2. SINKRONISASI auth.identities
-- Kolom 'id' pada auth.identities adalah UUID, 'provider_id' adalah TEXT
UPDATE auth.identities
SET 
    provider_id = user_id::text,
    identity_data = jsonb_build_object(
        'sub', user_id::text,
        'email', LOWER(COALESCE(identity_data->>'email', '')),
        'email_verified', true
    ),
    updated_at = NOW()
WHERE provider = 'email' AND provider_id != user_id::text;

-- Insert identitas yang belum ada jika ada user yang tertinggal
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', LOWER(u.email),
        'email_verified', true
    ),
    'email',
    u.id::text,
    NOW(),
    NOW(),
    NOW()
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities i 
    WHERE i.provider = 'email' AND i.user_id = u.id
);


-- 3. PERBAIKAN FUNGSI public.create_supabase_user AGAR TIDAK LAGI MENGHASILKAN NULL
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
    v_pw TEXT;
    v_encrypted_pw TEXT;
BEGIN
    v_email := LOWER(TRIM(p_nik)) || '@eqms.internal';

    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- Jika user sudah ada, hanya perbarui password jika parameter password diisi
        IF p_password IS NOT NULL AND TRIM(p_password) != '' THEN
            v_encrypted_pw := crypt(TRIM(p_password), gen_salt('bf', 10));
            UPDATE auth.users
            SET encrypted_password = v_encrypted_pw
            WHERE id = v_user_id;
        END IF;

        UPDATE auth.users
        SET confirmation_token         = COALESCE(confirmation_token, ''),
            recovery_token             = COALESCE(recovery_token, ''),
            email_change_token_new     = COALESCE(email_change_token_new, ''),
            email_change               = COALESCE(email_change, ''),
            email_change_token_current = COALESCE(email_change_token_current, ''),
            reauthentication_token     = COALESCE(reauthentication_token, ''),
            email_confirmed_at         = COALESCE(email_confirmed_at, NOW()),
            raw_user_meta_data         = jsonb_build_object(
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
        v_user_id := gen_random_uuid();
        v_pw := COALESCE(NULLIF(TRIM(p_password), ''), 'user123');
        v_encrypted_pw := crypt(v_pw, gen_salt('bf', 10));

        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
            email_change_token_current,
            reauthentication_token,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud,
            is_sso_user,
            is_anonymous
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000',
            v_email,
            v_encrypted_pw,
            NOW(),
            '',
            '',
            '',
            '',
            '',
            '',
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
            'authenticated',
            false,
            false
        );
    END IF;

    -- Update identity
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
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
            'email',
            v_user_id::text,
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

    -- Update app_users
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

    -- Update material_users
    BEGIN
        INSERT INTO public.material_users (nik, display_name, role, material_assignment, auth_user_id)
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

GRANT EXECUTE ON FUNCTION public.create_supabase_user TO anon, authenticated, service_role;
