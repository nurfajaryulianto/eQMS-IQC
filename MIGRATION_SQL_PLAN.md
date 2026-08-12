# Rencana Implementasi Migrasi Database eQMS IQC Material ke Supabase PostgreSQL

Dokumen rencana teknis lengkap untuk mengalihkan backend dan penyimpanan data modul **eQMS IQC Material** dari **Google Sheets + Google Apps Script (GAS)** ke **Supabase PostgreSQL Database**.

Migrasi ini memangkas waktu *load data* dari 3–5 detik menjadi **~20–100 ms**, menyediakan *server-side pagination*, *relational indexing*, dan menghilangkan risiko *lock timeout* serta data duplikat secara permanen.

---

## 1. Perubahan Alur Kerja (Trade-Offs & Catatan Penting)

> [!IMPORTANT]
> **Penghentian Direct Edit di Google Sheets**
> Setelah migrasi ke Supabase SQL, pengguna tidak lagi melakukan edit baris langsung di tab Google Sheets. Seluruh input, edit, dan klaim material dilakukan 100% melalui Web App UI atau Supabase Studio.

> [!TIP]
> **Ekspor Excel Tetap Tersedia**
> Untuk kebutuhan laporan ke manajemen dalam format Excel (`.xlsx` / `.csv`), akan ditambahkan fitur *Export to Excel* berbasis *client-side* (menggunakan library `SheetJS` / `xlsx`) di menu Admin dan Dashboard.

---

## 2. Rincian Perubahan & File yang Dibuat/Diubah

### Component 1: Database Schema & Migration (`supabase-material-db.sql`)

Membuat skema tabel PostgreSQL terstruktur khusus modul Material dengan relasi, indeks, dan *Constraint* unik.

#### `supabase-material-db.sql`
- Tabel **`material_master_data`**:
  - Kolom: `id` (BIGSERIAL PK), `po_number` (VARCHAR), `material_name` (TEXT), `material_description` (TEXT), `uom` (VARCHAR), `supplier_name` (TEXT), `po_area` (VARCHAR), `batch_size` (NUMERIC), `product_code` (VARCHAR), `model_name` (VARCHAR), `bucket` (VARCHAR), `receive_date` (DATE), `shipment_number` (VARCHAR), `no_bc` (VARCHAR), `bc_type` (VARCHAR), `receive_number` (VARCHAR), `material_type` (VARCHAR), `status` (VARCHAR: 'pending'|'in-progress'|'done'), `uploaded_by` (VARCHAR), `created_at` (TIMESTAMPTZ).
  - Indeks B-Tree: `idx_md_po_number`, `idx_md_status`, `idx_md_receive_date`, `idx_md_material_type`.
  - Composite Unique Constraint: `(LOWER(po_number), receive_date, LOWER(material_name), LOWER(COALESCE(receive_number, '')), batch_size)`.

- Tabel **`material_inspections`**:
  - Kolom: `id` (BIGSERIAL PK), `inspection_id` (VARCHAR UNIQUE), `master_data_id` (BIGINT FK ke `material_master_data.id`), `po_no` (VARCHAR), `material_name` (TEXT), `item_description` (TEXT), `qty_receive` (NUMERIC), `ok` (NUMERIC), `no_qty` (NUMERIC), `receive_date` (DATE), `status` (VARCHAR), `inspection_date` (TIMESTAMPTZ), `inspector_nik` (VARCHAR), `defect_notes` (TEXT), `rolling_inspection` (VARCHAR), `approved_by_leader` (VARCHAR), `evidence_url` (TEXT), `inspection_type` (VARCHAR), `color_check_status` (VARCHAR), `color_check_result` (VARCHAR), `packaging_status` (VARCHAR), `packaging_reject_reason` (TEXT), `roll_inspection_flag` (VARCHAR), `roll_inspection_percentage` (VARCHAR), `bonding_test_url` (TEXT), `created_at` (TIMESTAMPTZ).
  - Indeks B-Tree: `idx_insp_po_no`, `idx_insp_master_data_id`, `idx_insp_inspection_date`, `idx_insp_status`.

- Tabel **`material_claims`**:
  - Kolom: `id` (BIGSERIAL PK), `claim_date` (TIMESTAMPTZ), `master_data_id` (BIGINT FK), `po_number` (VARCHAR), `material_name` (TEXT), `vendor_name` (TEXT), `material_type` (VARCHAR), `claimed_qty` (NUMERIC), `reason` (TEXT), `ref_number` (VARCHAR), `submitted_by` (VARCHAR), `original_planned_qty` (NUMERIC), `new_planned_qty` (NUMERIC).

