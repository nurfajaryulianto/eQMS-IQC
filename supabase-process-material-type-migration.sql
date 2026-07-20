-- Migrasi: Tambahkan kolom material_type ke tabel processes
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS material_type TEXT CHECK (material_type IN ('upper', 'bottom'));
