const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/supabase');
const { AppError } = require('../utils/response');

function signJwtToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
    }
  );
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new AppError(
      401,
      'INVALID_AUTH_HEADER',
      'Format header Authorization harus: Bearer <JWT>.'
    );
  }
  return parts[1];
}

async function resolveUserFromToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError(
        401,
        'TOKEN_EXPIRED',
        'Sesi login (JWT) telah kedaluwarsa. Silakan login kembali.'
      );
    }
    throw new AppError(
      401,
      'INVALID_TOKEN',
      'Token autentikasi (JWT) tidak valid.'
    );
  }

  const user = await db.findUserById(payload.sub);
  if (!user || !user.is_active) {
    throw new AppError(
      401,
      'USER_UNAUTHORIZED',
      'Akun pengguna tidak ditemukan atau tidak aktif.'
    );
  }

  // BE-11: Tier diturunkan langsung dari tabel subscriptions aktif di server
  const { tier, activeSubscription } = await db.deriveUserTier(user.id);

  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_path: user.avatar_path,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
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
  };
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Endpoint ini membutuhkan autentikasi. Sertakan header Authorization: Bearer <JWT>.'
      );
    }
    req.user = await resolveUserFromToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      req.user = null;
      return next();
    }
    req.user = await resolveUserFromToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  signJwtToken,
  requireAuth,
  optionalAuth,
};
