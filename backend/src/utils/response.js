class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ data });
}

function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

module.exports = {
  AppError,
  sendSuccess,
  sendError,
  asyncHandler,
  isValidUuid,
};
