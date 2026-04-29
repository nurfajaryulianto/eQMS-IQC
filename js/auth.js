// =====================================================
// auth.js — Supabase Authentication Module
// =====================================================
//
// CATATAN KEAMANAN:
// - Anon key ini AMAN ada di frontend karena hanya bisa
//   melakukan operasi yang diizinkan oleh RLS (Row Level Security).
// - WAJIB: Aktifkan RLS di semua tabel Supabase Anda.
//   https://supabase.com/docs/guides/auth/row-level-security
//
// SETUP AWAL (lakukan sekali di Supabase Dashboard):
// 1. Ganti SUPABASE_URL dan SUPABASE_ANON_KEY di bawah.
// 2. Buat user via Supabase Auth > Users > Invite User:
//    - Email: NIK@eqms.internal (contoh: 12345@eqms.internal)
//    - Password: set manual
//    - User Metadata: { "display_name": "Nama Auditor", "nik": "12345", "role": "auditor" }
// 3. Aktifkan RLS di semua tabel Database Supabase.
// =====================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ============================================================
// [UI TESTING MODE] — Satu sumber kebenaran untuk semua file.
// - true  → gunakan mock session (localStorage), skip Supabase
// - false → gunakan Supabase auth sungguhan
// ============================================================
export const UI_TEST_MODE = false;

// Role yang tersedia di aplikasi
export const ROLES = {
    AUDITOR: 'auditor',
    SUPERVISOR: 'supervisor',
    ADMIN: 'admin',
};

const SUPABASE_URL = 'https://mymzszufrwmpkpmmlnnc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bXpzenVmcndtcGtwbW1sbm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzgwODksImV4cCI6MjA5Mjg1NDA4OX0.gGu3xJ0yjUmLncz277gGSP8qiV8TiBrlJvg3C-t6ZJw';

// Singleton Supabase client — hanya dibuat saat production (UI_TEST_MODE = false).
// Saat test mode, client ini null dan tidak pernah digunakan.
export const supabase = UI_TEST_MODE ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,       // Simpan sesi di localStorage (JWT terenkripsi)
        autoRefreshToken: true,     // Auto-refresh token sebelum kadaluarsa
        detectSessionInUrl: false,  // Nonaktifkan OAuth callback detection (tidak digunakan)
        storageKey: 'eqms_auth_v1', // Namespace khusus untuk avoid collision
    }
});

const LOGIN_PAGE = '/login.html';

// =====================================================
// MOCK SESSION (hanya aktif saat UI_TEST_MODE = true)
// Disimpan di localStorage agar persist lintas tab & reload,
// mensimulasikan perilaku sesi nyata.
// Sesi otomatis kadaluarsa setelah SESSION_DURATION_MS.
// =====================================================
const MOCK_SESSION_KEY = 'eqms_test_session_v1';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 jam

/** Simpan mock session setelah login berhasil (test mode). */
export function setMockSession(userData) {
    const payload = {
        ...userData,
        expiresAt: Date.now() + SESSION_DURATION_MS,
    };
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(payload));
}

/** Cek apakah mock session ada DAN belum kadaluarsa. */
export function hasMockSession() {
    try {
        const session = getMockSession();
        return session !== null;
    } catch {
        return false;
    }
}

/** Baca data mock session. Hapus otomatis jika sudah kadaluarsa. */
function getMockSession() {
    try {
        const raw = localStorage.getItem(MOCK_SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.expiresAt && Date.now() > data.expiresAt) {
            // Sesi kadaluarsa — hapus dan paksa login ulang
            localStorage.removeItem(MOCK_SESSION_KEY);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

/** Hapus mock session saat logout. */
function clearMockSession() {
    localStorage.removeItem(MOCK_SESSION_KEY);
}

// =====================================================
// AUTH FUNCTIONS
// =====================================================

/**
 * Guard: Periksa sesi aktif. Jika tidak ada → redirect ke login.html.
 * Bekerja di TEST MODE (mock session) maupun PRODUCTION (Supabase JWT).
 * Selalu aktif — tidak peduli nilai UI_TEST_MODE.
 *
 * @returns {Promise<object|null>} session object, atau null jika redirect
 */
export async function requireAuth() {
    if (UI_TEST_MODE) {
        const mockSession = getMockSession();
        if (!mockSession) {
            // Perangkat baru / belum login → redirect ke login
            window.location.replace(LOGIN_PAGE);
            return null;
        }
        return { mock: true, user: mockSession };
    }

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            window.location.replace(LOGIN_PAGE);
            return null;
        }
        return session;
    } catch {
        window.location.replace(LOGIN_PAGE);
        return null;
    }
}

/**
 * Guard: Periksa sesi aktif DAN role user.
 * Jika tidak ada sesi → redirect ke login.html.
 * Jika role tidak diizinkan → redirect ke unauthorized.html.
 *
 * @param {string[]} allowedRoles - Role yang diizinkan, e.g. [ROLES.SUPERVISOR, ROLES.ADMIN]
 * @returns {Promise<object|null>}
 */
export async function requireRole(allowedRoles) {
    const session = await requireAuth();
    if (!session) return null; // requireAuth sudah redirect ke login

    const user = await getUser();
    const role = user?.user_metadata?.role || ROLES.AUDITOR;

    if (!allowedRoles.includes(role)) {
        window.location.replace('/unauthorized.html');
        return null;
    }

    return session;
}

/**
 * Mendapatkan data user yang sedang login.
 * Test mode: baca dari mock session.
 * Production: verifikasi server-side via Supabase.
 *
 * @returns {Promise<object|null>}
 */
export async function getUser() {
    if (UI_TEST_MODE) {
        const mockSession = getMockSession();
        if (!mockSession) return null;
        return {
            user_metadata: {
                display_name: mockSession.display_name,
                nik: mockSession.nik,
                role: mockSession.role || 'auditor',
            }
        };
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) return null;
        return user;
    } catch {
        return null;
    }
}

/**
 * Mendapatkan role user yang sedang login.
 * Shorthand untuk getUser() → user_metadata.role.
 *
 * @returns {Promise<string>} role string, default 'auditor'
 */
export async function getUserRole() {
    const user = await getUser();
    return user?.user_metadata?.role || ROLES.AUDITOR;
}

/**
 * Sign out user dan redirect ke login.html.
 * Membersihkan sesi (mock atau Supabase).
 */
export async function signOut() {
    if (UI_TEST_MODE) {
        clearMockSession();
        window.location.replace(LOGIN_PAGE);
        return;
    }
    await supabase.auth.signOut();
    window.location.replace(LOGIN_PAGE);
}

/**
 * Konversi NIK ke format email internal Supabase.
 * Hanya digunakan di login.js — tidak terekspos ke user.
 *
 * @param {string} nik
 * @returns {string} email dalam format NIK@eqms.internal
 */
export function nikToEmail(nik) {
    // Sanitasi: hanya izinkan alfanumerik, max 20 karakter
    const sanitized = String(nik).trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    return `${sanitized}@eqms.internal`;
}

