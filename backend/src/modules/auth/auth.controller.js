const authService = require('./auth.service');
const { sendSuccess, asyncHandler } = require('../../utils/response');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body || {});
  return sendSuccess(res, result, 201);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body || {});
  return sendSuccess(res, result, 200);
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    user: req.user,
    tier: req.user.tier,
    active_subscription: req.user.active_subscription,
  });
});

module.exports = {
  register,
  login,
  me,
};
