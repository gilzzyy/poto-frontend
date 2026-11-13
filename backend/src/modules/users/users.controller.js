const usersService = require('./users.service');
const { sendSuccess, asyncHandler } = require('../../utils/response');

const getMe = asyncHandler(async (req, res) => {
  const profile = await usersService.getMyProfile(req.user);
  return sendSuccess(res, { user: profile });
});

const updateMe = asyncHandler(async (req, res) => {
  const profile = await usersService.updateMyProfile(req.user, req.body || {});
  return sendSuccess(res, { user: profile });
});

module.exports = {
  getMe,
  updateMe,
};
