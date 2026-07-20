const express = require('express')
const router = express.Router();

const authController = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');

// Register Route
router.post('/register', authController.register);

// Login Route
router.post('/login', authController.login);

// Current User Route (restores a session from a stored token)
router.get('/me', protect, authController.getCurrentUser);

// Email Verification Route (clicked directly from the verification email)
router.get('/verify-email/:token', authController.verifyEmail);

// Resend Verification Email Route
router.post('/resend-verification', protect, authController.resendVerification);

// Update Banner Route
router.patch('/banner', protect, authController.updateBanner);

// Update Settings Route
router.patch('/settings', protect, authController.updateSettings);

// Delete Account Route
router.delete('/account', protect, authController.deleteAccount);

// export so that server.js can import
module.exports = router;