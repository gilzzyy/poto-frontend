const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const isPlaceholder = (val) =>
  !val ||
  val.includes('your-project-id') ||
  val.includes('your-supabase-service-role');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasSupabaseConfig =
  !isPlaceholder(SUPABASE_URL) &&
  !isPlaceholder(SUPABASE_SERVICE_ROLE_KEY) &&
  process.env.USE_MEMORY_DB !== 'true';

module.exports = {
  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  JWT_SECRET:
    process.env.JWT_SECRET || 'photobooth_dev_jwt_secret_key_change_in_production_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  hasSupabaseConfig,
  SUPABASE_STRIPS_BUCKET: process.env.SUPABASE_STRIPS_BUCKET || 'photo-strips',
  SUPABASE_CATALOG_BUCKET: process.env.SUPABASE_CATALOG_BUCKET || 'katalog',
  SIGNED_URL_TTL_SECONDS: Number(process.env.SIGNED_URL_TTL_SECONDS) || 900,
};
