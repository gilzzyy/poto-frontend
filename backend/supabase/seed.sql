-- ============================================================================
-- SEED AWAL KATALOG & PAKET SIMULASI APLIKASI PHOTOBOOTH
-- Acuan tunggal: BRD v1.0 Bab 6.1, PRD v1.0 Bab 5/6/8, dan Frontend Photobooth
-- ============================================================================

-- 1. Paket Langganan Simulasi (2 Paket: Bulanan Rp19.000 & Tahunan Rp149.000)
INSERT INTO subscription_plans (code, name, price_idr, duration_days, is_simulation, is_active)
VALUES
  ('monthly', 'Paket Bulanan (Simulasi)', 19000, 30, true, true),
  ('yearly', 'Paket Tahunan (Simulasi)', 149000, 365, true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price_idr = EXCLUDED.price_idr,
  duration_days = EXCLUDED.duration_days,
  is_simulation = EXCLUDED.is_simulation,
  is_active = EXCLUDED.is_active;

-- 2. Templates - 4 Layout (Strip 3, Strip 4 = Free; Grid 2x2, Polaroid = Premium)
INSERT INTO templates (
  code, name, kind, photo_count, canvas_width, canvas_height, frame_color, config, required_tier, is_active
)
VALUES
  (
    'strip_3',
    'Strip 3',
    'layout',
    3,
    1200,
    2800,
    '#FFFFFF',
    '{
      "frontend_key": "strip3",
      "desc": "3 foto vertikal",
      "thumb": "strip",
      "rows": 3,
      "padding_top": 60,
      "padding_side": 60,
      "slot_gap": 40,
      "slot_width": 1080,
      "slot_height": 760,
      "slots": [
        {"position": 1, "x": 60, "y": 60, "width": 1080, "height": 760},
        {"position": 2, "x": 60, "y": 860, "width": 1080, "height": 760},
        {"position": 3, "x": 60, "y": 1660, "width": 1080, "height": 760}
      ],
      "footer": {"height": 320, "app_name": "Photobooth", "show_date": true},
      "standard_scale": 1.0,
      "hd_scale": 2.0
    }'::jsonb,
    'free',
    true
  ),
  (
    'strip_4',
    'Strip 4',
    'layout',
    4,
    1200,
    3600,
    '#FFFFFF',
    '{
      "frontend_key": "strip4",
      "desc": "4 foto vertikal",
      "thumb": "strip",
      "rows": 4,
      "padding_top": 60,
      "padding_side": 60,
      "slot_gap": 40,
      "slot_width": 1080,
      "slot_height": 760,
      "slots": [
        {"position": 1, "x": 60, "y": 60, "width": 1080, "height": 760},
        {"position": 2, "x": 60, "y": 860, "width": 1080, "height": 760},
        {"position": 3, "x": 60, "y": 1660, "width": 1080, "height": 760},
        {"position": 4, "x": 60, "y": 2460, "width": 1080, "height": 760}
      ],
      "footer": {"height": 320, "app_name": "Photobooth", "show_date": true},
      "standard_scale": 1.0,
      "hd_scale": 2.0
    }'::jsonb,
    'free',
    true
  ),
  (
    'grid_2x2',
    'Grid 2x2',
    'layout',
    4,
    1800,
    1800,
    '#FFFFFF',
    '{
      "frontend_key": "grid",
      "desc": "4 foto kotak",
      "thumb": "grid",
      "padding_top": 60,
      "padding_side": 60,
      "slot_gap": 40,
      "slot_width": 820,
      "slot_height": 700,
      "slots": [
        {"position": 1, "x": 60, "y": 60, "width": 820, "height": 700},
        {"position": 2, "x": 920, "y": 60, "width": 820, "height": 700},
        {"position": 3, "x": 60, "y": 800, "width": 820, "height": 700},
        {"position": 4, "x": 920, "y": 800, "width": 820, "height": 700}
      ],
      "footer": {"height": 240, "app_name": "Photobooth", "show_date": true},
      "standard_scale": 1.0,
      "hd_scale": 2.0
    }'::jsonb,
    'premium',
    true
  ),
  (
    'polaroid',
    'Polaroid',
    'layout',
    1,
    1200,
    1500,
    '#FFFFFF',
    '{
      "frontend_key": "polaroid",
      "desc": "1 foto bingkai tebal",
      "thumb": "pola",
      "padding_top": 68,
      "padding_side": 68,
      "slot_gap": 40,
      "slot_width": 1064,
      "slot_height": 798,
      "polaroid_border": true,
      "slots": [
        {"position": 1, "x": 68, "y": 68, "width": 1064, "height": 798}
      ],
      "footer": {"height": 264, "app_name": "Photobooth", "show_date": true, "style": "polaroid_caption"},
      "standard_scale": 1.0,
      "hd_scale": 2.0
    }'::jsonb,
    'premium',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  photo_count = EXCLUDED.photo_count,
  canvas_width = EXCLUDED.canvas_width,
  canvas_height = EXCLUDED.canvas_height,
  frame_color = EXCLUDED.frame_color,
  config = EXCLUDED.config,
  required_tier = EXCLUDED.required_tier,
  is_active = EXCLUDED.is_active;

