// api/delete-user.js — Vercel Serverless Function
// Menghapus akun Supabase Auth + row app_users.
// Memerlukan env var: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers['authorization']?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: token tidak ditemukan.' });

    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
    if (caller.user_metadata?.role !== 'admin') {
        return res.status(403).json({ error: 'Hanya admin yang dapat menghapus user.' });
    }

    // Cegah admin menghapus dirinya sendiri
    const { app_user_id } = req.body ?? {};
    if (!app_user_id) return res.status(400).json({ error: 'app_user_id wajib diisi.' });

    // ── Ambil data user dari app_users ────────────────────────
    const { data: appUser, error: lookupErr } = await supabaseAdmin
        .from('app_users')
        .select('auth_user_id, nik, display_name')
        .eq('id', app_user_id)
        .single();
    if (lookupErr || !appUser) return res.status(404).json({ error: 'User tidak ditemukan.' });

    // Cegah admin menghapus dirinya sendiri
    if (appUser.auth_user_id && appUser.auth_user_id === caller.id) {
        return res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri.' });
    }

    let authUserId = appUser.auth_user_id;

    // Fallback: cari auth user berdasarkan email
    if (!authUserId) {
        const email = `${appUser.nik.toLowerCase()}@eqms.internal`;
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (!listErr && users) {
            const found = users.find(u => u.email === email);
            if (found) authUserId = found.id;
        }
    }

    // ── Hapus dari Supabase Auth ──────────────────────────────
    if (authUserId) {
        const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (deleteAuthErr) return res.status(400).json({ error: deleteAuthErr.message });
        // Jika tidak ada cascade, hapus app_users secara eksplisit
        await supabaseAdmin.from('app_users').delete().eq('id', app_user_id);
    } else {
        // User tidak punya akun auth — hapus hanya dari app_users
        const { error: dbErr } = await supabaseAdmin.from('app_users').delete().eq('id', app_user_id);
        if (dbErr) return res.status(400).json({ error: dbErr.message });
    }

    return res.status(200).json({ success: true, message: `User "${appUser.display_name}" berhasil dihapus.` });
};
