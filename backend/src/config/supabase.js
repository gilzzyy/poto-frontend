const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const env = require('./env');
const {
  SEED_PLANS,
  SEED_TEMPLATES,
  SEED_FILTERS,
  SEED_STICKERS,
  normalizeTemplateKey,
  normalizeFilterKey,
  normalizeStickerKey,
} = require('./seed-data');
const { AppError } = require('../utils/response');

// Inisialisasi client Supabase hanya di sisi server dengan service/secret key (SEC-03)
const supabaseClient = env.hasSupabaseConfig
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Cache metadata sesi tambahan (tier_at_session, frame_id, applied_sticker_ids, retake flags)
const sessionRuntimeMeta = new Map();

// ============================================================================
// IN-MEMORY STORE (Fallback otomatis saat pengujian unit / bila offline)
// ============================================================================
function createInitialMemoryState() {
  const now = new Date().toISOString();
  return {
    users: [],
    subscription_plans: SEED_PLANS.map((p) => ({
      ...p,
      created_at: now,
      updated_at: now,
    })),
    subscriptions: [],
    payments_simulation: [],
    templates: SEED_TEMPLATES.map((t) => ({
      ...t,
      created_at: now,
      updated_at: now,
    })),
    filters: SEED_FILTERS.map((f) => ({
      ...f,
      created_at: now,
      updated_at: now,
    })),
    stickers: SEED_STICKERS.map((s) => ({
      ...s,
      created_at: now,
      updated_at: now,
    })),
    photo_sessions: [],
    photos: [],
    downloads: [],
    storageObjects: new Map(),
  };
}

let memoryStore = createInitialMemoryState();

function resetMemoryStore() {
  memoryStore = createInitialMemoryState();
  sessionRuntimeMeta.clear();
}

// ============================================================================
// NORMALIZERS UNTUK SKEMA SUPABASE LIVE (blfbyacgwkpiwarcmcrc.supabase.co)
// ============================================================================
function normalizeUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    name: row.name || row.display_name || row.email.split('@')[0],
    display_name: row.display_name || row.name || row.email.split('@')[0],
    avatar_path:
      row.avatar_path !== undefined ? row.avatar_path : row.avatar_url || null,
    avatar_url:
      row.avatar_url !== undefined ? row.avatar_url : row.avatar_path || null,
    is_active: row.is_active !== undefined ? row.is_active : true,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

function normalizePlanRow(row) {
  if (!row) return null;
  let normalizedCode = row.code;
  if (row.code === 'premium_monthly') normalizedCode = 'monthly';
  if (row.code === 'premium_yearly') normalizedCode = 'yearly';
  return {
    ...row,
    db_code: row.code,
    code: normalizedCode,
    is_simulation: true,
  };
}

function normalizeFilterRow(row) {
  if (!row) return null;
  const requiredTier =
    row.required_tier || (row.is_premium ? 'premium' : 'free');
  const code = row.code === 'soft' ? 'soft_beauty' : row.code;
  const frontendKey =
    row.params?.frontend_key ||
    (code === 'soft_beauty' ? 'beauty' : code);
  return {
    ...row,
    db_code: row.code,
    code,
    frontend_key: frontendKey,
    required_tier: requiredTier,
    is_premium: requiredTier === 'premium',
    params: {
      ...(row.params || {}),
      frontend_key: frontendKey,
    },
  };
}

const STICKER_NAME_TO_CODE = {
  hati: 'heart',
  bunga: 'flower',
  senyum: 'cloud',
  awan: 'cloud',
  bintang: 'star',
  bulan: 'moon',
  gemerlap: 'sparkle',
};