-- 3. Templates - 6 Frame Korean Pastel (2 Free + 4 Premium sesuai BRD Bab 6.1)
INSERT INTO templates (
  code, name, kind, photo_count, canvas_width, canvas_height, frame_color, config, required_tier, is_active
)
VALUES
  (
    'frame_putih_salju',
    'Putih Salju',
    'frame',
    NULL,
    NULL,
    NULL,
    '#FFFFFF',
    '{"frontend_key": "white", "desc": "Bersih klasik", "fill": ["#ffffff"], "ink": "#8a5a74", "background": "#FFFFFF", "text_color": "#8a5a74", "border_radius": 24}'::jsonb,
    'free',
    true
  ),
  (
    'frame_pink_susu',
    'Pink Susu',
    'frame',
    NULL,
    NULL,
    NULL,
    '#FFD6E7',
    '{"frontend_key": "pink", "desc": "Manis khas Korea", "fill": ["#ffd6e7", "#ffc2da"], "ink": "#a33d68", "background": "#FFD6E7", "text_color": "#a33d68", "border_radius": 24}'::jsonb,
    'free',
    true
  ),
  (
    'frame_lavender',
    'Lavender',
    'frame',
    NULL,
    NULL,
    NULL,
    '#E6E0FF',
    '{"frontend_key": "lavender", "desc": "Ungu lembut", "fill": ["#e6e0ff", "#d3c8fb"], "ink": "#5d4bb0", "background": "#E6E0FF", "text_color": "#5d4bb0", "border_radius": 24}'::jsonb,
    'premium',
    true
  ),
  (
    'frame_mint_segar',
    'Mint Segar',
    'frame',
    NULL,
    NULL,
    NULL,
    '#CDF3E0',
    '{"frontend_key": "mint", "desc": "Hijau sejuk", "fill": ["#cdf3e0", "#a9e8c8"], "ink": "#14714c", "background": "#CDF3E0", "text_color": "#14714c", "border_radius": 24}'::jsonb,
    'premium',
    true
  ),
  (
    'frame_kuning_mentega',
    'Kuning Mentega',
    'frame',
    NULL,
    NULL,
    NULL,
    '#FFEDB8',
    '{"frontend_key": "butter", "desc": "Ceria hangat", "fill": ["#ffedb8", "#ffe08a"], "ink": "#9a6b12", "background": "#FFEDB8", "text_color": "#9a6b12", "border_radius": 24}'::jsonb,
    'premium',
    true
  ),
  (
    'frame_pelangi_pastel',
    'Pelangi Pastel',
    'frame',
    NULL,
    NULL,
    NULL,
    'linear-gradient(160deg, #ffd6e7, #ffedb8, #cdf3e0, #d8efff, #e6e0ff)',
    '{
      "frontend_key": "rainbow",
      "desc": "Gradasi pelangi",
      "fill": ["#ffd6e7", "#ffedb8", "#cdf3e0", "#d8efff", "#e6e0ff"],
      "ink": "#8a5a74",
      "background": "linear-gradient(160deg, #ffd6e7, #ffedb8, #cdf3e0, #d8efff, #e6e0ff)",
      "text_color": "#8a5a74",
      "border_radius": 24
    }'::jsonb,
    'premium',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  frame_color = EXCLUDED.frame_color,
  config = EXCLUDED.config,
  required_tier = EXCLUDED.required_tier,
  is_active = EXCLUDED.is_active;