- Tabel **`material_assignments`**:
  - Kolom: `id` (BIGSERIAL PK), `material_type` (VARCHAR UNIQUE), `inspector_nik` (VARCHAR), `inspector_name` (VARCHAR), `updated_by` (VARCHAR), `updated_at` (TIMESTAMPTZ).

- **Stored Procedures / Database Functions (RPC)**:
  - `fn_pass_all_materials(target_ids BIGINT[], admin_nik TEXT, admin_name TEXT)`: Menjalankan Pass All dalam 1 transaksi atomic SQL (update status master_data & insert inspection record secara instan).
  - `fn_submit_claim_material(...)`: Mengurangi `batch_size` di master_data dan mencatat klaim secara atomic.

---

### Component 2: Supabase API Service Layer (`js/material/api.js`)

#### `js/material/api.js`
Membuat modul layanan API frontend yang langsung berkomunikasi dengan REST Client Supabase (atau API Supabase SDK) menggunakan `access_token` JWT Supabase Auth yang sudah ada.

Fungsi-fungsi API:
- `apiGetMasterData({ status, materialType, page, limit, search })`: Mendukung pagination cepat `LIMIT ... OFFSET ...`.
- `apiGetInspectionData({ startDate, endDate, limit })`
- `apiSubmitInspection(payload)`
- `apiBulkUpsertMasterData(rows, uploaderNik)`
- `apiPassAll(rowIds, adminNik, adminName)`
- `apiSubmitClaim(payload)`
- `apiGetUsers()` & `apiSaveUser()` & `apiDeleteUser()`
- `apiGetAssignments()` & `apiSaveAssignment()`

---

### Component 3: Refactoring Frontend Core Logic

Membuat perbaikan pada modul JS agar memanggil `js/material/api.js` sebagai pengganti `MATERIAL_GAS_URL`.

- **`js/material/admin.js`**:
  - Mengubah `loadMasterData()` untuk menggunakan `apiGetMasterData()`.
  - Mengubah `handleFileUpload()` untuk mengirim batch baris ke `apiBulkUpsertMasterData()`.
  - Mengubah `confirmPassAll()` untuk memanggil RPC `apiPassAll()`.
  - Mengubah `handleClaimSubmit()` ke `apiSubmitClaim()`.

- **`js/material/form.js`**:
  - Mengubah `fetchMasterData()` untuk memanggil `apiGetMasterData()`.
  - Mengubah `submitInspection()` untuk memanggil `apiSubmitInspection()`.

- **`js/material/dashboard.js`**:
  - Mengubah `fetchData()` untuk memanggil `apiGetInspectionData()`.

---

### Component 4: One-Time Data Migration Script (`scripts/migrate-gas-to-supabase.js`)

#### `scripts/migrate-gas-to-supabase.js`
Script utilitas Node.js untuk menarik seluruh data dari Google Apps Script Web App lama (`getMasterData`, `getInspectionData`, `getClaims`, `getMaterialAssignments`) dan menyuntikkannya ke tabel Supabase PostgreSQL tanpa ada data yang hilang.

---

### Component 5: Export to Excel Utility (`js/material/export.js`)

#### `js/material/export.js`
Menyediakan utilitas ekspor data tabel Master Data, Inspection Logs, dan Claims History langsung ke format Excel `.xlsx` / `.csv` menggunakan `xlsx.mini.min.js`.

---

## 3. Rencana Pengujian (Verification Plan)

### Automated Verification
- **Skrip Validasi Schema SQL**: Jalankan skrip SQL di Supabase SQL Editor dan verifikasi bahwa tabel, indeks, dan RLS policy terbuat tanpa error.
- **Data Migration Script**: Jalankan `node scripts/migrate-gas-to-supabase.js` dan verifikasi jumlah record di Supabase sesuai dengan jumlah baris di Google Sheets.

### Manual Verification
1. **Loading Speed Test**:
   - Buka menu Admin dan bandingkan waktu muat data PO (target: < 200 ms).
2. **Batch Pass All Test**:
   - Pilih 100+ item di tab Pass All, klik *Pass All*, verifikasi status ter-update instan tanpa ada baris duplikat.
3. **Inspection Submission Test**:
   - Kirim hasil inspeksi dari form user (`form.html`), verifikasi data langsung muncul di Dashboard dan Admin Log.
4. **Excel Export Test**:
   - Klik tombol *Export to Excel* pada tabel Master Data dan pastikan file `.xlsx` ter-download dengan rapi.
