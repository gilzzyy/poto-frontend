const express = require('express');
const subscriptionsController = require('./subscriptions.controller');
const { requireAuth } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/plans', subscriptionsController.getPlans);
router.post('/checkout', requireAuth, subscriptionsController.checkout);
router.get('/me', requireAuth, subscriptionsController.getMe);
router.post('/cancel', requireAuth, subscriptionsController.cancel);

module.exports = router;
