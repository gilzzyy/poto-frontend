const bcrypt = require('bcryptjs');
const db = require('../../config/supabase');
const { signJwtToken } = require('../../middlewares/auth.middleware');
const { AppError } = require('../../utils/response');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUserResponse(user, tier = 'free', activeSubscription = null) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_path: user.avatar_path || null,
    is_active: user.is_active,
    tier,
    active_subscription: activeSubscription
      ? {
          id: activeSubscription.id,
          plan_code: activeSubscription.plan?.code || null,
          plan_name: activeSubscription.plan?.name || null,
          status: activeSubscription.status,
          started_at: activeSubscription.started_at,
          expires_at: activeSubscription.expires_at,
          is_simulation: true,
        }
      : null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function register({ email, password, display_name }) {
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    throw new AppError(400, 'INVALID_EMAIL', 'Format alamat email tidak valid.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new AppError(
      400,
      'INVALID_PASSWORD',
      'Password wajib diisi minimal 6 karakter.'
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.findUserByEmail(normalizedEmail);
  if (existing) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email sudah terdaftar.');
  }

  // SEC-01: Hash password menggunakan bcrypt
  const password_hash = await bcrypt.hash(password, 10);
  const cleanDisplayName =
    display_name && String(display_name).trim()
      ? String(display_name).trim()
      : normalizedEmail.split('@')[0];

  const user = await db.createUser({
    email: normalizedEmail,
    password_hash,
    display_name: cleanDisplayName,
  });

  const token = signJwtToken(user);
  return {
    token,
    access_token: token,
    user: sanitizeUserResponse(user, 'free', null),
  };
}

async function login({ email, password }) {
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Email dan password wajib diisi.'
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.findUserByEmail(normalizedEmail);
  if (!user || !user.is_active) {
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Email atau password salah.'
    );
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Email atau password salah.'
    );
  }

  // BE-11: Hitung tier resmi dari langganan aktif
  const { tier, activeSubscription } = await db.deriveUserTier(user.id);
  const token = signJwtToken(user);

  return {
    token,
    access_token: token,
    user: sanitizeUserResponse(user, tier, activeSubscription),
  };
}

module.exports = {
  register,
  login,
  sanitizeUserResponse,
};
