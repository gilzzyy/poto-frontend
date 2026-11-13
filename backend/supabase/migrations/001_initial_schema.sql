-- ============================================================================
-- MIGRASI DATABASE APLIKASI PHOTOBOOTH (BRD v1.0 & PRD v1.0)
-- Database: Supabase PostgreSQL + Supabase Storage
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Fungsi otomatis untuk memperbarui kolom updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1. Tabel users (profiles) - Akun pengguna aplikasi
--    Catatan (BE-11): Tier TIDAK disimpan di tabel ini, melainkan diturunkan
--    dari tabel subscriptions yang berstatus 'active' dan belum kedaluwarsa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  avatar_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Tabel subscription_plans - Paket langganan simulasi (dummy)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code IN ('monthly', 'yearly')),
  name text NOT NULL,
  price_idr integer NOT NULL CHECK (price_idr >= 0),
  duration_days integer NOT NULL CHECK (duration_days IN (30, 365)),
  is_simulation boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_subscription_plans_updated_at
BEFORE UPDATE ON subscription_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Tabel subscriptions - Langganan pengguna
--    Aturan: maksimal satu baris 'active' per pengguna (unique index parsial)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Unique index parsial: maksimal satu langganan berstatus 'active' per pengguna
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON subscriptions(user_id)
  WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- 4. Tabel payments_simulation - Bukti checkout dummy (SEC-06: tanpa data kartu/rekening asli)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments_simulation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid UNIQUE NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('qris', 'ewallet', 'card')),
  amount_idr integer NOT NULL CHECK (amount_idr >= 0),
  status text NOT NULL DEFAULT 'simulated_success' CHECK (status IN ('simulated_success', 'simulated_failed')),
  is_simulation boolean NOT NULL DEFAULT true,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_payments_simulation_updated_at
BEFORE UPDATE ON payments_simulation
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Tabel templates - Katalog Layout + Frame
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('layout', 'frame')),
  photo_count integer CHECK (photo_count IS NULL OR (photo_count BETWEEN 1 AND 4)),
  canvas_width integer,
  canvas_height integer,
  frame_color text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_tier text NOT NULL DEFAULT 'free' CHECK (required_tier IN ('free', 'premium')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_templates_updated_at
BEFORE UPDATE ON templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Tabel filters - Katalog Filter Warna
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code IN ('normal', 'bw', 'warm', 'vintage', 'cold', 'soft_beauty', 'film')),
  name text NOT NULL,
  css_filter text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_tier text NOT NULL DEFAULT 'free' CHECK (required_tier IN ('free', 'premium')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_filters_updated_at
BEFORE UPDATE ON filters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Tabel stickers - Katalog Stiker dan Efek Overlay
--    Wajib mencatat source_name dan license (PRD Bab 6 & BRD Bab 5.3)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  storage_path text NOT NULL,
  category text NOT NULL,
  source_name text NOT NULL CHECK (char_length(trim(source_name)) > 0),
  license text NOT NULL CHECK (char_length(trim(license)) > 0),
  required_tier text NOT NULL DEFAULT 'free' CHECK (required_tier IN ('free', 'premium')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_stickers_updated_at
BEFORE UPDATE ON stickers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Tabel photo_sessions - Sesi foto pengguna (user_id boleh NULL untuk tamu)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
  frame_id uuid REFERENCES templates(id) ON DELETE RESTRICT,
  filter_id uuid REFERENCES filters(id) ON DELETE RESTRICT,
  applied_sticker_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  tier_at_session text NOT NULL DEFAULT 'free' CHECK (tier_at_session IN ('free', 'premium')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  strip_storage_path text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_photo_sessions_updated_at
BEFORE UPDATE ON photo_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. Tabel photos - Slot foto dalam satu sesi (posisi 1-4 unik per sesi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES photo_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 4),
  storage_path text,
  is_retaken boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_photos_session_position UNIQUE (session_id, position)
);

CREATE TRIGGER trg_photos_updated_at
BEFORE UPDATE ON photos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- 10. Tabel downloads - Pencatatan unduhan strip foto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES photo_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  format text NOT NULL CHECK (format IN ('png', 'jpg')),
  resolution text NOT NULL CHECK (resolution IN ('standard', 'hd')),
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_downloads_updated_at
BEFORE UPDATE ON downloads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- INDEKS WAJIB (BRD Seksi 5.4)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_photo_sessions_user_created ON photo_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_session_position ON photos(session_id, position);
CREATE INDEX IF NOT EXISTS idx_downloads_user_downloaded ON downloads(user_id, downloaded_at DESC);

-- ============================================================================
-- SUPABASE STORAGE BUCKETS (BRD Seksi 5.4 & Lampiran A)
-- Bucket 'photo-strips' privat (default), 'katalog' publik untuk aset frame/stiker
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES
      ('photo-strips', 'photo-strips', false),
      ('katalog', 'katalog', true)
    ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
  END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) SEBAGAI LAPIS PERTAHANAN TAMBAHAN (BRD Seksi 5.4)
-- Catatan: Backend Express memakai service_role key yang melewati RLS dan
-- menegakkan validasi kepemilikan (BE-12), sedangkan RLS mencegah akses
-- langsung dari klien menggunakan anon key.
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_simulation ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;

-- Kebijakan baca publik hanya untuk katalog aktif
DROP POLICY IF EXISTS "Public read active plans" ON subscription_plans;
CREATE POLICY "Public read active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public read active templates" ON templates;
CREATE POLICY "Public read active templates" ON templates
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public read active filters" ON filters;
CREATE POLICY "Public read active filters" ON filters
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public read active stickers" ON stickers;
CREATE POLICY "Public read active stickers" ON stickers
  FOR SELECT USING (is_active = true);

-- Kebijakan berbasis pemilik (auth.uid()) untuk tabel data pengguna
DROP POLICY IF EXISTS "Users read own profile" ON users;
CREATE POLICY "Users read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON users;
CREATE POLICY "Users update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users read own subscriptions" ON subscriptions;
CREATE POLICY "Users read own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own simulated payments" ON payments_simulation;
CREATE POLICY "Users read own simulated payments" ON payments_simulation
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own photo sessions" ON photo_sessions;
CREATE POLICY "Users access own photo sessions" ON photo_sessions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own photos via session" ON photos;
CREATE POLICY "Users access own photos via session" ON photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM photo_sessions ps
      WHERE ps.id = photos.session_id AND ps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users access own downloads" ON downloads;
CREATE POLICY "Users access own downloads" ON downloads
  FOR ALL USING (auth.uid() = user_id);
