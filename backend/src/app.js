const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const db = require('./config/supabase');
const { sendSuccess } = require('./utils/response');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const sessionsRoutes = require('./modules/sessions/sessions.routes');
const subscriptionsRoutes = require('./modules/subscriptions/subscriptions.routes');
const subscriptionsController = require('./modules/subscriptions/subscriptions.controller');
const downloadsRoutes = require('./modules/downloads/downloads.routes');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Router modular REST API
const apiRouter = express.Router();

apiRouter.get('/health', (req, res) => {
  return sendSuccess(res, {
    service: 'photobooth-backend-api',
    version: '1.0.0',
    status: 'ok',
    database_mode: db.isSupabaseConnected ? 'supabase_postgres' : 'memory_simulation_fallback',
    is_simulation: true,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/catalog', catalogRoutes);
apiRouter.use('/sessions', sessionsRoutes);
apiRouter.get('/plans', subscriptionsController.getPlans);
apiRouter.use('/subscriptions', subscriptionsRoutes);
apiRouter.use('/downloads', downloadsRoutes);

// BRD 2.3: Komunikasi klien-server lewat REST API JSON di bawah /api dan /api/v1
app.use('/api', apiRouter);
app.use('/api/v1', apiRouter);

// Layani file statis & halaman Frontend PWA dari folder frontend/
const candidateFrontendDirs = [
  path.join(__dirname, '..', '..', 'frontend'),
  path.join(__dirname, '..', 'frontend'),
];
const frontendDir =
  candidateFrontendDirs.find((dir) => fs.existsSync(dir)) ||
  candidateFrontendDirs[0];
const frontendHtmlPath = path.join(frontendDir, 'aplikasi-photobooth.html');

if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// Peta rute halaman PWA sesuai BRD Seksi 3.2
const spaRoutes = [
  '/',
  '/template',
  '/kamera',
  '/camera',
  '/hasil',
  '/result',
  '/langganan',
  '/subscribe',
  '/akun',
  '/account',
  '/index.html',
];

spaRoutes.forEach((routePath) => {
  app.get(routePath, (req, res, next) => {
    if (fs.existsSync(frontendHtmlPath)) {
      return res.sendFile(frontendHtmlPath);
    }
    return next();
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