function normalizeStickerRow(row) {
  if (!row) return null;
  const requiredTier =
    row.required_tier || (row.is_premium ? 'premium' : 'free');
  const lowerName = String(row.name || '')
    .trim()
    .toLowerCase();
  const code =
    row.code || STICKER_NAME_TO_CODE[lowerName] || `sticker_${row.sort_order || 1}`;
  return {
    ...row,
    code,
    frontend_key: code,
    emoji: row.emoji || row.symbol || '✨',
    symbol: row.symbol || row.emoji || '✨',
    storage_path: row.storage_path || `katalog/stickers/${code}.svg`,
    category: row.category || row.pack_name || (requiredTier === 'premium' ? 'premium_pack' : 'basic_pack'),
    source_name: row.source_name || 'Photobooth Korean Pastel Pack',
    license: row.license || 'CC0 1.0 / MIT',
    required_tier: requiredTier,
    is_premium: requiredTier === 'premium',
  };
}

function normalizeTemplateRow(row) {
  if (!row) return null;
  const requiredTier =
    row.required_tier || (row.is_premium ? 'premium' : 'free');
  // Bila tabel templates di Supabase memakai kolom layout_type + frame_name
  if (row.layout_type && !row.kind) {
    const layoutMap = {
      strip3: { code: 'strip_3', photo_count: 3, canvas_width: 1200, canvas_height: 2800 },
      strip4: { code: 'strip_4', photo_count: 4, canvas_width: 1200, canvas_height: 3600 },
      grid: { code: 'grid_2x2', photo_count: 4, canvas_width: 1800, canvas_height: 1800 },
      polaroid: { code: 'polaroid', photo_count: 1, canvas_width: 1200, canvas_height: 1500 },
    };
    const spec = layoutMap[row.layout_type] || layoutMap.strip4;
    return {
      ...row,
      code: row.code || spec.code,
      kind: 'layout',
      photo_count: row.photo_count || spec.photo_count,
      canvas_width: row.canvas_width || spec.canvas_width,
      canvas_height: row.canvas_height || spec.canvas_height,
      required_tier: requiredTier,
      is_premium: requiredTier === 'premium',
      config: {
        ...(row.config || {}),
        frontend_key: row.layout_type,
        frame_name: row.frame_name,
      },
    };
  }
  return {
    ...row,
    required_tier: requiredTier,
    is_premium: requiredTier === 'premium',
  };
}

// ============================================================================
// HELPER: Sinkronisasi otomatis status kedaluwarsa langganan & penurunan Tier (BE-11)
// ============================================================================
async function getActiveSubscriptionForUser(userId) {
  if (!userId) return null;
  const nowIso = new Date().toISOString();

  if (supabaseClient) {
    await supabaseClient
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('status', 'active')
      .lte('expires_at', nowIso);

    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new AppError(
        500,
        'DB_ERROR',
        `Gagal membaca status langganan: ${error.message}`
      );
    }
    if (!data) return null;
    return {
      ...data,
      plan: normalizePlanRow(data.plan),
    };
  }

  for (const sub of memoryStore.subscriptions) {
    if (
      sub.user_id === userId &&
      sub.status === 'active' &&
      new Date(sub.expires_at).getTime() <= Date.now()
    ) {
      sub.status = 'expired';
      sub.updated_at = nowIso;
    }
  }

  const activeSub = memoryStore.subscriptions.find(
    (s) =>
      s.user_id === userId &&
      s.status === 'active' &&
      new Date(s.expires_at).getTime() > Date.now()
  );

  if (!activeSub) return null;
  const plan =
    memoryStore.subscription_plans.find((p) => p.id === activeSub.plan_id) || null;
  return { ...activeSub, plan };
}

async function deriveUserTier(userId) {
  const activeSub = await getActiveSubscriptionForUser(userId);
  return {
    tier: activeSub ? 'premium' : 'free',
    activeSubscription: activeSub,
  };
}

// ============================================================================
// REPOSITORY: USERS
// ============================================================================
async function findUserByEmail(email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return normalizeUserRow(data);
  }
  return memoryStore.users.find((u) => u.email === normalizedEmail) || null;
}

async function findUserById(id) {
  if (!id) return null;
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return normalizeUserRow(data);
  }
  return memoryStore.users.find((u) => u.id === id) || null;
}

