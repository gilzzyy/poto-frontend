const app = require('./app');
const env = require('./config/env');
const db = require('./config/supabase');

const server = app.listen(env.PORT, () => {
  const dbMode = db.isSupabaseConnected
    ? `Supabase PostgreSQL (${env.SUPABASE_URL})`
    : 'In-Memory Simulation Store (isi SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di .env untuk koneksi Supabase live)';
  console.log('==============================================================');
  console.log(`Photobooth Backend REST API berjalan di http://localhost:${env.PORT}`);
  console.log(`Database Mode : ${dbMode}`);
  console.log(`Storage Bucket: ${env.SUPABASE_STRIPS_BUCKET} (privat, signed URL)`);
  console.log('==============================================================');
});

module.exports = server;
