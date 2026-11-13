const { sendError } = require('../utils/response');

function notFoundHandler(req, res) {
  return sendError(
    res,
    404,
    'ENDPOINT_NOT_FOUND',
    `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`
  );
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err && err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Body JSON tidak valid.');
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const message =
    err.isOperational || statusCode < 500
      ? err.message
      : 'Terjadi kesalahan internal pada server.';

  return sendError(res, statusCode, code, message);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