-- 4. Filters - 7 Filter Warna (3 Free + 4 Premium sesuai BRD Bab 6.1 & PRD Bab 6)
INSERT INTO filters (code, name, css_filter, params, required_tier, is_active)
VALUES
  (
    'normal',
    'Normal',
    'none',
    '{"frontend_key": "normal", "desc": "Warna asli kamera"}'::jsonb,
    'free',
    true
  ),
  (
    'bw',
    'Hitam-Putih',
    'grayscale(1) contrast(1.06)',
    '{"frontend_key": "bw", "desc": "Monokrom klasik", "grayscale": 1.0, "contrast": 1.06}'::jsonb,
    'free',
    true
  ),
  (
    'warm',
    'Warm',
    'sepia(.34) saturate(1.28) hue-rotate(-9deg) brightness(1.04)',
    '{"frontend_key": "warm", "desc": "Hangat keemasan", "sepia": 0.34, "saturate": 1.28, "hue_rotate_deg": -9, "brightness": 1.04}'::jsonb,
    'free',
    true
  ),
  (
    'vintage',
    'Vintage',
    'sepia(.55) contrast(.92) brightness(1.06) saturate(.74)',
    '{"frontend_key": "vintage", "desc": "Nuansa foto lama", "sepia": 0.55, "contrast": 0.92, "brightness": 1.06, "saturate": 0.74, "vignette": 0.35}'::jsonb,
    'premium',
    true
  ),
  (
    'cold',
    'Cold',
    'saturate(.8) brightness(1.08) contrast(1.05) hue-rotate(-6deg)',
    '{"frontend_key": "cold", "desc": "Dingin kebiruan", "saturate": 0.8, "brightness": 1.08, "contrast": 1.05, "hue_rotate_deg": -6}'::jsonb,
    'premium',
    true
  ),
  (
    'soft_beauty',
    'Soft Beauty',
    'brightness(1.13) contrast(.92) saturate(1.18)',
    '{"frontend_key": "beauty", "desc": "Cerah & lembut", "brightness": 1.13, "contrast": 0.92, "saturate": 1.18}'::jsonb,
    'premium',
    true
  ),
  (
    'film',
    'Film',
    'contrast(1.13) saturate(.82) sepia(.27) brightness(.99)',
    '{"frontend_key": "film", "desc": "Grain ala analog", "contrast": 1.13, "saturate": 0.82, "sepia": 0.27, "brightness": 0.99, "grain": 0.22}'::jsonb,
    'premium',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  css_filter = EXCLUDED.css_filter,
  params = EXCLUDED.params,
  required_tier = EXCLUDED.required_tier,
  is_active = EXCLUDED.is_active;

-- 5. Stickers & Overlays (Paket stiker dasar gratis + Paket stiker premium tambahan + overlay)
INSERT INTO stickers (code, name, storage_path, category, source_name, license, required_tier, is_active)
VALUES
  (
    'heart',
    'Hati',
    'katalog/stickers/heart.svg',
    'basic_pack',
    'Photobooth Korean Pastel SVG Pack',
    'CC0 1.0 / MIT',
    'free',
    true
  ),
  (
    'flower',
    'Bunga',
    'katalog/stickers/flower.svg',
    'basic_pack',
    'Photobooth Korean Pastel SVG Pack',
    'CC0 1.0 / MIT',
    'free',
    true
  ),
  (
    'cloud',
    'Awan',
    'katalog/stickers/cloud.svg',
    'basic_pack',
    'Photobooth Korean Pastel SVG Pack',
    'CC0 1.0 / MIT',
    'free',
    true
  ),
  (
    'star',
    'Bintang',
    'katalog/stickers/star.svg',
    'premium_pack',
    'Photobooth Korean Pastel SVG Pack',
    'CC0 1.0 / MIT',
    'premium',
    true
  ),
  (
    'moon',
    'Bulan',
    'katalog/stickers/moon.svg',
    'premium_pack',
    'Photobooth Korean Pastel SVG Pack',
    'CC0 1.0 / MIT',
    'premium',
    true
  ),
  (
    'sparkle',
    'Gemerlap',
    'katalog/stickers/sparkle.svg',
    'premium_pack',
    'Photobooth Korean Pastel SVG Pack',
    'CC0 1.0 / MIT',
    'premium',
    true
  ),
  (
    'sticker_pastel_ribbon',
    'Pita Lavender Coquette',
    'katalog/stickers/pastel-ribbon.png',
    'premium_pack',
    'Flaticon Pastel Photobooth Pack',
    'Flaticon Free License (With Attribution)',
    'premium',
    true
  ),
  (
    'overlay_film_grain',
    'Overlay Film Grain',
    'katalog/overlays/film-grain.png',
    'overlay',
    'Speckyboy Free Film Grain Pack',
    'CC0 1.0 Universal (Public Domain)',
    'premium',
    true
  ),
  (
    'overlay_light_leak',
    'Overlay Light Leak Hangat',
    'katalog/overlays/light-leak.png',
    'overlay',
    'ON1 Free Light Leak Pack',
    'Free Personal & Academic License',
    'premium',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  storage_path = EXCLUDED.storage_path,
  category = EXCLUDED.category,
  source_name = EXCLUDED.source_name,
  license = EXCLUDED.license,
  required_tier = EXCLUDED.required_tier,
  is_active = EXCLUDED.is_active;