async function createUser({ email, password_hash, display_name, avatar_path = null }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanName = display_name || normalizedEmail.split('@')[0];

  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .insert({
        email: normalizedEmail,
        password_hash,
        name: cleanName,
        avatar_url: avatar_path,
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar.');
      }
      throw new AppError(500, 'DB_ERROR', error.message);
    }
    return normalizeUserRow(data);
  }

  if (memoryStore.users.some((u) => u.email === normalizedEmail)) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar.');
  }
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    password_hash,
    display_name: cleanName,
    name: cleanName,
    avatar_path,
    avatar_url: avatar_path,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  memoryStore.users.push(user);
  return { ...user };
}

async function updateUser(id, updates) {
  if (supabaseClient) {
    const dbUpdates = { updated_at: new Date().toISOString() };
    if (updates.display_name !== undefined) dbUpdates.name = updates.display_name;
    if (updates.avatar_path !== undefined) dbUpdates.avatar_url = updates.avatar_path;

    const { data, error } = await supabaseClient
      .from('users')
      .update(dbUpdates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return normalizeUserRow(data);
  }

  const user = memoryStore.users.find((u) => u.id === id);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.');
  if (updates.display_name !== undefined) {
    user.display_name = updates.display_name;
    user.name = updates.display_name;
  }
  if (updates.avatar_path !== undefined) {
    user.avatar_path = updates.avatar_path;
    user.avatar_url = updates.avatar_path;
  }
  user.updated_at = new Date().toISOString();
  return { ...user };
}

// ============================================================================
// REPOSITORY: CATALOG (templates, filters, stickers)
// ============================================================================
async function listActiveTemplates(kind = null) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);

    // Petakan baris templates Supabase + daftar lengkap 4 layout & 6 frame standar BRD Bab 6
    const dbRows = data || [];
    const byLayout = {};
    const byFrame = {};
    for (const r of dbRows) {
      if (r.layout_type && !byLayout[r.layout_type]) byLayout[r.layout_type] = r;
      if (r.frame_name && !byFrame[r.frame_name.toLowerCase()]) {
        byFrame[r.frame_name.toLowerCase()] = r;
      }
    }

    const mappedCatalog = SEED_TEMPLATES.map((seedItem) => {
      if (seedItem.kind === 'layout') {
        const feKey = seedItem.config?.frontend_key;
        const match = byLayout[feKey] || dbRows[0];
        return {
          ...seedItem,
          frontend_key: feKey || seedItem.code,
          db_template_id: match ? match.id : seedItem.id,
        };
      }
      const match = byFrame[seedItem.name.toLowerCase()] || dbRows[0];
      return {
        ...seedItem,
        frontend_key: seedItem.config?.frontend_key || seedItem.code,
        db_template_id: match ? match.id : seedItem.id,
      };
    });

    if (kind) {
      return mappedCatalog.filter((t) => t.kind === kind);
    }
    return mappedCatalog;
  }

  return memoryStore.templates.filter(
    (t) => t.is_active && (!kind || t.kind === kind)
  );
}

async function findTemplateByIdOrCode(idOrCode) {
  if (!idOrCode) return null;
  const raw = String(idOrCode).trim();
  const normalized = normalizeTemplateKey(raw);

  const allMapped = await listActiveTemplates();
  const matchedSeed = allMapped.find(
    (t) =>
      t.id === raw ||
      t.db_template_id === raw ||
      t.code === normalized ||
      t.config?.frontend_key === raw
  );

  if (supabaseClient) {
    const { data: dbRows, error } = await supabaseClient
      .from('templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);

    // Cari baris langsung berdasarkan UUID di Supabase
    const directUuid = (dbRows || []).find((r) => r.id === raw);
    if (directUuid && !matchedSeed) {
      return normalizeTemplateRow(directUuid);
    }

    if (matchedSeed) {
      return {
        ...matchedSeed,
        id: matchedSeed.db_template_id || matchedSeed.id,
      };
    }
    return null;
  }

  return matchedSeed || null;
}

async function listActiveFilters() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('filters')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return (data || []).map(normalizeFilterRow);
  }
  return memoryStore.filters.filter((f) => f.is_active);
}

