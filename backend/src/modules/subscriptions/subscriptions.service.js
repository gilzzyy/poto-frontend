const db = require('../../config/supabase');
const { AppError } = require('../../utils/response');

const SIMULATION_LABEL =
  'SIMULASI / DUMMY - untuk tugas kuliah. Tidak ada pembayaran asli.';

const FORBIDDEN_PAYMENT_FIELDS = [
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'expiry',
  'expiration_date',
  'account_number',
  'accountNumber',
  'bank_account',
  'pin',
];

async function getSimulationPlans() {
  const plans = await db.listActivePlans();
  return {
    is_simulation: true,
    simulation_label: SIMULATION_LABEL,
    plans: plans.map((p) => ({
      ...p,
      is_simulation: true,
    })),
  };
}

async function checkoutSimulation(currentUser, body = {}) {
  // SEC-06: Sistem tidak menyediakan kolom dan tidak menerima nomor kartu/rekening asli
  for (const field of FORBIDDEN_PAYMENT_FIELDS) {
    if (body[field] !== undefined) {
      throw new AppError(
        400,
        'REAL_PAYMENT_DATA_FORBIDDEN',
        `Field "${field}" ditolak (SEC-06). Sistem simulasi tidak menerima nomor kartu, rekening, atau kredensial pembayaran asli.`
      );
    }
  }

  const planKey = body.plan_code || body.plan_id || body.plan;
  if (!planKey) {
    throw new AppError(
      400,
      'PLAN_REQUIRED',
      "Pilih paket simulasi terlebih dahulu ('monthly' atau 'yearly')."
    );
  }

  const plan = await db.findPlanByIdOrCode(planKey);
  if (!plan) {
    throw new AppError(
      404,
      'PLAN_NOT_FOUND',
      `Paket langganan "${planKey}" tidak ditemukan.`
    );
  }

  const rawMethod = String(body.method || body.payment_method || 'qris')
    .trim()
    .toLowerCase();
  const methodMap = {
    qris: 'qris',
    qris_dummy: 'qris',
    ewallet: 'ewallet',
    ewallet_dummy: 'ewallet',
    'e-wallet': 'ewallet',
    card: 'card',
    card_dummy: 'card',
    kartu: 'card',
    transfer_dummy: 'card',
    bank_transfer: 'card',
  };
  const normalizedMethod = methodMap[rawMethod] || rawMethod;

  if (!['qris', 'ewallet', 'card'].includes(normalizedMethod)) {
    throw new AppError(
      400,
      'INVALID_PAYMENT_METHOD',
      "Metode pembayaran dummy harus salah satu dari: 'qris', 'ewallet', atau 'card'."
    );
  }

  // BE-13: Idempotensi checkout simulasi - cegah dua langganan aktif tumpang tindih
  const existingActive = await db.getActiveSubscriptionForUser(currentUser.id);
  if (existingActive) {
    throw new AppError(
      409,
      'ACTIVE_SUBSCRIPTION_EXISTS',
      'Anda sudah memiliki langganan Premium simulasi yang masih aktif. Gunakan tombol Berhenti Langganan (reset demo) terlebih dahulu bila ingin mengganti paket.'
    );
  }

  const { subscription, payment } =
    await db.createSimulatedSubscriptionAndPayment({
      userId: currentUser.id,
      plan,
      method: normalizedMethod,
    });

  return {
    is_simulation: true,
    simulation_label: SIMULATION_LABEL,
    tier: 'premium',
    subscription: {
      ...subscription,
      is_simulation: true,
    },
    payment: {
      ...payment,
      is_simulation: true,
    },
  };
}

async function getMySubscriptionStatus(currentUser) {
  const [{ tier, activeSubscription }, history] = await Promise.all([
    db.deriveUserTier(currentUser.id),
    db.listUserSubscriptionHistory(currentUser.id),
  ]);

  return {
    is_simulation: true,
    simulation_label: SIMULATION_LABEL,
    tier,
    active_subscription: activeSubscription
      ? {
          ...activeSubscription,
          is_simulation: true,
        }
      : null,
    history: history.map((h) => ({
      ...h,
      is_simulation: true,
    })),
  };
}

async function cancelMySubscription(currentUser) {
  const cancelled = await db.cancelActiveSubscription(currentUser.id);
  if (!cancelled) {
    throw new AppError(
      400,
      'NO_ACTIVE_SUBSCRIPTION',
      'Tidak ada langganan Premium aktif yang dapat dihentikan.'
    );
  }

  return {
    is_simulation: true,
    simulation_label: SIMULATION_LABEL,
    tier: 'free',
    cancelled_subscription: {
      ...cancelled,
      is_simulation: true,
    },
    message:
      'Langganan simulasi berhasil dihentikan (reset demo). Status tier kembali ke Free, dan riwayat tetap tersimpan.',
  };
}

module.exports = {
  getSimulationPlans,
  checkoutSimulation,
  getMySubscriptionStatus,
  cancelMySubscription,
};
