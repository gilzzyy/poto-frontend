const subscriptionsService = require('./subscriptions.service');
const { sendSuccess, asyncHandler } = require('../../utils/response');

const getPlans = asyncHandler(async (req, res) => {
  const result = await subscriptionsService.getSimulationPlans();
  return sendSuccess(res, result);
});

const checkout = asyncHandler(async (req, res) => {
  const result = await subscriptionsService.checkoutSimulation(
    req.user,
    req.body || {}
  );
  return sendSuccess(res, result, 201);
});

const getMe = asyncHandler(async (req, res) => {
  const result = await subscriptionsService.getMySubscriptionStatus(req.user);
  return sendSuccess(res, result);
});

const cancel = asyncHandler(async (req, res) => {
  const result = await subscriptionsService.cancelMySubscription(req.user);
  return sendSuccess(res, result);
});

module.exports = {
  getPlans,
  checkout,
  getMe,
  cancel,
};