async function findFilterByIdOrCode(idOrCode) {
  if (!idOrCode) return null;
  const raw = String(idOrCode).trim();
  const normalized = normalizeFilterKey(raw);
  const filters = await listActiveFilters();
  return (
    filters.find(
      (f) =>
        f.id === raw ||
        f.code === normalized ||
        f.db_code === raw ||
        f.params?.frontend_key === raw
    ) || null
  );
}

async function listActiveStickers() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('stickers')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return (data || []).map(normalizeStickerRow);
  }
  return memoryStore.stickers.filter((s) => s.is_active);
}

async function findStickersByIdsOrCodes(idsOrCodes = []) {
  if (!Array.isArray(idsOrCodes) || idsOrCodes.length === 0) return [];
  const allActive = await listActiveStickers();
  const lookup = new Set(
    idsOrCodes.flatMap((x) => {
      const s = String(x).trim();
      return [s, s.toLowerCase(), normalizeStickerKey(s)];
    })
  );
  return allActive.filter(
    (s) =>
      lookup.has(s.id) ||
      (s.code && lookup.has(s.code)) ||
      (s.name && lookup.has(s.name.toLowerCase()))
  );
}

// ============================================================================
// REPOSITORY: SUBSCRIPTION PLANS, SUBSCRIPTIONS & PAYMENTS SIMULATION
// ============================================================================
async function listActivePlans() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .gt('price_idr', 0)
      .order('price_idr', { ascending: true });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return (data || []).map(normalizePlanRow);
  }
  return memoryStore.subscription_plans.filter((p) => p.is_active);
}

async function findPlanByIdOrCode(idOrCode) {
  if (!idOrCode) return null;
  const raw = String(idOrCode).trim();
  const plans = await listActivePlans();
  return (
    plans.find(
      (p) => p.id === raw || p.code === raw || p.db_code === raw
    ) || null
  );
}

