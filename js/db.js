// ============================================================
// db.js — Supabase Data Service untuk Admin CRUD
// Mengelola: defects, app_users, vendors, components
// ============================================================

import { createClient }  from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { supabase as authClient } from './auth.js';

const SUPABASE_URL      = 'https://mymzszufrwmpkpmmlnnc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bXpzenVmcndtcGtwbW1sbm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzgwODksImV4cCI6MjA5Mjg1NDA4OX0.gGu3xJ0yjUmLncz277gGSP8qiV8TiBrlJvg3C-t6ZJw';

// Gunakan client auth yang sudah ada (production), atau buat baru (test mode)
const db = authClient ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'eqms_auth_v1',
    },
});

// ─── Helper internal ─────────────────────────────────────────

function unwrap({ data, error }, ctx) {
    if (error) throw new Error(`[db.${ctx}] ${error.message}`);
    return data;
}

// ─── DEFECTS ─────────────────────────────────────────────────

export async function dbGetDefects() {
    return unwrap(await db.from('defects').select('*').order('id'), 'getDefects');
}

export async function dbInsertDefect({ name, label, category }) {
    return unwrap(
        await db.from('defects').insert({ name, label, category }).select().single(),
        'insertDefect'
    );
}

export async function dbUpdateDefect(id, { name, label, category }) {
    return unwrap(
        await db.from('defects').update({ name, label, category }).eq('id', id).select().single(),
        'updateDefect'
    );
}

export async function dbDeleteDefect(id) {
    unwrap(await db.from('defects').delete().eq('id', id), 'deleteDefect');
}

// ─── APP USERS ───────────────────────────────────────────────

export async function dbGetAppUsers() {
    return unwrap(await db.from('app_users').select('*').order('id'), 'getAppUsers');
}

export async function dbInsertAppUser({ nik, display_name, role }) {
    return unwrap(
        await db.from('app_users').insert({ nik, display_name, role }).select().single(),
        'insertAppUser'
    );
}

export async function dbUpdateAppUser(id, { nik, display_name, role }) {
    return unwrap(
        await db.from('app_users').update({ nik, display_name, role }).eq('id', id).select().single(),
        'updateAppUser'
    );
}

export async function dbDeleteAppUser(id) {
    unwrap(await db.from('app_users').delete().eq('id', id), 'deleteAppUser');
}

// ─── VENDORS ─────────────────────────────────────────────────

export async function dbGetVendors() {
    return unwrap(await db.from('vendors').select('*').order('id'), 'getVendors');
}

export async function dbInsertVendor({ name }) {
    return unwrap(
        await db.from('vendors').insert({ name }).select().single(),
        'insertVendor'
    );
}

export async function dbUpdateVendor(id, { name }) {
    return unwrap(
        await db.from('vendors').update({ name }).eq('id', id).select().single(),
        'updateVendor'
    );
}

export async function dbDeleteVendor(id) {
    unwrap(await db.from('vendors').delete().eq('id', id), 'deleteVendor');
}

// ─── COMPONENTS ──────────────────────────────────────────────

export async function dbGetComponents() {
    return unwrap(await db.from('components').select('*').order('id'), 'getComponents');
}

export async function dbInsertComponent({ name, vendor_id }) {
    return unwrap(
        await db.from('components').insert({ name, vendor_id: vendor_id || null }).select().single(),
        'insertComponent'
    );
}

export async function dbUpdateComponent(id, { name, vendor_id }) {
    return unwrap(
        await db.from('components').update({ name, vendor_id: vendor_id || null }).eq('id', id).select().single(),
        'updateComponent'
    );
}

export async function dbDeleteComponent(id) {
    unwrap(await db.from('components').delete().eq('id', id), 'deleteComponent');
}

// ─── PROCESSES ──────────────────────────────────────────────

export async function dbGetProcesses() {
    return unwrap(await db.from('processes').select('*').order('id'), 'getProcesses');
}

export async function dbInsertProcess({ name, component_id }) {
    return unwrap(
        await db.from('processes').insert({ name, component_id: component_id || null }).select().single(),
        'insertProcess'
    );
}

export async function dbUpdateProcess(id, { name, component_id }) {
    return unwrap(
        await db.from('processes').update({ name, component_id: component_id || null }).eq('id', id).select().single(),
        'updateProcess'
    );
}

export async function dbDeleteProcess(id) {
    unwrap(await db.from('processes').delete().eq('id', id), 'deleteProcess');
}
