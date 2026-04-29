// =====================================================
// login.js — Login Page Logic
// =====================================================

import { supabase, nikToEmail, UI_TEST_MODE, setMockSession, hasMockSession, getUserRole, ROLES } from './auth.js';

// =====================================================
// RATE LIMITING (Client-side)
// Max 5 percobaan gagal → lockout 5 menit
// Menggunakan sessionStorage (dibersihkan saat tab ditutup)
// =====================================================
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 menit
const RATE_KEY = 'eqms_login_rl';

function getRateData() {
    try {
        const raw = sessionStorage.getItem(RATE_KEY);
        if (!raw) return { attempts: 0, lockedUntil: null };
        return JSON.parse(raw);
    } catch {
        return { attempts: 0, lockedUntil: null };
    }
}

function saveRateData(data) {
    sessionStorage.setItem(RATE_KEY, JSON.stringify(data));
}

function isLockedOut() {
    const data = getRateData();
    if (!data.lockedUntil) return false;
    if (Date.now() < data.lockedUntil) return true;
    // Lockout sudah selesai → reset
    saveRateData({ attempts: 0, lockedUntil: null });
    return false;
}

function recordFailedAttempt() {
    const data = getRateData();
    data.attempts = (data.attempts || 0) + 1;
    if (data.attempts >= MAX_ATTEMPTS) {
        data.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    saveRateData(data);
}

function resetAttempts() {
    saveRateData({ attempts: 0, lockedUntil: null });
}

function getRemainingMs() {
    const data = getRateData();
    if (!data.lockedUntil) return 0;
    return Math.max(0, data.lockedUntil - Date.now());
}

function getAttemptsLeft() {
    const data = getRateData();
    return Math.max(0, MAX_ATTEMPTS - (data.attempts || 0));
}

// =====================================================
// UI HELPERS
// =====================================================
function showError(message) {
    const el = document.getElementById('login-error');
    const textEl = document.getElementById('login-error-text');
    if (textEl) textEl.textContent = message;
    el.classList.remove('hidden');
}

function hideError() {
    document.getElementById('login-error').classList.add('hidden');
}

function setLoading(loading) {
    const btn = document.getElementById('login-btn');
    const btnText = document.getElementById('login-btn-text');
    const spinner = document.getElementById('login-btn-spinner');
    btn.disabled = loading;
    btnText.classList.toggle('hidden', loading);
    spinner.classList.toggle('hidden', !loading);
}

let lockoutInterval = null;

function showLockout() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('login-lockout').classList.remove('hidden');
    hideError();

    if (lockoutInterval) clearInterval(lockoutInterval);

    function updateTimer() {
        const remaining = getRemainingMs();
        if (remaining <= 0) {
            clearInterval(lockoutInterval);
            lockoutInterval = null;
            document.getElementById('login-form').style.display = '';
            document.getElementById('login-lockout').classList.add('hidden');
            return;
        }
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        document.getElementById('lockout-timer').textContent =
            `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    updateTimer();
    lockoutInterval = setInterval(updateTimer, 1000);
}

// =====================================================
// REDIRECT JIKA SUDAH LOGIN
// =====================================================
async function redirectIfLoggedIn() {
    if (UI_TEST_MODE) {
        if (hasMockSession()) {
            // Baca role dari mock session untuk arahkan ke halaman yang tepat
            window.location.replace('/index.html');
        }
        return;
    }
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            window.location.replace('/index.html');
        }
    } catch {
        // Lanjutkan ke halaman login jika ada error
    }
}

// =====================================================
// VALIDASI INPUT
// =====================================================
function validateInputs(nik, password) {
    if (!nik || !password) {
        showError('NIK dan password wajib diisi.');
        return false;
    }
    // Hanya izinkan karakter alfanumerik, 1-20 karakter
    if (!/^[a-zA-Z0-9]{1,20}$/.test(nik)) {
        showError('NIK hanya boleh mengandung angka dan huruf (maks. 20 karakter).');
        return false;
    }
    if (password.length < 6) {
        showError('Password minimal 6 karakter.');
        return false;
    }
    return true;
}

// =====================================================
// LOGIN HANDLER
// =====================================================
async function handleLogin(event) {
    event.preventDefault();
    hideError();

    if (isLockedOut()) {
        showLockout();
        return;
    }

    const nik = document.getElementById('nik-input').value.trim();
    const password = document.getElementById('password-input').value;

    if (!validateInputs(nik, password)) return;

    setLoading(true);

    try {
        // ── UI TESTING MODE: bypass Supabase, buat mock session ──
        if (UI_TEST_MODE) {
            resetAttempts();

            // Look up user in admin-managed list first
            let storedUsers = [];
            try { storedUsers = JSON.parse(localStorage.getItem('eqms_users_v1') || '[]'); } catch {}
            const storedUser = storedUsers.find(u => u.nik.toLowerCase() === nik.toLowerCase());

            let testRole, displayName;
            if (storedUser) {
                testRole = storedUser.role;
                displayName = storedUser.display_name;
            } else {
                // Fallback: derive role from NIK prefix
                if (nik.toLowerCase() === 'admin' || nik.toLowerCase().startsWith('adm')) {
                    testRole = ROLES.ADMIN;
                } else if (nik.toLowerCase().startsWith('spv')) {
                    testRole = ROLES.SUPERVISOR;
                } else {
                    testRole = ROLES.AUDITOR;
                }
                displayName = nik;
            }

            setMockSession({ display_name: displayName, nik, role: testRole });

            window.location.replace('/index.html');
            return;
        }
        // ── Akhir UI TESTING MODE ──

        const email = nikToEmail(nik);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            recordFailedAttempt();

            if (isLockedOut()) {
                showLockout();
            } else {
                const left = getAttemptsLeft();
                showError(
                    left > 0
                        ? `NIK atau password salah. Sisa percobaan: ${left}.`
                        : 'NIK atau password salah.'
                );
            }
            return;
        }

        // Login berhasil → bersihkan rate limit dan redirect berdasarkan role
        resetAttempts();
        window.location.replace('/index.html');

    } catch {
        showError('Terjadi kesalahan koneksi. Periksa jaringan dan coba lagi.');
    } finally {
        setLoading(false);
    }
}

// =====================================================
// TOGGLE PASSWORD VISIBILITY
// =====================================================
function setupTogglePassword() {
    document.getElementById('toggle-password').addEventListener('click', () => {
        const input = document.getElementById('password-input');
        const icon = document.querySelector('#toggle-password .material-symbols-outlined');
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.textContent = 'visibility_off';
        } else {
            input.type = 'password';
            if (icon) icon.textContent = 'visibility';
        }
    });
}

// =====================================================
// INIT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Redirect jika sudah login
    await redirectIfLoggedIn();

    // Tampilkan lockout jika masih aktif
    if (isLockedOut()) {
        showLockout();
    }

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    setupTogglePassword();

    // Focus ke input NIK saat halaman load
    document.getElementById('nik-input').focus();
});