async function createSimulatedSubscriptionAndPayment({ userId, plan, method }) {
  const now = new Date();
  const durationDays = plan.duration_days || 30;
  const expiresAt = new Date(
    now.getTime() + durationDays * 24 * 60 * 60 * 1000
  );

  if (supabaseClient) {
    const { data: sub, error: subErr } = await supabaseClient
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: plan.id,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (subErr) {
      if (subErr.code === '23505') {
        throw new AppError(
          409,
          'ACTIVE_SUBSCRIPTION_EXISTS',
          'Pengguna sudah memiliki langganan Premium yang masih aktif.'
        );
      }
      throw new AppError(500, 'DB_ERROR', subErr.message);
    }

    const txCode = `SIM-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const methodCandidates = Array.from(
      new Set([
        method,
        `${method}_dummy`,
        method.toUpperCase(),
        method === 'ewallet' ? 'e_wallet' : method,
        method === 'ewallet' ? 'E-Wallet' : method,
        method === 'card' ? 'credit_card' : method,
        method === 'card' ? 'bank_transfer' : method,
        method === 'card' ? 'transfer' : method,
        method === 'card' ? 'transfer_bank' : method,
        method === 'card' ? 'Transfer Dummy' : method,
        'QRIS',
        'E-Wallet',
        'Transfer Dummy',
        'Kartu',
        'qris_dummy',
        'transfer_dummy',
        'ewallet_dummy',
        'card_dummy',
        'e_wallet',
        'bank_transfer',
        'credit_card',
        'virtual_account',
        'transfer',
        'dummy',
        'simulasi',
        'mock',
      ])
    );
    const statusCandidates = ['simulated_success', 'success', 'paid', 'completed'];

    let paymentData = null;
    let lastPayErr = null;

    outerLoop: for (const mCandidate of methodCandidates) {
      for (const sCandidate of statusCandidates) {
        const { data: payAttempt, error: payErr } = await supabaseClient
          .from('payments_simulation')
          .insert({
            subscription_id: sub.id,
            user_id: userId,
            plan_id: plan.id,
            method: mCandidate,
            amount_idr: plan.price_idr,
            status: sCandidate,
            transaction_code: txCode,
            paid_at: now.toISOString(),
          })
          .select('*')
          .single();

        if (!payErr && payAttempt) {
          paymentData = payAttempt;
          break outerLoop;
        }
        lastPayErr = payErr;
        // Jika error bukan因为 method check constraint, melainkan status check constraint, lanjut coba status berikutnya
        if (
          payErr &&
          payErr.message &&
          payErr.message.includes('payments_simulation_method_check')
        ) {
          break; // langsung ganti mCandidate berikutnya
        }
      }
    }

    if (!paymentData) {
      throw new AppError(
        500,
        'DB_ERROR',
        lastPayErr ? lastPayErr.message : 'Gagal menyimpan simulasi pembayaran.'
      );
    }

    return {
      subscription: { ...sub, plan, is_simulation: true },
      payment: {
        ...paymentData,
        db_method: paymentData.method,
        method,
        status: 'simulated_success',
        is_simulation: true,
      },
    };
  }

  // Memory fallback
  const existingActive = memoryStore.subscriptions.find(
    (s) =>
      s.user_id === userId &&
      s.status === 'active' &&
      new Date(s.expires_at).getTime() > Date.now()
  );
  if (existingActive) {
    throw new AppError(
      409,
      'ACTIVE_SUBSCRIPTION_EXISTS',
      'Pengguna sudah memiliki langganan Premium yang masih aktif.'
    );
  }

  const nowIso = now.toISOString();
  const subscription = {
    id: crypto.randomUUID(),
    user_id: userId,
    plan_id: plan.id,
    status: 'active',
    started_at: nowIso,
    expires_at: expiresAt.toISOString(),
    created_at: nowIso,
    updated_at: nowIso,
  };
  memoryStore.subscriptions.push(subscription);

  const payment = {
    id: crypto.randomUUID(),
    subscription_id: subscription.id,
    user_id: userId,
    plan_id: plan.id,
    method,
    amount_idr: plan.price_idr,
    status: 'simulated_success',
    transaction_code: `SIM-${Date.now()}`,
    is_simulation: true,
    paid_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
  memoryStore.payments_simulation.push(payment);

  return {
    subscription: { ...subscription, plan },
    payment,
  };
}

async function cancelActiveSubscription(userId) {
  const activeSub = await getActiveSubscriptionForUser(userId);
  if (!activeSub) {
    return null;
  }

  const nowIso = new Date().toISOString();
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', activeSub.id)
      .eq('user_id', userId)
      .select('*, plan:subscription_plans(*)')
      .single();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return {
      ...data,
      plan: normalizePlanRow(data.plan),
    };
  }

  const target = memoryStore.subscriptions.find((s) => s.id === activeSub.id);
  if (target) {
    target.status = 'cancelled';
    target.updated_at = nowIso;
  }
  return { ...target, plan: activeSub.plan };
}

async function listUserSubscriptionHistory(userId) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*, plan:subscription_plans(*), payment:payments_simulation(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return (data || []).map((s) => ({
      ...s,
      plan: normalizePlanRow(s.plan),
      is_simulation: true,
    }));
  }

  return memoryStore.subscriptions
    .filter((s) => s.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((s) => ({
      ...s,
      plan: memoryStore.subscription_plans.find((p) => p.id === s.plan_id) || null,
      payment:
        memoryStore.payments_simulation.find((p) => p.subscription_id === s.id) ||
        null,
    }));
}

// ============================================================================
// REPOSITORY: PHOTO SESSIONS & PHOTOS
// ============================================================================
function normalizeSessionRow(row, photos = []) {
  if (!row) return null;
  const meta = sessionRuntimeMeta.get(row.id) || {};
  const stripPath =
    row.strip_storage_path !== undefined
      ? row.strip_storage_path
      : row.strip_path || null;
  return {
    ...row,
    template_id: meta.logical_template_code || row.template_id,
    db_template_id: row.template_id,
    frame_id: row.frame_id !== undefined ? row.frame_id : meta.frame_id || null,
    applied_sticker_ids:
      row.applied_sticker_ids !== undefined
        ? row.applied_sticker_ids
        : meta.applied_sticker_ids || [],
    tier_at_session:
      row.tier_at_session !== undefined
        ? row.tier_at_session
        : meta.tier_at_session || 'free',
    strip_storage_path: stripPath,
    strip_path: stripPath,
    photos,
  };
}

async function createPhotoSession({
  user_id = null,
  template_id,
  logical_template_code = null,
  photo_count = 4,
  frame_id = null,
  filter_id = null,
  applied_sticker_ids = [],
  tier_at_session = 'free',
}) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('photo_sessions')
      .insert({
        user_id,
        template_id,
        filter_id,
        status: 'in_progress',
        photo_count: photo_count || 4,
      })
      .select('*')
      .single();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);

    sessionRuntimeMeta.set(data.id, {
      logical_template_code: logical_template_code || template_id,
      frame_id,
      applied_sticker_ids,
      tier_at_session,
      retakenPositions: new Set(),
    });

    return normalizeSessionRow(data, []);
  }

  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    user_id,
    template_id: logical_template_code || template_id,
    frame_id,
    filter_id,
    applied_sticker_ids,
    tier_at_session,
    photo_count: photo_count || 4,
    status: 'in_progress',
    strip_storage_path: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  memoryStore.photo_sessions.push(session);
  return { ...session };
}

async function findSessionById(id) {
  if (!id) return null;
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('photo_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    if (!data) return null;

    const { data: rawPhotos, error: photosErr } = await supabaseClient
      .from('photos')
      .select('*')
      .eq('session_id', id)
      .order('sequence', { ascending: true });
    if (photosErr) throw new AppError(500, 'DB_ERROR', photosErr.message);

    const meta = sessionRuntimeMeta.get(id) || {};
    const retakenSet = meta.retakenPositions || new Set();
    const photos = (rawPhotos || []).map((p) => ({
      ...p,
      position: p.position !== undefined ? p.position : p.sequence,
      is_retaken:
        p.is_retaken !== undefined
          ? p.is_retaken
          : retakenSet.has(p.sequence),
    }));

    return normalizeSessionRow(data, photos);
  }

  const session = memoryStore.photo_sessions.find((s) => s.id === id);
  if (!session) return null;
  const photos = memoryStore.photos
    .filter((p) => p.session_id === id)
    .sort((a, b) => a.position - b.position);
  return {
    ...session,
    photos: photos.map((p) => ({ ...p })),
  };
}

async function listSessionsByUser(userId) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('photo_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return (data || []).map((row) => normalizeSessionRow(row, []));
  }

  return memoryStore.photo_sessions
    .filter((s) => s.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((s) => ({ ...s }));
}

async function updatePhotoSession(id, updates) {
  if (supabaseClient) {
    const meta = sessionRuntimeMeta.get(id) || { retakenPositions: new Set() };
    if (updates.frame_id !== undefined) meta.frame_id = updates.frame_id;
    if (updates.applied_sticker_ids !== undefined) {
      meta.applied_sticker_ids = updates.applied_sticker_ids;
    }
    sessionRuntimeMeta.set(id, meta);

    const dbUpdates = {};
    if (updates.filter_id !== undefined) dbUpdates.filter_id = updates.filter_id;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.completed_at !== undefined) {
      dbUpdates.completed_at = updates.completed_at;
    }
    if (updates.strip_storage_path !== undefined) {
      dbUpdates.strip_path = updates.strip_storage_path;
    }

    if (Object.keys(dbUpdates).length > 0) {
      const { data, error } = await supabaseClient
        .from('photo_sessions')
        .update(dbUpdates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return normalizeSessionRow(data);
    }

    return findSessionById(id);
  }

  const session = memoryStore.photo_sessions.find((s) => s.id === id);
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Sesi foto tidak ditemukan.');
  Object.assign(session, updates, { updated_at: new Date().toISOString() });
  return { ...session };
}

async function upsertSessionPhoto({
  session_id,
  position,
  storage_path = null,
  is_retaken = false,
}) {
  if (supabaseClient) {
    const { data: existing } = await supabaseClient
      .from('photos')
      .select('*')
      .eq('session_id', session_id)
      .eq('sequence', position)
      .maybeSingle();

    const meta = sessionRuntimeMeta.get(session_id) || {
      retakenPositions: new Set(),
    };
    if (!meta.retakenPositions) meta.retakenPositions = new Set();

    if (existing) {
      meta.retakenPositions.add(position);
      sessionRuntimeMeta.set(session_id, meta);

      const { data, error } = await supabaseClient
        .from('photos')
        .update({
          storage_path:
            storage_path !== undefined ? storage_path : existing.storage_path,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw new AppError(500, 'DB_ERROR', error.message);
      return {
        ...data,
        position: data.sequence,
        is_retaken: true,
      };
    }

    if (is_retaken) {
      meta.retakenPositions.add(position);
      sessionRuntimeMeta.set(session_id, meta);
    }

    const { data, error } = await supabaseClient
      .from('photos')
      .insert({
        session_id,
        sequence: position,
        storage_path: storage_path || null,
        width: 1080,
        height: 760,
      })
      .select('*')
      .single();

    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return {
      ...data,
      position: data.sequence,
      is_retaken: Boolean(is_retaken),
    };
  }

  const now = new Date().toISOString();
  const existing = memoryStore.photos.find(
    (p) => p.session_id === session_id && p.position === position
  );
  if (existing) {
    existing.is_retaken = true;
    if (storage_path !== undefined) existing.storage_path = storage_path;
    existing.updated_at = now;
    return { ...existing };
  }

  const photo = {
    id: crypto.randomUUID(),
    session_id,
    position,
    storage_path,
    is_retaken: Boolean(is_retaken),
    created_at: now,
    updated_at: now,
  };
  memoryStore.photos.push(photo);
  return { ...photo };
}

// ============================================================================
// REPOSITORY: DOWNLOADS
// ============================================================================
async function createDownloadRecord({
  session_id,
  user_id = null,
  format,
  resolution,
}) {
  const nowIso = new Date().toISOString();
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('downloads')
      .insert({
        session_id,
        user_id,
        file_format: format,
        resolution,
        downloaded_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return {
      ...data,
      format: data.file_format || format,
    };
  }

  const download = {
    id: crypto.randomUUID(),
    session_id,
    user_id,
    format,
    file_format: format,
    resolution,
    downloaded_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
  memoryStore.downloads.push(download);
  return { ...download };
}

async function listDownloadsByUser(userId) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('downloads')
      .select(
        '*, session:photo_sessions(id, template_id, filter_id, strip_path, created_at)'
      )
      .eq('user_id', userId)
      .order('downloaded_at', { ascending: false });
    if (error) throw new AppError(500, 'DB_ERROR', error.message);
    return (data || []).map((d) => ({
      ...d,
      format: d.file_format || d.format || 'png',
    }));
  }

  return memoryStore.downloads
    .filter((d) => d.user_id === userId)
    .sort((a, b) => new Date(b.downloaded_at) - new Date(a.downloaded_at))
    .map((d) => {
      const s = memoryStore.photo_sessions.find((ps) => ps.id === d.session_id);
      return {
        ...d,
        session: s
          ? {
              id: s.id,
              template_id: s.template_id,
              filter_id: s.filter_id,
              strip_storage_path: s.strip_storage_path,
              created_at: s.created_at,
            }
          : null,
      };
    });
}

// ============================================================================
// SUPABASE STORAGE HELPERS (BRD Seksi 5.4 & SEC-05)
// Penamaan file deterministik: photo-strips/{user_id}/{session_id}.png
// ============================================================================
function buildDeterministicStripPath(userId, sessionId) {
  const ownerSegment = userId || 'guest';
  return `${env.SUPABASE_STRIPS_BUCKET}/${ownerSegment}/${sessionId}.png`;
}

function extractBucketObjectKey(storagePath) {
  const prefix = `${env.SUPABASE_STRIPS_BUCKET}/`;
  if (storagePath && storagePath.startsWith(prefix)) {
    return storagePath.slice(prefix.length);
  }
  return storagePath;
}

async function createSignedStripUploadUrl(userId, sessionId) {
  const fullStoragePath = buildDeterministicStripPath(userId, sessionId);
  const objectKey = extractBucketObjectKey(fullStoragePath);

  if (supabaseClient) {
    const { data, error } = await supabaseClient.storage
      .from(env.SUPABASE_STRIPS_BUCKET)
      .createSignedUploadUrl(objectKey, { upsert: true });

    if (error) {
      throw new AppError(
        500,
        'STORAGE_UPLOAD_URL_ERROR',
        `Gagal menerbitkan signed upload URL: ${error.message}`
      );
    }

    return {
      bucket: env.SUPABASE_STRIPS_BUCKET,
      storage_path: fullStoragePath,
      object_key: objectKey,
      signed_upload_url: data.signedUrl,
      token: data.token,
      expires_in: env.SIGNED_URL_TTL_SECONDS,
    };
  }

  const token = crypto.randomBytes(16).toString('hex');
  return {
    bucket: env.SUPABASE_STRIPS_BUCKET,
    storage_path: fullStoragePath,
    object_key: objectKey,
    signed_upload_url: `/api/sessions/${sessionId}/strip?token=${token}`,
    token,
    expires_in: env.SIGNED_URL_TTL_SECONDS,
  };
}

async function uploadStripBuffer(userId, sessionId, buffer, contentType = 'image/png') {
  const fullStoragePath = buildDeterministicStripPath(userId, sessionId);
  const objectKey = extractBucketObjectKey(fullStoragePath);

  if (supabaseClient) {
    const { error } = await supabaseClient.storage
      .from(env.SUPABASE_STRIPS_BUCKET)
      .upload(objectKey, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new AppError(
        500,
        'STORAGE_UPLOAD_ERROR',
        `Gagal mengunggah strip ke Supabase Storage: ${error.message}`
      );
    }
    return fullStoragePath;
  }

  memoryStore.storageObjects.set(fullStoragePath, {
    contentType,
    size: buffer.length,
    uploaded_at: new Date().toISOString(),
  });
  return fullStoragePath;
}

async function createSignedStripReadUrl(storagePath) {
  if (!storagePath) return null;
  const objectKey = extractBucketObjectKey(storagePath);

  if (supabaseClient) {
    const { data, error } = await supabaseClient.storage
      .from(env.SUPABASE_STRIPS_BUCKET)
      .createSignedUrl(objectKey, env.SIGNED_URL_TTL_SECONDS);

    if (error) {
      return null;
    }
    return {
      signed_url: data.signedUrl,
      expires_in: env.SIGNED_URL_TTL_SECONDS,
    };
  }

  const sig = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${storagePath}:${Date.now()}`)
    .digest('hex')
    .slice(0, 24);
  const expiresAt = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
  return {
    signed_url: `https://storage.photobooth.local/${storagePath}?token=${sig}&exp=${expiresAt}`,
    expires_in: env.SIGNED_URL_TTL_SECONDS,
  };
}

module.exports = {
  supabaseClient,
  isSupabaseConnected: Boolean(supabaseClient),
  resetMemoryStore,
  getActiveSubscriptionForUser,
  deriveUserTier,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  listActiveTemplates,
  findTemplateByIdOrCode,
  listActiveFilters,
  findFilterByIdOrCode,
  listActiveStickers,
  findStickersByIdsOrCodes,
  listActivePlans,
  findPlanByIdOrCode,
  createSimulatedSubscriptionAndPayment,
  cancelActiveSubscription,
  listUserSubscriptionHistory,
  createPhotoSession,
  findSessionById,
  listSessionsByUser,
  updatePhotoSession,
  upsertSessionPhoto,
  createDownloadRecord,
  listDownloadsByUser,
  buildDeterministicStripPath,
  createSignedStripUploadUrl,
  uploadStripBuffer,
  createSignedStripReadUrl,
};
